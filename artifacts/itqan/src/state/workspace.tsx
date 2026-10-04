import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { StoredFile, Workspace } from '@/lib/types';
import { createSeed } from '@/lib/seed';
import { listFileMeta, deleteFiles, loadWorkspaceRaw, replaceAll, saveWorkspaceAndPrune } from '@/lib/db';
import { checkIntegrity, validateWorkspaceShape } from '@/lib/validate';
import { readLegacy, migrateLegacy, type MigrationReport } from '@/lib/migration';
import { applyCascade, type Target } from '@/lib/cascade';

export type Boot =
  | { phase: 'loading' }
  | { phase: 'storage-error'; message: string }
  | { phase: 'corrupt'; problems: string[]; raw: unknown }
  | { phase: 'migrate'; report: MigrationReport; raw: string }
  | { phase: 'legacy-invalid'; raw: string }
  | { phase: 'ready' };

type SaveState = { status: 'idle' | 'saving' | 'error'; message?: string; lastSavedAt?: string };

type Ctx = {
  ws: Workspace;
  boot: Boot;
  save: SaveState;
  update: (fn: (w: Workspace) => Workspace) => void;
  cascadeDelete: (t: Target) => void;
  replaceWorkspace: (w: Workspace, files: StoredFile[]) => Promise<void>;
  confirmMigration: () => Promise<void>;
  startFresh: (sample: boolean) => Promise<void>;
  retryBoot: () => void;
  retrySave: () => void;
  notice: string;
  flash: (s: string) => void;
};

const WorkspaceContext = createContext<Ctx | null>(null);

export function useWorkspace() {
  const c = useContext(WorkspaceContext);
  if (!c) throw new Error('useWorkspace outside provider');
  return c;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [ws, setWs] = useState<Workspace>(() => createSeed());
  const [boot, setBoot] = useState<Boot>({ phase: 'loading' });
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  const [notice, setNotice] = useState('');
  const [bootKey, setBootKey] = useState(0);
  const hydrated = useRef<Workspace | null>(null);
  const latest = useRef<Workspace | null>(null);
  const dirty = useRef(false);
  const running = useRef(false);
  const prune = useRef<string[]>([]);
  const flushPromise = useRef<Promise<void> | null>(null);
  const replacing = useRef(false);
  const noticeTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((s: string) => {
    setNotice(s);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3600);
  }, []);

  // Boot: IndexedDB first, then explicit legacy migration. Never overwrite unreadable data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBoot({ phase: 'loading' });
      try {
        const res = await loadWorkspaceRaw();
        if (cancelled) return;
        if (res.status === 'ok') {
          const problems = validateWorkspaceShape(res.data);
          const integrity = problems.length ? [] : checkIntegrity(res.data as Workspace);
          if (problems.length || integrity.length) { setBoot({ phase: 'corrupt', problems: [...problems, ...integrity].slice(0, 8), raw: res.data }); return; }
          const data = res.data as Workspace;
          // Before the app becomes interactive (so no ingestion/import can be writing), remove stored
          // files that no source references and that are older than 10 minutes — leftovers from a save
          // that failed after its file write. Failures here are ignored; nothing referenced is touched.
          try {
            const referenced = new Set(data.sources.map(s => s.fileId).filter(Boolean));
            const cutoff = Date.now() - 10 * 60 * 1000;
            const meta = await listFileMeta();
            await deleteFiles(meta.filter(m => !referenced.has(m.id) && Date.parse(m.createdAt) < cutoff).map(m => m.id));
          } catch { /* best effort */ }
          if (cancelled) return;
          hydrated.current = data;
          setWs(data);
          setBoot({ phase: 'ready' });
          return;
        }
        const legacy = readLegacy();
        if (legacy.status === 'valid') { setBoot({ phase: 'migrate', report: migrateLegacy(legacy.store), raw: legacy.raw }); return; }
        if (legacy.status === 'invalid') { setBoot({ phase: 'legacy-invalid', raw: legacy.raw }); return; }
        const seed = createSeed();
        setWs(seed);
        hydrated.current = null; // persist the sample on first render so reloads are stable
        setBoot({ phase: 'ready' });
      } catch (err) {
        if (!cancelled) setBoot({ phase: 'storage-error', message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => { cancelled = true; };
  }, [bootKey]);

  const flush = useCallback((): Promise<void> => {
    if (running.current && flushPromise.current) return flushPromise.current;
    running.current = true;
    const p = (async () => {
    try {
      while (dirty.current && latest.current) {
        dirty.current = false;
        const data = latest.current, rm = prune.current;
        prune.current = [];
        setSave(s => ({ ...s, status: 'saving' }));
        try {
          await saveWorkspaceAndPrune(data, rm);
          setSave({ status: 'idle', lastSavedAt: new Date().toISOString() });
        } catch (err) {
          prune.current = [...rm, ...prune.current];
          dirty.current = true;
          setSave({ status: 'error', message: err instanceof Error ? err.message : 'تعذر الحفظ' });
          break;
        }
      }
    } finally { running.current = false; flushPromise.current = null; }
    })();
    flushPromise.current = p;
    return p;
  }, []);

  // Serialised, coalescing persistence — only the newest state is written; writes never overlap.
  useEffect(() => {
    if (boot.phase !== 'ready') return;
    if (ws === hydrated.current || replacing.current) return;
    latest.current = ws;
    dirty.current = true;
    void flush();
  }, [ws, boot.phase, flush]);

  const update = useCallback((fn: (w: Workspace) => Workspace) => {
    if (replacing.current) return; // the workspace is being replaced wholesale; ignore stale edits
    setWs(w => fn(w));
  }, []);

  const cascadeDelete = useCallback((t: Target) => {
    if (replacing.current) return;
    setWs(w => {
      const { next, removedFiles } = applyCascade(w, t);
      prune.current.push(...removedFiles);
      return next;
    });
  }, []);

  const replaceWorkspace = useCallback(async (next: Workspace, files: StoredFile[]) => {
    if (replacing.current) throw new Error('عملية استبدال أخرى جارية.');
    replacing.current = true;
    try {
      // Drain any in-flight write so an older state cannot land after the replacement.
      dirty.current = false;
      if (flushPromise.current) await flushPromise.current;
      dirty.current = false;
      await replaceAll(next, files); // single transaction; throws without changing anything on failure
    } catch (err) {
      replacing.current = false;
      throw err;
    }
    hydrated.current = next;
    latest.current = next;
    dirty.current = false;
    prune.current = [];
    setWs(next);
    setSave({ status: 'idle', lastSavedAt: new Date().toISOString() });
    setBoot({ phase: 'ready' });
    replacing.current = false;
  }, []);

  const confirmMigration = useCallback(async () => {
    if (boot.phase !== 'migrate') return;
    await replaceWorkspace(boot.report.workspace, []);
    flash('نُقلت بياناتك إلى التخزين الجديد. النسخة القديمة باقية في المتصفح كما هي.');
  }, [boot, replaceWorkspace, flash]);

  const startFresh = useCallback(async (sample: boolean) => {
    const base = createSeed();
    await replaceWorkspace(sample ? base : { ...base, sample: false, sources: [], segments: [], concepts: [], relations: [], questions: [], evidence: [] }, []);
  }, [replaceWorkspace]);

  const value: Ctx = {
    ws, boot, save, update, cascadeDelete, replaceWorkspace, confirmMigration, startFresh, notice, flash,
    retryBoot: () => setBootKey(k => k + 1),
    retrySave: () => { if (replacing.current) return; dirty.current = true; void flush(); },
  };
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
