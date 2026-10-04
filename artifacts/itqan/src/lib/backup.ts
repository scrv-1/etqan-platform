import { unzip, zip, strToU8, strFromU8, type Unzipped } from 'fflate';
import type { StoredFile, Workspace } from './types';
import { LIMITS } from './types';
import { checkIntegrity, validateWorkspaceShape } from './validate';
import { isLegacyStore, migrateLegacy } from './migration';
import { sha256 } from './util';

export const BACKUP_FORMAT = 'itqan-backup';
export const BACKUP_VERSION = 1;

type Manifest = {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  workspaceSha256: string;
  files: { id: string; name: string; mime: string; size: number; sha256: string; path: string; createdAt: string }[];
};

export async function buildBackup(ws: Workspace, files: StoredFile[]): Promise<Blob> {
  const referenced = new Set(ws.sources.map(s => s.fileId).filter(Boolean) as string[]);
  const used = files.filter(f => referenced.has(f.id));
  const missing = [...referenced].filter(id => !used.some(f => f.id === id));
  if (missing.length) throw new Error(`لا يمكن إنشاء نسخة كاملة: ${missing.length} ملف أصلي مفقود من التخزين المحلي.`);
  const wsJson = JSON.stringify(ws);
  const entries: Record<string, Uint8Array> = { 'workspace.json': strToU8(wsJson) };
  const manifest: Manifest = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), workspaceSha256: await sha256(wsJson), files: [] };
  for (const f of used) {
    const bytes = new Uint8Array(await f.blob.arrayBuffer());
    const path = `files/${f.id}`;
    entries[path] = bytes;
    manifest.files.push({ id: f.id, name: f.name, mime: f.mime, size: bytes.byteLength, sha256: await sha256(bytes), path, createdAt: f.createdAt });
  }
  entries['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  const data = await new Promise<Uint8Array>((res, rej) => zip(entries, { level: 6 }, (err, out) => (err ? rej(err) : res(out))));
  return new Blob([data as BlobPart], { type: 'application/zip' });
}

export type RestorePreview = {
  workspace: Workspace;
  files: StoredFile[];
  createdAt?: string;
  kind: 'zip' | 'legacy-json';
  counts: { sources: number; segments: number; concepts: number; relations: number; questions: number; evidence: number; files: number; bytes: number };
  notes: string[];
};

function countsOf(ws: Workspace, files: StoredFile[]) {
  return { sources: ws.sources.length, segments: ws.segments.length, concepts: ws.concepts.length, relations: ws.relations.length, questions: ws.questions.length, evidence: ws.evidence.length, files: files.length, bytes: files.reduce((a, f) => a + f.size, 0) };
}

/** Parse and fully validate a backup. Never touches storage. Throws a readable error on any problem. */
/** Strict check of manifest file entries: types, sizes, unique ids/paths, safe paths. */
export function validateManifestFiles(files: unknown): asserts files is Manifest['files'] {
  if (!Array.isArray(files)) throw new Error('قائمة الملفات في النسخة غير صالحة.');
  if (files.length > LIMITS.backupFiles) throw new Error('عدد الملفات في النسخة يتجاوز الحد.');
  const ids = new Set<string>(), paths = new Set<string>();
  files.forEach((m: unknown, i) => {
    const bad = (why: string) => new Error(`مدخل الملف رقم ${i + 1} في manifest غير صالح: ${why}`);
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw bad('ليس كائنًا');
    const e = m as Record<string, unknown>;
    for (const k of ['id', 'name', 'mime', 'sha256', 'path', 'createdAt']) if (typeof e[k] !== 'string' || !(e[k] as string)) throw bad(`الحقل ${k}`);
    if (!Number.isInteger(e.size) || (e.size as number) < 0 || (e.size as number) > LIMITS.fileBytes) throw bad('الحجم');
    if (!/^[0-9a-f]{64}$/.test(e.sha256 as string)) throw bad('البصمة');
    if (e.path !== `files/${e.id as string}` || /[\\/]\.\.|\.\.[\\/]/.test(e.path as string)) throw bad('المسار');
    if (ids.has(e.id as string)) throw bad('معرّف مكرر');
    if (paths.has(e.path as string)) throw bad('مسار مكرر');
    ids.add(e.id as string); paths.add(e.path as string);
  });
}

