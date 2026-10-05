import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, LoaderCircle, CircleAlert, X, ShieldAlert } from 'lucide-react';
import { analyzeLearning } from '@workspace/api-client-react';
import { useWorkspace } from '@/state/workspace';
import { useCapabilities } from '@/state/capabilities';
import { suggestionsFromAnalysis } from '@/lib/grounding';
import type { Segment, Source } from '@/lib/types';
import { apiErrorMessage, isAbort, nowIso, sha256, uid } from '@/lib/util';
import { locationLabel } from './common';

export function AnalysisPanel({ source, segments, selected, setSelected, onDone }: { source: Source; segments: Segment[]; selected: Set<string>; setSelected: (s: Set<string>) => void; onDone: () => void }) {
  const { ws, update, flash } = useWorkspace();
  const { caps, loading } = useCapabilities();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [hash, setHash] = useState('');
  const [force, setForce] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const chosen = useMemo(() => segments.filter(s => selected.has(s.id)), [segments, selected]);
  const chars = chosen.reduce((a, s) => a + s.text.length, 0);
  const over = chars > caps.maxAnalysisCharacters || chosen.length > caps.maxSegments;
  useEffect(() => { let alive = true; sha256(chosen.map(s => `${s.id}\u0000${s.text}`).join('\u0001')).then(h => alive && setHash(h)); setForce(false); return () => { alive = false; }; }, [chosen]);
  const previous = ws.runs.find(r => r.sourceId === source.id && r.hash === hash);

  const fillFirst = () => {
    const next = new Set<string>(); let total = 0;
    for (const s of segments) { if (next.size >= caps.maxSegments || total + s.text.length > caps.maxAnalysisCharacters) break; next.add(s.id); total += s.text.length; }
    setSelected(next);
  };
  const toggleSegment = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id); else next.delete(id);
    setSelected(next);
  };

  const run = async () => {
    setBusy(true); setError(''); setWarnings([]);
    const ctrl = new AbortController(); abort.current = ctrl;
    const sent = chosen.map(s => ({ id: s.id, text: s.text, ...(s.page ? { page: s.page } : {}), ...(s.startSeconds !== undefined ? { startSeconds: s.startSeconds } : {}), ...(s.endSeconds !== undefined ? { endSeconds: s.endSeconds } : {}) }));
    try {
      const result = await analyzeLearning({ consent: true, segments: sent }, { signal: ctrl.signal });
      const runId = uid();
      let added = 0;
      update(w => {
        const sugg = suggestionsFromAnalysis(result, chosen, source.id, runId, w);
        added = sugg.length;
        return { ...w, runs: [...w.runs.filter(r => !(r.sourceId === source.id && r.hash === hash)), { id: runId, sourceId: source.id, segmentIds: chosen.map(s => s.id), hash, createdAt: nowIso(), warnings: result.warnings }], suggestions: [...w.suggestions, ...sugg] };
      });
      setWarnings(result.warnings);
      flash(added ? 'وصلت المقترحات. راجعها قبل أن تصبح جزءًا من معرفتك.' : 'انتهى التحليل دون مقترحات جديدة (أُسقطت المكررات).');
      onDone();
    } catch (e) { setError(isAbort(e) ? 'أُلغي التحليل.' : apiErrorMessage(e, 'تعذر التحليل')); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="skeleton" style={{ height: 80 }} />;
  return <div className="analysis-panel" data-testid="panel-analysis">
    {!caps.ai && <div className="notice notice-warn" role="status" data-testid="status-ai-unavailable"><ShieldAlert size={14} /> التحليل الذكي غير متاح الآن. {caps.message} يمكنك إنشاء المفاهيم والأسئلة يدويًا من المقاطع.</div>}
    <div className="analysis-meter"><span data-testid="text-analysis-count">{chosen.length} / {caps.maxSegments} مقطع</span><span className={chars > caps.maxAnalysisCharacters ? 'over' : ''}>{chars.toLocaleString('ar')} / {caps.maxAnalysisCharacters.toLocaleString('ar')} حرف</span></div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 12px' }}><button className="button button-secondary small" onClick={fillFirst} data-testid="button-select-fitting">حدّد أول المقاطع المناسبة</button><button className="button button-quiet small" onClick={() => setSelected(new Set())} data-testid="button-clear-selection">مسح الاختيار</button></div>
    <p className="setting-copy" style={{ margin: '0 0 10px' }}>اختر المقاطع التي تريد تحويلها. الحد في كل دفعة {caps.maxSegments} مقطعًا و{caps.maxAnalysisCharacters.toLocaleString('ar')} حرف. {chosen.length > 0 && `المختار: ${[...new Set(chosen.map(locationLabel))].slice(0, 4).join('، ')}${chosen.length > 4 ? '…' : ''}`}</p>
    <div className="analysis-segment-list" role="group" aria-label="مقاطع المصدر للتحليل" data-testid="list-analysis-segments">
      {segments.map((s, index) => {
        const checked = selected.has(s.id);
        const disabled = !checked && (chosen.length >= caps.maxSegments || chars + s.text.length > caps.maxAnalysisCharacters);
        return <div className="analysis-segment-item" key={s.id}>
          <label className="analysis-segment-choice">
            <input type="checkbox" checked={checked} disabled={disabled} onChange={e => toggleSegment(s.id, e.target.checked)} aria-label={`اختيار ${locationLabel(s)} · المقطع ${index + 1}`} data-testid={`checkbox-analysis-segment-${index + 1}`} />
            <span className="analysis-segment-copy">
              <span className="analysis-segment-location">{locationLabel(s)} · المقطع {index + 1}</span>
              <span className="analysis-segment-text" dir="auto">{s.text.slice(0, 240)}{s.text.length > 240 ? '…' : ''}</span>
            </span>
          </label>
          {s.text.length > 240 && <details className="analysis-segment-details"><summary>عرض النص كاملًا</summary><p dir="auto">{s.text}</p></details>}
        </div>;
      })}
    </div>
    {over && <div className="field-error" role="alert">قلّل الاختيار: الحد {caps.maxSegments} مقطعًا و{caps.maxAnalysisCharacters.toLocaleString('ar')} حرفًا.</div>}
    <label className="check-row consent" data-testid="label-ai-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={!caps.ai} data-testid="checkbox-ai-consent" />
      <span>أوافق على إرسال <b>المقاطع المختارة فقط</b> ({chosen.length}) إلى OpenAI عبر تكامل Replit لاقتراح مفاهيم وأسئلة. المعالجة تستهلك رصيدًا. خادم إتقان يمرر النص مؤقتًا ولا يسجله أو يخزنه، لكن لا يمكنني ضمان سياسة احتفاظ المزود الخارجي. تعليمات داخل النص تُعامل كبيانات لا كأوامر.</span></label>
    {previous && !force && <div className="notice" role="status" data-testid="status-analysis-duplicate">حللتَ هذه المقاطع نفسها في {new Date(previous.createdAt).toLocaleString('ar')}. مقترحاتها في قائمة المراجعة. <button className="text-link link-button" onClick={() => setForce(true)} data-testid="button-force-reanalyze">أعد التحليل على أي حال</button></div>}
    {error && <div className="notice notice-danger" role="alert" data-testid="status-analysis-error"><CircleAlert size={14} /> {error}</div>}
    {warnings.length > 0 && <ul className="impact-list">{warnings.map(w => <li key={w}>{w}</li>)}</ul>}
    <div className="form-actions">
      {busy ? <><button className="button button-secondary" onClick={() => abort.current?.abort()} data-testid="button-cancel-analysis"><X size={15} /> إلغاء</button><span className="proc-line"><LoaderCircle size={14} className="spin" /> يحلل المقاطع…</span></>
        : <button className="button button-primary" disabled={!caps.ai || !consent || !chosen.length || over || (!!previous && !force)} onClick={run} data-testid="button-run-analysis"><Sparkles size={15} /> {error ? 'أعد المحاولة' : 'اقترح مفاهيم وأسئلة'}</button>}
    </div>
  </div>;
}
