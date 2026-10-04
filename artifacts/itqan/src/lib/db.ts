import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { StoredFile, Workspace } from './types';

interface ItqanDB extends DBSchema {
  workspace: { key: string; value: { key: string; savedAt: string; data: Workspace } };
  files: { key: string; value: StoredFile };
}

let dbPromise: Promise<IDBPDatabase<ItqanDB>> | null = null;

export class StorageError extends Error {
  constructor(message: string, readonly cause?: unknown) { super(message); this.name = 'StorageError'; }
}

function describe(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'QuotaExceededError') return 'نفدت مساحة التخزين المتاحة للمتصفح.';
    if (err.name === 'InvalidStateError' || err.name === 'SecurityError') return 'المتصفح يمنع التخزين المحلي (قد تكون في وضع التصفح الخاص).';
    return `${err.name}: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

export function getDB() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new StorageError('IndexedDB غير متاح في هذا المتصفح.'));
  if (!dbPromise) {
    dbPromise = openDB<ItqanDB>('itqan', 1, {
      upgrade(db) {
        db.createObjectStore('workspace', { keyPath: 'key' });
        db.createObjectStore('files', { keyPath: 'id' });
      },
      blocked() { /* another tab holds an older version */ },
    }).catch(err => { dbPromise = null; throw new StorageError(`تعذر فتح التخزين المحلي: ${describe(err)}`, err); });
  }
  return dbPromise;
}

export type LoadResult = { status: 'empty' } | { status: 'ok'; data: unknown };

export async function loadWorkspaceRaw(): Promise<LoadResult> {
  const db = await getDB();
  const row = await db.get('workspace', 'main');
  return row ? { status: 'ok', data: row.data } : { status: 'empty' };
}

export async function saveWorkspace(data: Workspace) {
  try {
    const db = await getDB();
    await db.put('workspace', { key: 'main', savedAt: new Date().toISOString(), data });
  } catch (err) {
    throw new StorageError(`تعذر الحفظ: ${describe(err)}`, err);
  }
}

export async function putFile(file: StoredFile) {
  try { const db = await getDB(); await db.put('files', file); }
  catch (err) { throw new StorageError(`تعذر حفظ الملف محليًا: ${describe(err)}`, err); }
}

export async function getFile(id: string) {
  const db = await getDB();
  return db.get('files', id);
}

export async function listFileMeta(): Promise<Omit<StoredFile, 'blob'>[]> {
  const db = await getDB();
  const all = await db.getAll('files');
  return all.map(({ blob: _b, ...meta }) => meta);
}

export async function allFiles() {
  const db = await getDB();
  return db.getAll('files');
}

export async function deleteFiles(ids: string[]) {
  if (!ids.length) return;
  const db = await getDB();
  const tx = db.transaction('files', 'readwrite');
  await Promise.all([...ids.map(id => tx.store.delete(id)), tx.done]);
}

/** Atomically replace the entire workspace and all files in a single transaction. */
export async function replaceAll(data: Workspace, files: StoredFile[]) {
  try {
    const db = await getDB();
    const tx = db.transaction(['workspace', 'files'], 'readwrite');
    const fs = tx.objectStore('files'), ws = tx.objectStore('workspace');
    await fs.clear();
    for (const f of files) await fs.put(f);
    await ws.put({ key: 'main', savedAt: new Date().toISOString(), data });
    await tx.done;
  } catch (err) {
    throw new StorageError(`فشل الاستبدال ولم يتغير شيء: ${describe(err)}`, err);
  }
}

/** Save workspace and remove files no longer referenced, in one transaction. */
export async function saveWorkspaceAndPrune(data: Workspace, removeFileIds: string[]) {
  try {
    const db = await getDB();
    const tx = db.transaction(['workspace', 'files'], 'readwrite');
    for (const id of removeFileIds) await tx.objectStore('files').delete(id);
    await tx.objectStore('workspace').put({ key: 'main', savedAt: new Date().toISOString(), data });
    await tx.done;
  } catch (err) {
    throw new StorageError(`تعذر الحفظ: ${describe(err)}`, err);
  }
}

export async function storageInfo() {
  const nav = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  let usage: number | undefined, quota: number | undefined, persisted: boolean | undefined;
  try { const e = await nav?.estimate?.(); usage = e?.usage; quota = e?.quota; } catch { /* unsupported */ }
  try { persisted = await nav?.persisted?.(); } catch { /* unsupported */ }
  return { usage, quota, persisted, canPersist: !!nav?.persist };
}

export async function requestPersistence() {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
