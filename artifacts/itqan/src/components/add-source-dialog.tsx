import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { FileText, Youtube, Globe, ClipboardPaste, LoaderCircle, CircleAlert, Upload, RotateCcw, X, Check, FileUp } from 'lucide-react';
import { extractArticle, type ArticleResult } from '@workspace/api-client-react';
import { Modal, ProgressBar } from './common';
import { useWorkspace } from '@/state/workspace';
import { useCapabilities } from '@/state/capabilities';
import { LIMITS, type Segment, type Source, type SourceKind } from '@/lib/types';
import { apiErrorMessage, chunkText, formatBytes, formatTime, isAbort, nowIso, parsePageRange, sha256, uid } from '@/lib/util';
import { putFile } from '@/lib/db';
import { detectKind, readTextFile, readDocx, checkTextLimit } from '@/lib/ingest/text';
import { openPdf, extractPages, pageSegments, type PdfDoc } from '@/lib/ingest/pdf';
import { parseYouTubeId } from '@/lib/ingest/youtube';
import { parseSubtitles, parseManual, groupCues, type Cue } from '@/lib/ingest/transcript';

type Tab = 'file' | 'youtube' | 'web' | 'paste';

export function AddSourceDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('file');
  const tabs: { id: Tab; label: string; Icon: typeof FileText }[] = [
    { id: 'file', label: 'ملف (PDF، Word، نص)', Icon: FileText }, { id: 'youtube', label: 'YouTube', Icon: Youtube },
    { id: 'web', label: 'صفحة ويب', Icon: Globe }, { id: 'paste', label: 'نص ملصق', Icon: ClipboardPaste },
  ];
  return <Modal title="أضف مصدرًا" onClose={onClose} wide testId="dialog-add-source">
    <div className="seg-tabs" role="tablist">{tabs.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={`seg-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} data-testid={`tab-source-${t.id}`}><t.Icon size={15} /> {t.label}</button>)}</div>
    {tab === 'file' && <FileTab onClose={onClose} />}
    {tab === 'youtube' && <YoutubeTab onClose={onClose} />}
    {tab === 'web' && <WebTab onClose={onClose} />}
    {tab === 'paste' && <PasteTab onClose={onClose} />}
  </Modal>;
}

function useSaveSource(onClose: () => void) {
  const { update, flash } = useWorkspace();
  const [, go] = useLocation();
  return (source: Source, segments: Segment[]) => {
    update(w => ({ ...w, sample: w.sample, sources: [source, ...w.sources.filter(s => s.id !== source.id)], segments: [...w.segments.filter(s => s.sourceId !== source.id), ...segments] }));
    flash(`أُضيف «${source.title}»`);
    onClose();
    go(`/sources/${source.id}`);
  };
}

function textSegments(sourceId: string, text: string, origin: Segment['origin']): Segment[] {
  return chunkText(text).map((t, i) => ({ id: `${sourceId}:${i}`, sourceId, order: i, text: t, origin }));
}

function Duplicate({ source, onClose }: { source: Source; onClose: () => void }) {
  const [, go] = useLocation();
  return <div className="notice" role="status" style={{ marginTop: 12 }} data-testid="status-duplicate-source">هذا المحتوى موجود مسبقًا باسم «{source.title}». لن أنشئ نسخة مكررة. <button className="text-link link-button" onClick={() => { onClose(); go(`/sources/${source.id}`); }} data-testid="button-open-duplicate">افتح المصدر الموجود</button></div>;
}

function FileTab({ onClose }: { onClose: () => void }) {
  const { ws } = useWorkspace();
  const save = useSaveSource(onClose);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<SourceKind | null>(null);
  const [hash, setHash] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [dup, setDup] = useState<Source | null>(null);
  const [pdf, setPdf] = useState<{ doc: PdfDoc; labels: string[] | null; pages: number } | null>(null);
  const [range, setRange] = useState('');
  const [phase, setPhase] = useState<'idle' | 'reading' | 'extracting' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const sourceId = useRef(uid());

  useEffect(() => () => { abort.current?.abort(); void pdf?.doc.destroy(); }, [pdf]);

  const choose = async (f: File | undefined) => {
    setError(''); setDup(null); setPdf(null); setFile(null); setPhase('idle');
    if (!f) return;
    const k = detectKind(f);
    if (!k) { setError('صيغة غير مدعومة. المدعوم: PDF، DOCX، TXT، MD. (PPTX وEPUB والصوت غير مدعومة حاليًا.)'); return; }
    if (f.size > LIMITS.fileBytes) { setError(`حجم الملف ${formatBytes(f.size)} يتجاوز الحد ${formatBytes(LIMITS.fileBytes)}.`); return; }
    setFile(f); setKind(k); setTitle(f.name.replace(/\.[^.]+$/, '')); setPhase('reading');
    try {
      const buf = await f.arrayBuffer();
      const h = await sha256(buf);
      setHash(h);
      const existing = ws.sources.find(s => s.contentHash === h);
      if (existing) { setDup(existing); setPhase('idle'); return; }
      if (k === 'pdf') {
        const { doc, labels } = await openPdf(buf);
        setPdf({ doc, labels, pages: doc.numPages });
        setRange(`1-${Math.min(doc.numPages, 10)}`);
      }
      setPhase('idle');
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر قراءة الملف'); setPhase('failed'); }
  };

  const parsed = pdf ? parsePageRange(range, pdf.pages) : null;
  const rangeError = typeof parsed === 'string' ? parsed : Array.isArray(parsed) && parsed.length > LIMITS.pdfPagesPerExtraction ? `اخترت ${parsed.length} صفحة؛ الحد ${LIMITS.pdfPagesPerExtraction} في كل استخراج. يمكنك استخراج المزيد لاحقًا من القارئ.` : '';

  const run = async () => {
    if (!file || !kind) return;
    setError(''); setPhase('extracting'); setProgress(0);
    const ctrl = new AbortController(); abort.current = ctrl;
    const id = sourceId.current, t = nowIso();
    try {
      if (kind === 'pdf' && pdf && Array.isArray(parsed)) {
        const pages = await extractPages(pdf.doc, pdf.labels, parsed, ctrl.signal, (d, n) => setProgress(d / n));
        let order = 0;
        const segs: Segment[] = [];
        pages.filter(p => !p.scanned).forEach(p => { const s = pageSegments(id, p, order); order += s.length; segs.push(...s); });
        const chars = segs.reduce((a, s) => a + s.text.length, 0);
        if (chars > LIMITS.sourceChars) throw new Error('النص المستخرج يتجاوز الحد المسموح لمصدر واحد.');
        const scanned = pages.filter(p => p.scanned).map(p => p.page);
        const fileId = `f-${id}`;
        await putFile({ id: fileId, name: file.name, mime: 'application/pdf', size: file.size, blob: file, sha256: hash, createdAt: t });
        const warnings = scanned.length ? [`${scanned.length} صفحة بلا طبقة نصية (ممسوحة ضوئيًا على الأرجح): ${scanned.slice(0, 12).join('، ')}${scanned.length > 12 ? '…' : ''}`] : [];
        if (pdf.labels && pages.some(p => p.printedPage)) warnings.push('أرقام الصفحات المطبوعة تختلف عن ترقيم الملف؛ تظهر الاثنتان في الإحالات.');
        save({ id, title: title.trim() || file.name, kind: 'pdf', createdAt: t, updatedAt: t, fileId, fileName: file.name, fileSize: file.size, mime: 'application/pdf', pageCount: pdf.pages, extractedPages: pages.map(p => p.page), scannedPages: scanned, contentHash: hash, warnings }, segs);
      } else {
        setProgress(0.3);
        const r = kind === 'docx' ? await readDocx(file) : { text: await readTextFile(file), warnings: [] as string[] };
        if (ctrl.signal.aborted) throw new DOMException('aborted', 'AbortError');
        checkTextLimit(r.text);
        setProgress(1);
        save({ id, title: title.trim() || file.name, kind, createdAt: t, updatedAt: t, fileName: file.name, fileSize: file.size, contentHash: hash, warnings: r.warnings }, textSegments(id, r.text, 'text'));
      }
    } catch (e) {
      if (isAbort(e)) { setPhase('idle'); setError('أُلغي الاستخراج. لم يُحفظ شيء.'); return; }
      setError(e instanceof Error ? e.message : 'تعذر الاستخراج'); setPhase('failed');
    }
  };

  return <div data-testid="panel-file-source">
    <button type="button" className="dropzone" onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void choose(e.dataTransfer.files[0]); }} data-testid="button-pick-file">
      <FileUp size={26} /><b>{file ? file.name : 'اختر ملفًا أو اسحبه هنا'}</b><span>PDF، DOCX، TXT، MD · حتى {formatBytes(LIMITS.fileBytes)} · يبقى الملف على جهازك</span>
    </button>
    <input ref={input} type="file" hidden accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,text/plain" onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} data-testid="input-source-file" />
    {phase === 'reading' && <div className="proc-line"><LoaderCircle size={14} className="spin" /> أقرأ الملف وأتحقق من تكراره…</div>}
    {dup && <Duplicate source={dup} onClose={onClose} />}
    {file && !dup && phase !== 'reading' && <div className="form-grid" style={{ marginTop: 16 }}>
      <div className="field full"><label htmlFor="file-title">عنوان المصدر</label><input id="file-title" value={title} onChange={e => setTitle(e.target.value)} data-testid="input-file-title" /></div>
      {pdf && <><div className="field"><label htmlFor="pdf-range">الصفحات المراد استخراج نصها</label><input id="pdf-range" dir="ltr" value={range} onChange={e => setRange(e.target.value)} placeholder="1-10, 15" data-testid="input-pdf-range" /></div>
        <div className="notice" style={{ alignSelf: 'end' }}>الملف {pdf.pages} صفحة. حدد فصلًا أو مجموعة صفحات (حتى {LIMITS.pdfPagesPerExtraction}). يُحفظ الملف كاملًا للقراءة، والإحالات بترقيم صفحات الملف.</div>
        {rangeError && <div className="field-error full" role="alert">{rangeError}</div>}</>}
    </div>}
    {phase === 'extracting' && <div style={{ marginTop: 14 }}><ProgressBar value={progress} label="تقدم الاستخراج" /><div className="proc-line"><LoaderCircle size={14} className="spin" /> {kind === 'pdf' ? `استخراج النص… ${Math.round(progress * 100)}%` : 'استخراج النص…'}</div></div>}
    {error && <div className="notice notice-danger" role="alert" style={{ marginTop: 12 }} data-testid="status-file-error"><CircleAlert size={14} /> {error}</div>}
    {file && !dup && <div className="form-actions">
      {phase === 'extracting' ? <button className="button button-secondary" onClick={() => abort.current?.abort()} data-testid="button-cancel-extract"><X size={15} /> إلغاء</button>
        : <button className="button button-primary" disabled={phase === 'reading' || (!!pdf && !!rangeError) || (kind === 'pdf' && !pdf)} onClick={run} data-testid="button-extract">{phase === 'failed' ? <><RotateCcw size={15} /> أعد المحاولة</> : <><Check size={15} /> استخرج وأضف</>}</button>}
    </div>}
  </div>;
}

function YoutubeTab({ onClose }: { onClose: () => void }) {
  const { ws } = useWorkspace();
  const { caps } = useCapabilities();
  const save = useSaveSource(onClose);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'file' | 'manual'>('file');
  const [cues, setCues] = useState<Cue[] | null>(null);
  const [label, setLabel] = useState('');
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');
  const videoId = parseYouTubeId(url);
  const dup = videoId ? ws.sources.find(s => s.videoId === videoId) : undefined;

  const readSubs = async (f: File | undefined) => {
    setError(''); setCues(null);
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError('ملف الترجمة أكبر من 5 م.ب.'); return; }
    const parsed = parseSubtitles(await readTextFile(f));
    if (!parsed.length) { setError('لم أجد توقيتات صالحة. تأكد أن الملف SRT أو VTT.'); return; }
    setCues(parsed); setLabel(`ملف ترجمة أرفقته يدويًا (${f.name})`);
  };

  const submit = () => {
    if (!videoId) return;
    let list: Cue[] = cues || [];
    let lab = label;
    if (mode === 'manual') {
      const r = parseManual(manual);
      list = r.cues; lab = r.timed ? 'تفريغ يدوي بتوقيتات أدخلتها' : 'تفريغ يدوي بلا توقيتات';
    }
    const text = list.map(c => c.text).join(' ');
    try { checkTextLimit(text); } catch (e) { setError((e as Error).message); return; }
    const id = uid(), t = nowIso();
    const groups = groupCues(list);
    const segs: Segment[] = groups.flatMap((g, gi) => (g.start < 0 ? chunkText(g.text) : [g.text]).map((tx, j) => ({ id: `${id}:t${gi}-${j}`, sourceId: id, order: 0, text: tx, startSeconds: g.start >= 0 ? g.start : undefined, endSeconds: g.end, origin: (mode === 'manual' ? 'transcript-manual' : 'transcript-file') as Segment['origin'] }))).map((s, i) => ({ ...s, order: i }));
    save({ id, title: title.trim() || `فيديو ${videoId}`, kind: 'youtube', createdAt: t, updatedAt: t, url: `https://www.youtube.com/watch?v=${videoId}`, videoId, transcriptLabel: lab, warnings: ['التفريغ مُدخل يدويًا وليس مستوردًا تلقائيًا من YouTube.'] }, segs);
  };

  return <div data-testid="panel-youtube-source">
    <div className="field"><label htmlFor="yt-url">رابط الفيديو</label><input id="yt-url" dir="ltr" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" data-testid="input-youtube-url" /></div>
    {url && !videoId && <div className="field-error" role="alert">الرابط ليس رابط فيديو YouTube صالحًا.</div>}
    {dup && <Duplicate source={dup} onClose={onClose} />}
    {videoId && !dup && <>
      <div className="notice notice-warn" role="status" style={{ marginTop: 12 }} data-testid="status-youtube-unavailable"><CircleAlert size={14} /> <span><b>الاستيراد التلقائي للتفريغ غير متاح.</b> {caps.youtube ? 'الخادم يعلن توفره لكن لا توجد واجهة استيراد مفعلة في هذا الإصدار.' : 'لم أجد مزودًا مسموحًا ومتحققًا منه لجلب تفريغ YouTube، لذلك لا أدعي استيراده.'} يمكنك إرفاق ملف SRT/VTT أو لصق التفريغ بنفسك، ويُوسم المصدر بأنه تفريغ يدوي.</span></div>
      <div className="form-grid" style={{ marginTop: 14 }}>
        <div className="field full"><label htmlFor="yt-title">عنوان المصدر</label><input id="yt-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="مثل: محاضرة الأسبوع الرابع" data-testid="input-youtube-title" /></div>
      </div>
      <div className="seg-tabs small" style={{ marginTop: 14 }}><button className={`seg-tab ${mode === 'file' ? 'active' : ''}`} onClick={() => setMode('file')} data-testid="tab-transcript-file">ملف SRT / VTT</button><button className={`seg-tab ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')} data-testid="tab-transcript-manual">لصق يدوي</button></div>
      {mode === 'file' ? <div className="field"><label htmlFor="yt-subs">ملف الترجمة</label><input id="yt-subs" type="file" accept=".srt,.vtt,text/vtt" onChange={e => readSubs(e.target.files?.[0])} data-testid="input-transcript-file" />{cues && <span className="setting-copy" style={{ margin: 0 }}>{cues.length} سطر توقيت · حتى {formatTime(cues[cues.length - 1].start)}</span>}</div>
        : <div className="field"><label htmlFor="yt-manual">التفريغ (ابدأ السطر بتوقيت مثل 1:23 ليصبح قابلًا للرجوع)</label><textarea id="yt-manual" value={manual} onChange={e => setManual(e.target.value)} placeholder={'0:00 مقدمة المحاضرة…\n1:42 تعريف المفهوم الأول…'} data-testid="input-transcript-manual" /></div>}
      {error && <div className="notice notice-danger" role="alert" style={{ marginTop: 12 }}><CircleAlert size={14} /> {error}</div>}
      <div className="form-actions"><button className="button button-primary" disabled={mode === 'file' ? !cues : !manual.trim()} onClick={submit} data-testid="button-save-youtube"><Upload size={15} /> أضف الفيديو بتفريغه اليدوي</button></div>
    </>}
  </div>;
}

function WebTab({ onClose }: { onClose: () => void }) {
  const { ws } = useWorkspace();
  const save = useSaveSource(onClose);
  const [url, setUrl] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ArticleResult | null>(null);
  const [title, setTitle] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  let valid = false;
  try { const u = new URL(url); valid = u.protocol === 'https:' || u.protocol === 'http:'; } catch { valid = false; }
  const dup = ws.sources.find(s => s.kind === 'article' && s.url === url.trim());

  const fetchIt = async () => {
    setBusy(true); setError(''); setResult(null);
    const ctrl = new AbortController(); abort.current = ctrl;
    try {
      const r = await extractArticle({ url: url.trim(), consent: true }, { signal: ctrl.signal });
      if (!r.segments.length) throw new Error('لم أجد نصًا مقروءًا في الصفحة.');
      setResult(r); setTitle(r.title);
    } catch (e) { setError(isAbort(e) ? 'أُلغي الجلب.' : apiErrorMessage(e, 'تعذر جلب الصفحة')); }
    finally { setBusy(false); }
  };
  const submit = () => {
    if (!result) return;
    const text = result.segments.map(s => s.text).join('\n\n');
    try { checkTextLimit(text); } catch (e) { setError((e as Error).message); return; }
    const id = uid(), t = nowIso();
    save({ id, title: title.trim() || result.title, kind: 'article', createdAt: t, updatedAt: t, url: result.url, warnings: result.warnings }, result.segments.map((s, i) => ({ id: `${id}:${i}`, sourceId: id, order: i, text: s.text, origin: 'article' })));
  };

  return <div data-testid="panel-web-source">
    <div className="field"><label htmlFor="web-url">رابط المقال أو الصفحة</label><input id="web-url" dir="ltr" value={url} onChange={e => { setUrl(e.target.value); setResult(null); }} placeholder="https://…" data-testid="input-web-url" /></div>
    {dup && <Duplicate source={dup} onClose={onClose} />}
    <label className="check-row"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} data-testid="checkbox-web-consent" /> أوافق على إرسال هذا الرابط إلى خادم إتقان ليجلب الصفحة العامة مؤقتًا ويعيد نصها. لا يُحفظ الرابط أو النص على الخادم. الصفحات التي تتطلب تسجيل دخول أو اشتراكًا غير مدعومة.</label>
    {error && <div className="notice notice-danger" role="alert" style={{ marginTop: 12 }} data-testid="status-web-error"><CircleAlert size={14} /> {error}</div>}
    {result && <div className="card" style={{ padding: 14, marginTop: 12 }} data-testid="panel-web-preview"><div className="field"><label htmlFor="web-title">العنوان</label><input id="web-title" value={title} onChange={e => setTitle(e.target.value)} data-testid="input-web-title" /></div><p className="setting-copy" style={{ margin: '10px 0 0' }}>{result.segments.length} مقطع · {result.segments.reduce((a, s) => a + s.text.length, 0).toLocaleString('ar')} حرف</p><blockquote className="preview-quote" dir="auto">{result.segments[0]?.text.slice(0, 280)}…</blockquote>{result.warnings.map(w => <div key={w} className="tag" style={{ display: 'inline-block', marginTop: 6 }}>{w}</div>)}</div>}
    <div className="form-actions">
      {busy ? <button className="button button-secondary" onClick={() => abort.current?.abort()} data-testid="button-cancel-web"><X size={15} /> إلغاء</button>
        : result ? <button className="button button-primary" onClick={submit} data-testid="button-save-web"><Check size={15} /> أضف المصدر</button>
          : <button className="button button-primary" disabled={!valid || !consent || !!dup} onClick={fetchIt} data-testid="button-fetch-web">{error ? <RotateCcw size={15} /> : <Globe size={15} />} {error ? 'أعد المحاولة' : 'اجلب النص'}</button>}
      {busy && <span className="proc-line"><LoaderCircle size={14} className="spin" /> أجلب الصفحة…</span>}
    </div>
  </div>;
}

function PasteTab({ onClose }: { onClose: () => void }) {
  const save = useSaveSource(onClose);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const submit = () => {
    try { checkTextLimit(text); } catch (e) { setError((e as Error).message); return; }
    const id = uid(), t = nowIso();
    save({ id, title: title.trim() || 'نص ملصق', kind: 'paste', createdAt: t, updatedAt: t, warnings: [] }, textSegments(id, text, 'text'));
  };
  return <div data-testid="panel-paste-source">
    <div className="form-grid"><div className="field full"><label htmlFor="paste-title">عنوان المصدر</label><input id="paste-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="مثل: ملخص الفصل الثالث" data-testid="input-source-title" /></div>
      <div className="field full"><label htmlFor="paste-text">النص</label><textarea id="paste-text" style={{ minHeight: 200 }} value={text} onChange={e => setText(e.target.value)} placeholder="الصق نصًا تملكه أو ملاحظات كتبتها…" data-testid="input-source-content" /><span className="setting-copy" style={{ margin: 0 }}>{text.length.toLocaleString('ar')} / {LIMITS.sourceChars.toLocaleString('ar')} حرف · الفقرات الفارغة تفصل المقاطع</span></div></div>
    {error && <div className="notice notice-danger" role="alert"><CircleAlert size={14} /> {error}</div>}
    <div className="form-actions"><button className="button button-primary" disabled={!text.trim()} onClick={submit} data-testid="button-save-source"><Check size={15} /> أضف المصدر</button></div>
  </div>;
}
