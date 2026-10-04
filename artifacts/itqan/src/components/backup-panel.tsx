import { useRef, useState } from 'react';
import { ArrowDownToLine, Upload, ShieldCheck, CircleAlert, LoaderCircle } from 'lucide-react';
import { useWorkspace } from '@/state/workspace';
import { allFiles } from '@/lib/db';
import { buildBackup, readBackup, type RestorePreview } from '@/lib/backup';
import { downloadBlob, formatBytes } from '@/lib/util';

export function BackupPanel({ allowExport = true }: { allowExport?: boolean }) {
  const { ws, replaceWorkspace, flash } = useWorkspace();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'export' | 'read' | 'restore' | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [ack, setAck] = useState(false);

  const doExport = async () => {
    setBusy('export'); setError('');
    try {
      const blob = await buildBackup(ws, await allFiles());
      const stamp = new Date().toISOString().slice(0, 10);
      const name = `itqan-backup-${stamp}.zip`;
      const file = new File([blob], name, { type: 'application/zip' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] }) && window.matchMedia('(pointer:coarse)').matches) {
        try { await navigator.share({ files: [file], title: 'نسخة إتقان الاحتياطية' }); flash('اختر مكان حفظ النسخة من نافذة المشاركة'); return; }
        catch (e) { if ((e as Error).name === 'AbortError') return; }
      }
      downloadBlob(blob, name);
      flash(`جُهزت النسخة (${formatBytes(blob.size)}). احفظها حيث تشاء.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر إنشاء النسخة'); }
    finally { setBusy(null); }
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy('read'); setError(''); setPreview(null); setAck(false);
    try { setPreview(await readBackup(f)); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر قراءة النسخة'); }
    finally { setBusy(null); if (input.current) input.current.value = ''; }
  };

  const restore = async () => {
    if (!preview) return;
    setBusy('restore'); setError('');
    try { await replaceWorkspace(preview.workspace, preview.files); setPreview(null); flash('استُعيدت النسخة بالكامل.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'فشل الاستعادة؛ لم يتغير شيء.'); }
    finally { setBusy(null); }
  };

  const rows: [string, number, number][] = preview ? [
    ['مصادر', ws.sources.length, preview.counts.sources], ['مقاطع نصية', ws.segments.length, preview.counts.segments], ['مفاهيم', ws.concepts.length, preview.counts.concepts],
    ['علاقات', ws.relations.length, preview.counts.relations], ['أسئلة', ws.questions.length, preview.counts.questions], ['أدلة', ws.evidence.length, preview.counts.evidence],
  ] : [];

  return <div className="backup-panel">
    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
      {allowExport && <button className="button button-primary" onClick={doExport} disabled={!!busy} data-testid="button-export-backup">{busy === 'export' ? <LoaderCircle size={15} className="spin" /> : <ArrowDownToLine size={15} />} تنزيل نسخة كاملة (ZIP)</button>}
      <button className="button button-secondary" onClick={() => input.current?.click()} disabled={!!busy} data-testid="button-import-backup">{busy === 'read' ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />} استعادة من نسخة</button>
      <input ref={input} type="file" accept=".zip,application/zip,.json,application/json" hidden onChange={e => pick(e.target.files?.[0])} data-testid="input-import-backup" />
    </div>
    {error && <div className="notice notice-danger" role="alert" style={{ marginTop: 12 }} data-testid="status-backup-error"><CircleAlert size={14} /> {error} <b>لم يتغير شيء في بياناتك الحالية.</b></div>}
    {preview && <div className="restore-preview card" data-testid="panel-restore-preview">
      <div className="setting-title" style={{ fontSize: 15 }}>معاينة قبل الاستبدال</div>
      <p className="setting-copy" style={{ marginBottom: 10 }}>{preview.kind === 'zip' ? `نسخة سليمة أُنشئت ${preview.createdAt ? new Date(preview.createdAt).toLocaleString('ar') : ''}، تحققتُ من بصمات ملفاتها وإحالاتها.` : 'ملف JSON من الإصدار السابق.'} الاستعادة <b>تستبدل</b> كل ما في هذا الجهاز.</p>
      <table className="compare-table"><thead><tr><th>العنصر</th><th>الحالي</th><th>بعد الاستعادة</th></tr></thead><tbody>{rows.map(([l, a, b]) => <tr key={l}><td>{l}</td><td>{a}</td><td>{b}</td></tr>)}<tr><td>ملفات أصلية</td><td>—</td><td>{preview.counts.files} ({formatBytes(preview.counts.bytes)})</td></tr></tbody></table>
      {preview.notes.map(n => <div className="tag" style={{ display: 'inline-block', margin: '8px 0 0 6px' }} key={n}>{n}</div>)}
      <label className="check-row" style={{ marginTop: 12 }}><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} data-testid="checkbox-restore-ack" /> أفهم أن بياناتي الحالية على هذا الجهاز ستُستبدل. (نزّل نسخة منها أولًا إن أردت الاحتفاظ بها.)</label>
      <div className="form-actions"><button className="button button-danger-solid" disabled={!ack || busy === 'restore'} onClick={restore} data-testid="button-confirm-restore">{busy === 'restore' ? <LoaderCircle size={15} className="spin" /> : <ShieldCheck size={15} />} استبدل واستعد</button><button className="button button-secondary" onClick={() => setPreview(null)} data-testid="button-cancel-restore">إلغاء</button></div>
    </div>}
  </div>;
}