export async function readBackup(file: File): Promise<RestorePreview> {
  if (file.size > LIMITS.backupBytes) throw new Error('حجم النسخة يتجاوز الحد المسموح (400 م.ب).');
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  if (!isZip) {
    // Older JSON export (schema 1) — migrate for preview only.
    let parsed: unknown;
    try { parsed = JSON.parse(await file.text()); } catch { throw new Error('الملف ليس نسخة إتقان: لا هو ZIP ولا JSON صالح.'); }
    if (!isLegacyStore(parsed)) throw new Error('ملف JSON غير متوافق مع صيغة إتقان القديمة.');
    const r = migrateLegacy(parsed);
    return { workspace: r.workspace, files: [], kind: 'legacy-json', counts: countsOf(r.workspace, []), notes: ['نسخة قديمة بصيغة JSON بلا ملفات؛ ستُحوّل للصيغة الجديدة.', ...r.dropped.map(d => `لن يُنقل: ${d}`)] };
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  let total = 0, count = 0, tooBig = false;
  const unzipped = await new Promise<Unzipped>((res, rej) => unzip(buf, {
    filter: f => {
      count++; total += f.originalSize;
      if (count > LIMITS.backupFiles || total > LIMITS.backupBytes * 2 || f.originalSize > LIMITS.fileBytes * 1.2 + 60 * 1024 * 1024) { tooBig = true; return false; }
      return f.name === 'manifest.json' || f.name === 'workspace.json' || f.name.startsWith('files/');
    },
  }, (err, out) => (err ? rej(new Error('ملف ZIP تالف أو غير مكتمل.')) : res(out))));
  if (tooBig) throw new Error('محتوى النسخة يتجاوز حدود الحجم أو عدد الملفات؛ رفضت قراءته حماية للجهاز.');
  if (!unzipped['manifest.json'] || !unzipped['workspace.json']) throw new Error('النسخة تفتقد manifest.json أو workspace.json.');
  let manifest: Manifest, ws: unknown;
  try { manifest = JSON.parse(strFromU8(unzipped['manifest.json'])); } catch { throw new Error('ملف manifest.json تالف.'); }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('ملف manifest.json غير صالح.');
  if (manifest.format !== BACKUP_FORMAT) throw new Error('هذه ليست نسخة احتياطية من إتقان.');
  if (!Number.isInteger(manifest.version) || manifest.version < 1) throw new Error('إصدار نسخة غير معروف.');
  if (manifest.version !== BACKUP_VERSION) throw new Error(`النسخة من إصدار ${String(manifest.version)} لا يدعمه هذا التطبيق (المدعوم ${BACKUP_VERSION}). حدّث التطبيق أولًا.`);
  if (typeof manifest.workspaceSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.workspaceSha256)) throw new Error('بصمة المساحة في manifest.json غير صالحة.');
  if (typeof manifest.createdAt !== 'string') throw new Error('تاريخ النسخة مفقود.');
  validateManifestFiles(manifest.files);
  const wsText = strFromU8(unzipped['workspace.json']);
  if ((await sha256(wsText)) !== manifest.workspaceSha256) throw new Error('بيانات المساحة لا تطابق بصمتها؛ الملف معدّل أو تالف.');
  try { ws = JSON.parse(wsText); } catch { throw new Error('ملف workspace.json تالف.'); }
  const shape = validateWorkspaceShape(ws);
  if (shape.length) throw new Error(`بنية البيانات غير صالحة: ${shape.slice(0, 3).join('، ')}`);
  const workspace = ws as Workspace;
  const files: StoredFile[] = [];
  for (const m of manifest.files) {
    const bytes = unzipped[m.path];
    if (!bytes) throw new Error(`الملف «${m.name}» مذكور في النسخة لكنه مفقود.`);
    if (bytes.byteLength !== m.size || bytes.byteLength > LIMITS.fileBytes) throw new Error(`حجم الملف «${m.name}» غير صحيح.`);
    if ((await sha256(bytes)) !== m.sha256) throw new Error(`الملف «${m.name}» تالف (البصمة لا تطابق).`);
    files.push({ id: m.id, name: m.name, mime: m.mime, size: m.size, sha256: m.sha256, createdAt: m.createdAt, blob: new Blob([bytes as BlobPart], { type: m.mime }) });
  }
  const integrity = checkIntegrity(workspace, new Set(files.map(f => f.id)));
  if (integrity.length) throw new Error(`سلامة الإحالات غير متحققة: ${integrity.slice(0, 3).join('، ')}`);
  return { workspace, files, createdAt: manifest.createdAt, kind: 'zip', counts: countsOf(workspace, files), notes: [] };
}
