import { useState, type ReactNode } from 'react';
import { ArrowDownToLine, CircleAlert, DatabaseZap, LoaderCircle, RotateCcw, ArrowLeftRight } from 'lucide-react';
import { useWorkspace } from '@/state/workspace';
import { BackupPanel } from './backup-panel';
import { downloadBlob } from '@/lib/util';
import { LEGACY_KEY } from '@/lib/migration';

function Frame({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return <div className="gate" dir="rtl"><div className="gate-card card"><div className="brand" style={{ padding: '0 0 22px' }}><span className="brand-mark">إ</span><span><span className="brand-name">إتقان</span><span className="brand-sub">LEARN, IN YOUR OWN WORDS</span></span></div><div className="eyebrow">{eyebrow}</div><h1 className="page-title" style={{ fontSize: 28 }}>{title}</h1>{children}</div></div>;
}

export function BootGate() {
  const { boot, confirmMigration, startFresh, retryBoot } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const errBox = err && <div className="notice notice-danger" role="alert" style={{ marginTop: 12 }} data-testid="status-gate-error"><CircleAlert size={14} /> {err}</div>;

  if (boot.phase === 'loading') return <div className="gate" dir="rtl" data-testid="status-loading"><div className="gate-card card"><div className="skeleton" style={{ height: 28, width: '40%' }} /><div className="skeleton" style={{ height: 14, width: '80%', marginTop: 16 }} /><div className="skeleton" style={{ height: 14, width: '65%', marginTop: 10 }} /><p className="setting-copy" style={{ marginTop: 18 }}>أفتح مساحتك المحفوظة على هذا الجهاز…</p></div></div>;

  if (boot.phase === 'storage-error') return <Frame title="تعذر فتح التخزين المحلي" eyebrow="STORAGE UNAVAILABLE">
    <p className="page-desc">{boot.message}</p>
    <p className="setting-copy" style={{ marginTop: 12 }}>إتقان يحفظ كل شيء داخل متصفحك. بدون تخزين محلي لا يمكن حفظ مصادرك بأمان، لذلك لم أفتح المساحة بدل أن أعرض بيانات ستضيع. جرّب إغلاق التصفح الخاص أو تحرير مساحة ثم أعد المحاولة.</p>
    <button className="button button-primary" onClick={retryBoot} data-testid="button-retry-boot"><RotateCcw size={15} /> إعادة المحاولة</button>
  </Frame>;

  if (boot.phase === 'migrate') {
    const c = boot.report.counts;
    return <Frame title="انقل بياناتك إلى التخزين الجديد" eyebrow="ONE-TIME MIGRATION">
      <p className="page-desc">وجدت مساحة محفوظة بالإصدار السابق. التخزين الجديد يدعم ملفات PDF والإحالات للصفحات. راجع ما سيُنقل قبل التأكيد.</p>
      <div className="migrate-grid" data-testid="panel-migration-preview">{[['مصادر', c.sources], ['مفاهيم', c.concepts], ['علاقات', c.relations], ['أسئلة', c.questions], ['استجابات', c.evidence]].map(([l, n]) => <div key={String(l)} className="metric-card card"><div className="metric-value">{n}</div><div className="metric-label">{l}</div></div>)}</div>
      <ul className="impact-list"><li>تتحول نصوص المصادر إلى مقاطع قابلة للإحالة دون تغيير محتواها.</li><li>المفاهيم والأسئلة القديمة تبقى بموضعها النصي كما كتبته، وتُعلَّم «بلا إحالة مصدرية» حتى تربطها بمقطع.</li><li>الأسئلة القديمة تصبح أسئلة اختيار من متعدد، والاستجابات تحتفظ بنسخة من السؤال.</li><li>النسخة القديمة تبقى في المتصفح تحت المفتاح <code dir="ltr">{LEGACY_KEY}</code> ولن أحذفها.</li></ul>
      {boot.report.dropped.length > 0 && <div className="notice" style={{ marginTop: 10 }}><b>عناصر يتيمة لن تُنقل ({boot.report.dropped.length}):</b> {boot.report.dropped.slice(0, 5).join('، ')}</div>}
      {errBox}
      <div className="form-actions" style={{ flexWrap: 'wrap' }}><button className="button button-primary" disabled={busy} onClick={() => run(confirmMigration)} data-testid="button-confirm-migration">{busy ? <LoaderCircle size={15} className="spin" /> : <ArrowLeftRight size={15} />} أكّد النقل</button><button className="button button-secondary" onClick={() => downloadBlob(new Blob([boot.raw], { type: 'application/json' }), 'itqan-legacy-v1.json')} data-testid="button-download-legacy"><ArrowDownToLine size={15} /> نزّل النسخة القديمة أولًا</button></div>
    </Frame>;
  }

  if (boot.phase === 'legacy-invalid') return <Frame title="بيانات قديمة غير قابلة للقراءة" eyebrow="NEEDS YOUR DECISION">
    <p className="page-desc">في المتصفح نسخة من الإصدار السابق لكنها تالفة أو بصيغة غير متوقعة. لن أحذفها ولن أكتب فوقها.</p>
    {errBox}
    <div className="form-actions" style={{ flexWrap: 'wrap' }}><button className="button button-secondary" onClick={() => downloadBlob(new Blob([boot.raw], { type: 'application/json' }), 'itqan-legacy-unreadable.json')} data-testid="button-download-legacy-raw"><ArrowDownToLine size={15} /> نزّل النص الخام</button><button className="button button-primary" disabled={busy} onClick={() => run(() => startFresh(true))} data-testid="button-start-sample">ابدأ مساحة جديدة بأمثلة</button><button className="button button-secondary" disabled={busy} onClick={() => run(() => startFresh(false))} data-testid="button-start-empty">ابدأ مساحة فارغة</button></div>
    <p className="setting-copy" style={{ marginTop: 12 }}>المساحة الجديدة تُحفظ في تخزين منفصل؛ النص القديم يبقى في مكانه.</p>
    <div style={{ marginTop: 16 }}><BackupPanel allowExport={false} /></div>
  </Frame>;

  if (boot.phase === 'corrupt') return <Frame title="المساحة المحفوظة لا تجتاز الفحص" eyebrow="INTEGRITY CHECK FAILED">
    <p className="page-desc">قرأت بياناتك لكنها لا تطابق البنية المتوقعة. لم أستبدلها. يمكنك تنزيل نسختها الخام، أو استعادة نسخة احتياطية، أو البدء من جديد صراحة.</p>
    <ul className="impact-list">{boot.problems.map(p => <li key={p}>{p}</li>)}</ul>
    {errBox}
    <div className="form-actions" style={{ flexWrap: 'wrap' }}><button className="button button-secondary" onClick={() => downloadBlob(new Blob([JSON.stringify(boot.raw)], { type: 'application/json' }), 'itqan-unreadable-workspace.json')} data-testid="button-download-corrupt"><ArrowDownToLine size={15} /> نزّل البيانات الخام</button><button className="button button-danger" disabled={busy} onClick={() => { if (window.confirm('سيُستبدل ما في التخزين المحلي بمساحة جديدة. هل نزّلت البيانات الخام؟')) run(() => startFresh(false)); }} data-testid="button-reset-corrupt"><DatabaseZap size={15} /> ابدأ من جديد</button></div>
    <div style={{ marginTop: 16 }}><BackupPanel allowExport={false} /></div>
  </Frame>;

  return null;
}
