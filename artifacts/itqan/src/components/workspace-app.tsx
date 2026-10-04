import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, Route, Switch, useLocation, useParams } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArrowDownLeft, ArrowLeft, ArrowRight, BookOpen, Brain, Check, ChevronLeft,
  CircleAlert, FileText, Home, Link2, Moon, Network, Plus, Search, Settings,
  ShieldCheck, Sparkles, Sun, Trash2, Youtube, ChartNoAxesColumnIncreasing,
} from 'lucide-react';
import { AppShell } from './app-shell';
import { BootGate } from './boot-gate';
import { AddSourceDialog } from './add-source-dialog';
import { AnalysisPanel } from './analysis-panel';
import { BackupPanel } from './backup-panel';
import { Empty, PageHeading, SampleNote, SourceCitation, locationLabel } from './common';
import { PdfCanvas, usePdfDoc } from './pdf-viewer';
import { useWorkspace, WorkspaceProvider } from '@/state/workspace';
import { useCapabilities } from '@/state/capabilities';
import { extractPageText } from '@workspace/api-client-react';
import { pageImageDataUrl } from '@/lib/ingest/pdf';
import { describeImpact, impactOf } from '@/lib/cascade';
import { formatTime, nowIso, uid } from '@/lib/util';
import type { Citation, Concept, Evidence, Question, Relation, Segment, Source, Workspace } from '@/lib/types';

const queryClient = new QueryClient();

function fmtKind(kind: Source['kind']) {
  return ({ pdf: 'PDF', docx: 'Word', text: 'نص', markdown: 'Markdown', youtube: 'YouTube', article: 'صفحة ويب', paste: 'نص ملصق', legacy: 'مصدر قديم' } as const)[kind];
}

function citeLocation(segment: Segment | undefined) {
  if (!segment) return 'الموضع غير متاح';
  return locationLabel(segment);
}

function Citation({ ws, sourceId, citation, label }: { ws: Workspace; sourceId: string; citation: Citation | null; label?: string }) {
  const source = ws.sources.find(s => s.id === sourceId);
  const segment = citation && ws.segments.find(s => s.id === citation.segmentId);
  if (!source) return <span className="tag">مصدر محذوف</span>;
  if (!segment) return <Link className="cite" href={`/sources/${source.id}`}>{label || `${source.title} · موضع غير محدد`}</Link>;
  return <Link className="cite" href={`/sources/${source.id}?seg=${encodeURIComponent(segment.id)}`}>{label || `${source.title} · ${citeLocation(segment)}`}</Link>;
}

function Runtime() {
  const { boot, notice } = useWorkspace();
  const [path] = useLocation();
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('itqan-theme') === 'dark'; } catch { return false; }
  });
  const toggleTheme = () => setDark(d => {
    const next = !d;
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('itqan-theme', next ? 'dark' : 'light'); } catch { /* visual mode still changes */ }
    return next;
  });
  if (boot.phase !== 'ready') return <BootGate />;
  return <AppShell page={path} dark={dark} toggleTheme={toggleTheme}>
    {notice && <div role="status" className="toast-message" data-testid="status-action-result">{notice}</div>}
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/sources" component={SourcesPage} />
      <Route path="/sources/:sourceId" component={SourceReader} />
      <Route path="/knowledge" component={KnowledgePage} />
      <Route path="/study" component={StudyPage} />
      <Route path="/progress" component={ProgressPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route><div className="content"><Empty title="هذه الصفحة غير موجودة" copy="ارجع إلى مساحة اليوم للمتابعة." action={<Link className="button button-secondary" href="/">مساحة اليوم</Link>} /></div></Route>
    </Switch>
  </AppShell>;
}

export function WorkspaceApp() {
  return <QueryClientProvider client={queryClient}><WorkspaceProvider><Runtime /></WorkspaceProvider></QueryClientProvider>;
}

function HomePage() {
  const { ws } = useWorkspace();
  const { caps } = useCapabilities();
  const next = ws.questions.find(q => !ws.evidence.some(e => e.questionId === q.id)) ?? ws.questions[0];
  return <div className="content">
    <PageHeading eyebrow="YOUR OWN LEARNING SPACE" title="أهلًا بك في إتقان" description="ابدأ بمصدر، اربط الأفكار، ثم اختبر ما تستطيع استرجاعه." action={<Link className="button button-primary" href="/sources" data-testid="button-add-source"><Plus size={15} /> أضف مصدرًا</Link>} />
    {ws.sample && <SampleNote />}
    <section className="home-hero" data-testid="panel-today">
      <div className="hero-copy"><span className="hero-kicker">LEARN FROM YOUR SOURCES</span><h2 className="hero-title">المعرفة التي تسترجعها،<br />تصبح أقرب إليك.</h2><p className="hero-sub">مقاطع ومراجع واضحة، وممارسة مستقلة عن المساعدة الذكية.</p>
      <Link href={next ? '/study' : '/sources'} className="button button-secondary" data-testid="button-start-study">{next ? 'ابدأ جلسة استرجاع' : 'أضف مصدرًا أولًا'} <ArrowLeft size={15} /></Link></div>
      <div className="hero-art" aria-hidden="true"><div className="orbit" /><div className="orbit" /><div className="orbit-dot" /><div className="hero-core">إ</div></div>
    </section>
    <div className="stats-strip" aria-label="ملخص المساحة">
      <Stat icon={<BookOpen size={18} />} value={ws.sources.length} label="مصدر محفوظ محليًا" />
      <Stat icon={<Network size={18} />} value={ws.concepts.length} label="مفهوم" />
      <Stat icon={<ChartNoAxesColumnIncreasing size={18} />} value={ws.evidence.length} label="استجابة مسجلة كدليل" />
    </div>
    <div className="section-head"><h2 className="section-title">خطوتك التالية</h2></div>
    <div className="next-grid">
      <Link href={next ? '/study' : '/sources'} className="card action-card" style={{ textDecoration: 'none', color: 'inherit' }}><span className="action-icon"><Brain size={20} /></span><span className="row-main"><span className="action-title">{next ? `راجع: ${next.prompt}` : 'أضف أول مصدر'}</span><span className="action-caption">{next ? 'لا تظهر الإجابة قبل محاولتك.' : 'PDF أو مستند أو صفحة ويب أو نص.'}</span></span><ChevronLeft size={17} /></Link>
      <Link href="/knowledge" className="card action-card" style={{ textDecoration: 'none', color: 'inherit' }}><span className="action-icon"><Network size={20} /></span><span><span className="action-title">شبكة الأفكار</span><span className="action-caption">{ws.concepts.length} مفهومًا و{ws.relations.length} علاقة؛ راجع ما هو مقترح قبل اعتماده.</span></span><ArrowDownLeft size={17} /></Link>
    </div>
    <div className="notice" style={{ marginTop: 18 }}><ShieldCheck size={15} style={{ verticalAlign: 'middle', marginLeft: 7 }} /> المحتوى يبقى في هذا المتصفح. التحليل وOCR لا يرسلان شيئًا دون موافقتك الصريحة.</div>
    {!caps.ai && <p className="setting-copy" style={{ marginTop: 10 }}>التحليل الذكي غير متاح حاليًا؛ ما زال بإمكانك إنشاء المفاهيم والأسئلة يدويًا.</p>}
  </div>;
}

function Stat({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return <div className="stat-cell"><div><div className="stat-num">{value.toLocaleString('ar')}</div><div className="stat-label">{label}</div></div>{icon}</div>;
}

function SourcesPage() {
  const { ws, cascadeDelete } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = ws.sources.filter(s => `${s.title} ${s.note ?? ''} ${s.kind}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <div className="content">
    <PageHeading eyebrow="YOUR SOURCES" title="مصادري" description="ملفاتك ونصوصك تبقى محليًا، وكل إحالة تعود إلى موضع محدد." action={<button className="button button-primary" onClick={() => setAdding(true)} data-testid="button-add-source"><Plus size={15} /> مصدر جديد</button>} />
    {ws.sample && <SampleNote />}
    <div className="field" style={{ marginBottom: 16 }}><label htmlFor="source-search"><Search size={14} style={{ verticalAlign: 'middle', marginLeft: 6 }} /> ابحث في المصادر</label><input id="source-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="عنوان المصدر أو نوعه" /></div>
    {filtered.length ? <div className="list-stack">{filtered.map(source => <SourceCard key={source.id} source={source} />)}</div> : <Empty title={search ? 'لا توجد نتائج' : 'أضف مصدرك الأول'} copy={search ? 'جرّب كلمة أخرى.' : 'PDF، DOCX، TXT، Markdown، صفحة ويب، YouTube مع تفريغ يدوي، أو نص ملصق.'} icon={FileText} action={!search && <button className="button button-primary" onClick={() => setAdding(true)}><Plus size={15} /> أضف مصدرًا</button>} />}
    {adding && <AddSourceDialog onClose={() => setAdding(false)} />}
  </div>;
}

function SourceCard({ source }: { source: Source }) {
  const { ws, cascadeDelete } = useWorkspace();
  const [, navigate] = useLocation();
  const segments = ws.segments.filter(s => s.sourceId === source.id);
  const concepts = ws.concepts.filter(c => c.sourceId === source.id).length;
  const remove = () => {
    const impact = describeImpact(impactOf(ws, { type: 'source', id: source.id }));
    if (window.confirm(`حذف «${source.title}»؟\n\nسيُحذف المصدر وما يرتبط به:\n${impact.join('\n') || 'المصدر فقط'}`)) {
      cascadeDelete({ type: 'source', id: source.id });
    }
  };
  return <article className="card source-row" data-testid={`card-source-${source.id}`}>
    <div className="row-icon">{source.kind === 'youtube' ? <Youtube size={18} /> : <FileText size={18} />}</div>
    <div className="row-main"><Link href={`/sources/${source.id}`} className="row-title">{source.title}</Link><div className="row-meta"><span className="tag">{fmtKind(source.kind)}</span><span>{segments.length.toLocaleString('ar')} مقطع</span><span>{concepts.toLocaleString('ar')} مفهوم</span>{source.pageCount && <span>{source.pageCount.toLocaleString('ar')} صفحة</span>}</div>
      {source.warnings.map(w => <div key={w} className="setting-copy" style={{ margin: '5px 0 0' }}>{w}</div>)}
    </div>
    <div className="row-actions"><button className="icon-button" aria-label={`افتح ${source.title}`} onClick={() => navigate(`/sources/${source.id}`)}><BookOpen size={16} /></button><button className="icon-button" aria-label={`حذف ${source.title}`} onClick={remove}><Trash2 size={16} /></button></div>
  </article>;
}

function SourceReader() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const { ws, update, flash } = useWorkspace();
  const source = ws.sources.find(s => s.id === sourceId);
  const segments = ws.segments.filter(s => s.sourceId === sourceId).sort((a, b) => a.order - b.order);
  const [, navigate] = useLocation();
  const querySeg = new URLSearchParams(window.location.search).get('seg');
  const [selected, setSelected] = useState<Set<string>>(new Set(querySeg ? [querySeg] : []));
  const [active, setActive] = useState(querySeg ?? '');
  const [page, setPage] = useState(1);
  const [ocrConsent, setOcrConsent] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [ocrWarnings, setOcrWarnings] = useState<string[]>([]);
  const [ocrError, setOcrError] = useState('');
  const { caps } = useCapabilities();
  const { doc, labels, loading: pdfLoading, error: pdfError } = usePdfDoc(source?.fileId);
  const selectedSegment = segments.find(s => s.id === active);
  const pageSegments = segments.filter(s => s.page === page);

  if (!source) return <div className="content"><Empty title="المصدر غير موجود" copy="قد يكون حُذف أو لم يُستعد من النسخة الاحتياطية." action={<Link href="/sources" className="button button-secondary">عودة إلى المصادر</Link>} /></div>;

  const goToSegment = (segment: Segment) => {
    setActive(segment.id);
    if (segment.page) setPage(segment.page);
    if (segment.startSeconds !== undefined) window.open(`https://www.youtube.com/watch?v=${source.videoId}&t=${Math.floor(segment.startSeconds)}s`, '_blank', 'noopener,noreferrer');
  };
  const appendOcr = () => {
    const text = ocrText.trim();
    if (!text) return;
    const order = segments.reduce((n, s) => Math.max(n, s.order), -1) + 1;
    const segment: Segment = { id: `${source.id}:ocr:${page}:${uid()}`, sourceId: source.id, order, text, page, printedPage: labels?.[page - 1] && labels[page - 1] !== String(page) ? labels[page - 1] : undefined, origin: 'ocr-reviewed' };
    update(w => ({ ...w, sample: false, segments: [...w.segments, segment], sources: w.sources.map(s => s.id === source.id ? { ...s, scannedPages: (s.scannedPages ?? []).filter(n => n !== page), extractedPages: [...new Set([...(s.extractedPages ?? []), page])], updatedAt: nowIso() } : s) }));
    setActive(segment.id); setOcrText(''); setOcrWarnings([]); flash('أُضيف النص بعد مراجعتك وربطه بالصفحة.'); 
  };
  const requestOcr = async () => {
    if (!doc || !ocrConsent) return;
    setOcrBusy(true); setOcrError(''); setOcrWarnings([]);
    try {
      const image = await pageImageDataUrl(doc, page);
      const result = await extractPageText({ image, consent: true });
      setOcrText(result.text); setOcrWarnings(result.warnings);
    } catch (e) { setOcrError(e instanceof Error ? e.message : 'تعذر استخراج النص.'); }
    finally { setOcrBusy(false); }
  };
  const backToLibrary = () => navigate('/sources');
  return <div className="content">
    <PageHeading eyebrow={fmtKind(source.kind)} title={source.title} description="افتح المقاطع المرتبطة، وحدّد الموضع قبل حفظ أي مفهوم أو تشغيل التحليل." action={<button className="button button-secondary" onClick={backToLibrary}><ArrowRight size={15} /> المصادر</button>} />
    {source.warnings.map(w => <div className="notice notice-warn" key={w} style={{ marginBottom: 10 }}><CircleAlert size={14} /> {w}</div>)}
    {source.kind === 'pdf' && source.fileId && <section className="card" style={{ padding: 16, marginBottom: 16 }} data-testid="panel-pdf-reader">
      <h2 className="setting-title">قارئ PDF</h2><p className="setting-copy">يُعرض الملف الأصلي من التخزين المحلي، ولا يُرفع إلى خادم إتقان.</p>
      {pdfLoading && <p className="proc-line">أفتح ملف PDF…</p>}{pdfError && <div role="alert" className="notice notice-danger">{pdfError}</div>}
      {doc && <><PdfCanvas doc={doc} labels={labels} page={page} onPage={setPage} /><div className="setting-section" style={{ padding: 0, marginTop: 12 }}><h3 className="setting-title">المقاطع النصية في الصفحة {page.toLocaleString('ar')}</h3>
        {pageSegments.map(s => <button className={`card segment-row ${active === s.id ? 'is-active' : ''}`} key={s.id} onClick={() => goToSegment(s)} style={{ width: '100%', textAlign: 'right', marginTop: 7 }}><span>{s.text.slice(0, 360)}{s.text.length > 360 ? '…' : ''}</span><span className="tag">{locationLabel(s)}</span></button>)}
        {(source.scannedPages ?? []).includes(page) && <div className="ocr-panel" style={{ marginTop: 12 }}>
          <div className="notice notice-warn">هذه الصفحة ممسوحة ضوئيًا أو لم يُستخرج منها نص. جرّب OCR ثم راجع النص مع الصورة؛ نتائج العربية والمعادلات والجداول قد تخطئ.</div>
          <label className="check-row"><input type="checkbox" checked={ocrConsent} onChange={e => setOcrConsent(e.target.checked)} disabled={!caps.ocr} /> أوافق على إرسال صورة هذه الصفحة فقط إلى خدمة OCR الخارجية المؤقتة. لا أضمن سياسة احتفاظ المزود.</label>
          {!caps.ocr && <div className="setting-copy">OCR غير مهيأ الآن. يمكنك إدخال النص يدويًا في المربع أدناه.</div>}
          {caps.ocr && <button className="button button-secondary" onClick={requestOcr} disabled={!ocrConsent || ocrBusy}>{ocrBusy ? 'يعالج الصفحة…' : 'اقرأ الصفحة بـ OCR'}</button>}
          {ocrError && <div role="alert" className="notice notice-danger">{ocrError}</div>}
          {ocrWarnings.map(w => <div key={w} className="notice notice-warn">{w}</div>)}
          <div className="field"><label htmlFor="ocr-text">راجع النص المستخرج أو اكتبه يدويًا</label><textarea id="ocr-text" value={ocrText} onChange={e => setOcrText(e.target.value)} placeholder="قارن كل سطر بصورة الصفحة قبل إضافته…" /></div>
          <button className="button button-primary" disabled={!ocrText.trim()} onClick={appendOcr}>أضف النص بعد المراجعة</button>
        </div>}
      </>}
    </section>}
    {source.kind === 'youtube' && <section className="card setting-section"><h2 className="setting-title">تفريغ الفيديو</h2><p className="setting-copy">التفريغ المرفق يدويًا أو المستورد من SRT/VTT محفوظ محليًا. لا يوجد استيراد تلقائي للتحويل الكلامي من YouTube في هذا الإصدار.</p><a className="button button-secondary" href={`https://www.youtube.com/watch?v=${source.videoId}`} target="_blank" rel="noreferrer">افتح الفيديو على YouTube <ArrowDownLeft size={14} /></a></section>}
    {source.kind !== 'pdf' && <section className="card setting-section"><h2 className="setting-title">مقاطع المصدر</h2>{segments.length ? <div className="segment-list">{segments.map(s => <button className={`card segment-row ${active === s.id ? 'is-active' : ''}`} key={s.id} onClick={() => goToSegment(s)}><span>{s.text}</span><span className="tag">{locationLabel(s)}{s.startSeconds !== undefined ? ` · ${formatTime(s.startSeconds)}` : ''}</span></button>)}</div> : <Empty title="لا يوجد نص مستخرج" copy="تحقق من أن المصدر يحتوي على محتوى نصي." />}</section>}
    {selectedSegment && <div className="notice" data-testid="panel-active-citation"><b>الإحالة المحددة · {locationLabel(selectedSegment)}</b><blockquote className="preview-quote" dir="auto">{selectedSegment.text}</blockquote></div>}
    {segments.length > 0 && <section className="card setting-section" style={{ marginTop: 16 }}><h2 className="setting-title">اقترح عناصر تعلم</h2><p className="setting-copy">اختر المقاطع بعناية. لا يُرسل شيء قبل الموافقة؛ كل مقترح يحتاج مراجعتك.</p><AnalysisPanel source={source} segments={segments} selected={selected} setSelected={setSelected} onDone={() => setSelected(new Set())} /></section>}
    <section className="card setting-section"><h2 className="setting-title">اقتراحات تنتظر مراجعتك</h2><ReviewSuggestions sourceId={source.id} /></section>
  </div>;
}

function ReviewSuggestions({ sourceId }: { sourceId: string }) {
  const { ws, update, flash } = useWorkspace();
  const pending = ws.suggestions.filter(s => s.sourceId === sourceId && s.status === 'pending');
  if (!pending.length) return <p className="setting-copy">لا توجد اقتراحات قيد المراجعة.</p>;
  const decide = (suggestionId: string, accept: boolean) => {
    update(w => {
      const item = w.suggestions.find(s => s.id === suggestionId);
      if (!item) return w;
      if (!accept) return { ...w, suggestions: w.suggestions.map(s => s.id === suggestionId ? { ...s, status: 'rejected' } as typeof s : s) };
      const segment = w.segments.find(s => s.id === item.citation.segmentId);
      if (!item.verified || !segment) return w;
      if (item.type === 'concept') {
        const id = uid();
        return { ...w, sample: false, concepts: [...w.concepts, { id, title: item.title, description: item.description, sourceId, kind: item.kind, citation: item.citation, location: locationLabel(segment), status: 'قيد المراجعة', origin: 'ai-accepted', createdAt: nowIso() }], suggestions: w.suggestions.map(s => s.id === suggestionId ? { ...s, status: 'accepted', acceptedId: id } as typeof s : s) };
      }
      if (item.type === 'relation') {
        const acceptedConcepts = w.suggestions.filter((s): s is Extract<typeof s, { type: 'concept' }> => s.type === 'concept' && s.status === 'accepted' && !!s.acceptedId);
        const from = acceptedConcepts.find(s => s.key === item.fromKey)?.acceptedId ?? w.concepts.find(c => c.sourceId === sourceId && c.title === item.fromKey)?.id;
        const to = acceptedConcepts.find(s => s.key === item.toKey)?.acceptedId ?? w.concepts.find(c => c.sourceId === sourceId && c.title === item.toKey)?.id;
        if (!from || !to || from === to) return w;
        const relation: Relation = { id: uid(), fromConceptId: from, toConceptId: to, label: item.label, confidence: 0, reviewStatus: 'مقترح AI — راجعه', citation: item.citation, sourceId, origin: 'ai-accepted' };
        return { ...w, relations: [...w.relations, relation], suggestions: w.suggestions.map(s => s.id === suggestionId ? { ...s, status: 'accepted', acceptedId: relation.id } as typeof s : s) };
      }
      const linkedConcept = w.suggestions.find((s): s is Extract<typeof s, { type: 'concept' }> => s.type === 'concept' && s.key === item.conceptKey && s.status === 'accepted' && !!s.acceptedId);
      const concept = linkedConcept?.acceptedId ?? w.concepts.find(c => c.sourceId === sourceId && c.title === item.conceptKey)?.id;
      if (!concept) return w;
      const question: Question = { id: uid(), kind: item.kind, prompt: item.prompt, choices: item.choices, correctChoice: item.correctChoice, answer: item.answer, rubric: item.rubric, conceptId: concept, sourceId, citation: item.citation, location: locationLabel(segment), origin: 'ai-accepted', updatedAt: nowIso() };
      return { ...w, questions: [...w.questions, question], suggestions: w.suggestions.map(s => s.id === suggestionId ? { ...s, status: 'accepted', acceptedId: question.id } as typeof s : s) };
    });
    flash(accept ? 'حُفظ القرار بعد مراجعتك.' : 'رُفض المقترح.');
  };
  return <div className="list-stack">{pending.map(s => <article className="card suggestion-card" key={s.id} data-testid={`card-suggestion-${s.id}`}>
    <div className="row-meta"><span className="tag">{s.type === 'concept' ? 'مفهوم' : s.type === 'relation' ? 'علاقة' : 'سؤال'}</span><span>{s.verified ? 'الاقتباس موجود في المقطع' : 'تعذر التحقق من الاقتباس — لا تعتمد المقترح'}</span></div>
    <b className="row-title">{s.type === 'concept' ? s.title : s.type === 'relation' ? s.label : s.prompt}</b>
    {s.type === 'concept' && <p className="setting-copy">{s.description}</p>}
    {s.type === 'relation' && <p className="setting-copy">{s.fromKey} ← {s.label} → {s.toKey}</p>}
    {s.type === 'question' && <p className="setting-copy">{s.kind === 'mcq' ? s.choices.join(' · ') : s.answer}</p>}
    <blockquote className="preview-quote" dir="auto">{s.citation.quote}</blockquote>
    <div className="form-actions"><button className="button button-primary" disabled={!s.verified} onClick={() => decide(s.id, true)}><Check size={14} /> اقبل بعد المراجعة</button><button className="button button-secondary" onClick={() => decide(s.id, false)}>ارفض</button></div>
  </article>)}</div>;
}

function KnowledgePage() {
  const { ws, update, cascadeDelete, flash } = useWorkspace();
  const [selected, setSelected] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [label, setLabel] = useState('');
  const [search, setSearch] = useState('');
  const nodes = ws.concepts.filter(c => `${c.title} ${c.description}`.toLowerCase().includes(search.toLowerCase()));
  const active = ws.concepts.find(c => c.id === selected);
  const n = Math.max(nodes.length, 1);
  const coordinates = new Map(nodes.map((c, i) => {
    const angle = (2 * Math.PI * i / n) - Math.PI / 2;
    const radius = nodes.length <= 2 ? 115 : 175;
    return [c.id, { x: 400 + radius * Math.cos(angle), y: 245 + radius * Math.sin(angle) }];
  }));
  const addRelation = (e: FormEvent) => {
    e.preventDefault();
    if (!from || !to || from === to || !label.trim()) return;
    update(w => ({ ...w, sample: false, relations: [...w.relations, { id: uid(), fromConceptId: from, toConceptId: to, label: label.trim(), confidence: 0, reviewStatus: 'علاقة شخصية — لم توثّق بمصدر', citation: null, sourceId: null, origin: 'manual' }] }));
    setLabel(''); setShowForm(false); flash('أُضيفت العلاقة. تظهر بوصفها علاقة شخصية حتى توثيقها.');
  };
  const removeConcept = (c: Concept) => {
    const summary = describeImpact(impactOf(ws, { type: 'concept', id: c.id }));
    if (window.confirm(`حذف المفهوم «${c.title}»؟\n\n${summary.join('\n') || 'لن تتأثر عناصر أخرى.'}`)) cascadeDelete({ type: 'concept', id: c.id });
  };
  return <div className="content">
    <PageHeading eyebrow="YOUR KNOWLEDGE GRAPH" title="خريطة المعرفة" description="شبكة محلية من المفاهيم والإحالات والعلاقات. العلاقات المراجعة فقط لا تتحول تلقائيًا إلى حقائق." action={<Link href="/sources" className="button button-primary"><Plus size={15} /> مصدر / مفهوم</Link>} />
    {ws.sample && <SampleNote />}
    {showForm && <form className="card form-card" onSubmit={addRelation} data-testid="form-relation">
      <div className="form-grid"><div className="field"><label htmlFor="relation-from">من مفهوم</label><select id="relation-from" value={from} onChange={e => setFrom(e.target.value)} required><option value="">اختر…</option>{nodes.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div><div className="field"><label htmlFor="relation-to">إلى مفهوم</label><select id="relation-to" value={to} onChange={e => setTo(e.target.value)} required><option value="">اختر…</option>{nodes.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div><div className="field full"><label htmlFor="relation-label">وصف العلاقة (مثل يسبق أو يسبب)</label><input id="relation-label" value={label} onChange={e => setLabel(e.target.value)} required /></div></div>
      <p className="setting-copy">العلاقة اليدوية لا تملك اقتباسًا؛ ستظهر «علاقة شخصية — لم توثّق بمصدر».</p>
      <div className="form-actions"><button className="button button-primary"><Link2 size={14} /> احفظ العلاقة</button><button type="button" className="button button-secondary" onClick={() => setShowForm(false)}>إلغاء</button></div>
    </form>}
    {ws.concepts.length >= 2 && <button className="button button-secondary" style={{ marginBottom: 14 }} onClick={() => { setFrom(nodes[0]?.id ?? ''); setTo(nodes[1]?.id ?? ''); setShowForm(v => !v); }}><Plus size={14} /> اربط مفهومين</button>}
    <div className="map-toolbar"><label htmlFor="graph-search">بحث في المفاهيم</label><input id="graph-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="عنوان أو شرح" /></div>
    {nodes.length ? <div className="map-grid">
      <section className="card map-canvas graph-canvas" aria-label="رسم تفاعلي لعقد المعرفة وروابطها" data-testid="knowledge-graph">
        <svg viewBox="0 0 800 490" role="group" aria-label="خريطة تفاعلية. استخدم Tab لاختيار المفهوم.">
          <defs><marker id="graph-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0 0L9 4.5L0 9" fill="none" stroke="currentColor" strokeWidth="1.5" /></marker></defs>
          {ws.relations.map(r => {
            const a = coordinates.get(r.fromConceptId), b = coordinates.get(r.toConceptId);
            if (!a || !b) return null;
            const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
            return <g key={r.id} className="graph-edge" data-testid={`graph-edge-${r.id}`}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} markerEnd="url(#graph-arrow)" strokeDasharray={r.reviewStatus.includes('لم توثّق') || r.reviewStatus.includes('مقترح') ? '7 6' : undefined} /><rect x={midX - 52} y={midY - 12} width="104" height="24" rx="8" /><text x={midX} y={midY + 4} textAnchor="middle">{r.label.slice(0, 17)}</text></g>;
          })}
          {nodes.map(c => { const p = coordinates.get(c.id)!; return <g key={c.id} role="button" tabIndex={0} aria-label={`مفهوم: ${c.title}`} aria-pressed={selected === c.id} className={`graph-node ${selected === c.id ? 'selected' : ''}`} transform={`translate(${p.x} ${p.y})`} onClick={() => setSelected(selected === c.id ? null : c.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(selected === c.id ? null : c.id); } }} data-testid={`node-concept-${c.id}`}><circle r="48" /><text y="-3" textAnchor="middle">{c.title.slice(0, 14)}</text><text className="graph-node-meta" y="17" textAnchor="middle">{ws.sources.find(s => s.id === c.sourceId)?.title?.slice(0, 15) || 'مصدر'}</text></g>; })}
        </svg>
      </section>
      <aside className="card relation-list"><h2 className="section-title" style={{ fontSize: 16 }}>العلاقات ({ws.relations.length})</h2>{ws.relations.length ? ws.relations.map(r => {
        const a = ws.concepts.find(c => c.id === r.fromConceptId), b = ws.concepts.find(c => c.id === r.toConceptId);
        return <div className="relation-item" key={r.id}><b>{a?.title ?? 'مفهوم محذوف'} ← {r.label} → {b?.title ?? 'مفهوم محذوف'}</b><div className="setting-copy" style={{ margin: '4px 0' }}>{r.reviewStatus} · {r.origin === 'ai-accepted' ? 'اقتراح راجعه المتعلم' : 'إضافة شخصية'}{r.citation && r.sourceId && <Citation ws={ws} sourceId={r.sourceId} citation={r.citation} label="افتح الإحالة" />}</div></div>;
      }) : <p className="setting-copy">أضف رابطًا بين مفهومين لعرضه على الخريطة.</p>}</aside>
    </div> : <Empty title={search ? 'لا توجد نتائج' : 'لا توجد مفاهيم بعد'} copy={search ? 'امسح البحث لإظهار كل العقد.' : 'أضف مصدرًا ثم أنشئ مفهومًا يدويًا أو راجع اقتراحًا مؤسسًا على المصدر.'} icon={Network} action={<Link className="button button-primary" href="/sources">افتح المصادر</Link>} />}
    {active && <article className="card setting-section selected-concept" data-testid="panel-selected-concept"><div className="row-meta"><span className="tag">{active.kind}</span><span>{active.status}</span></div><h2 className="setting-title">{active.title}</h2><p className="setting-copy">{active.description}</p><Citation ws={ws} sourceId={active.sourceId} citation={active.citation} label={`افتح المصدر · ${active.location}`} /><div className="row-actions"><button className="icon-button" aria-label={`حذف ${active.title}`} onClick={() => removeConcept(active)}><Trash2 size={15} /></button></div></article>}
    <div className="section-head"><h2 className="section-title">كل المفاهيم</h2><span className="tag">{nodes.length.toLocaleString('ar')}</span></div>
    {nodes.length > 0 && <div className="list-stack">{nodes.map(c => <article className="card concept-row" key={c.id}><button className="row-main graph-list-button" onClick={() => setSelected(c.id)}><span className="row-title">{c.title}</span><span className="row-meta">{c.description || 'بلا وصف'} · {c.status}</span><Citation ws={ws} sourceId={c.sourceId} citation={c.citation} label={`المصدر · ${c.location}`} /></button></article>)}</div>}
    {ws.sources.length > 0 && <ManualConceptForm />}
    <div className="section-head"><h2 className="section-title">مقترحات تحتاج قرارك</h2></div>
    {ws.sources.map(s => <ReviewSuggestions key={s.id} sourceId={s.id} />)}
  </div>;
}

function ManualConceptForm() {
  const { ws, update, flash } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState(ws.sources[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const segments = ws.segments.filter(s => s.sourceId === sourceId);
  const save = (e: FormEvent) => {
    e.preventDefault();
    const seg = segments.find(s => s.id === segmentId);
    if (!title.trim() || !sourceId) return;
    const concept: Concept = { id: uid(), title: title.trim(), description: description.trim(), sourceId, kind: 'concept', citation: seg ? { segmentId: seg.id } : null, location: seg ? locationLabel(seg) : 'إضافة يدوية بلا إحالة', status: 'قيد المراجعة', origin: 'manual', createdAt: nowIso() };
    update(w => ({ ...w, sample: false, concepts: [...w.concepts, concept] }));
    setTitle(''); setDescription(''); setSegmentId(''); setOpen(false); flash('أُضيف المفهوم محليًا.');
  };
  return <section className="card setting-section"><button className="button button-secondary" onClick={() => setOpen(v => !v)}><Plus size={14} /> أضف مفهومًا يدويًا</button>{open && <form className="form-grid" onSubmit={save} style={{ marginTop: 14 }} data-testid="form-concept"><div className="field"><label htmlFor="concept-title">المفهوم</label><input id="concept-title" value={title} onChange={e => setTitle(e.target.value)} required /></div><div className="field"><label htmlFor="concept-source">المصدر</label><select id="concept-source" value={sourceId} onChange={e => { setSourceId(e.target.value); setSegmentId(''); }}>{ws.sources.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></div><div className="field full"><label htmlFor="concept-description">شرحك</label><textarea id="concept-description" value={description} onChange={e => setDescription(e.target.value)} /></div><div className="field full"><label htmlFor="concept-segment">إحالة إلى مقطع (اختياري)</label><select id="concept-segment" value={segmentId} onChange={e => setSegmentId(e.target.value)}><option value="">بلا إحالة</option>{segments.map(s => <option key={s.id} value={s.id}>{locationLabel(s)} · {s.text.slice(0, 70)}</option>)}</select></div><div className="form-actions"><button className="button button-primary">حفظ</button><button type="button" className="button button-secondary" onClick={() => setOpen(false)}>إلغاء</button></div></form>}</section>;
}

function StudyPage() {
  const { ws, update, flash } = useWorkspace();
  const [modeId, setModeId] = useState(ws.modes[0]?.id ?? '');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [confidence, setConfidence] = useState(3);
  const [shortAnswer, setShortAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [outcome, setOutcome] = useState<Evidence['outcome'] | null>(null);
  const questions = useMemo(() => ws.questions, [ws.questions]);
  const question = questions[questionIndex];
  if (!question) return <div className="content"><PageHeading eyebrow="RETRIEVAL PRACTICE" title="جلسة الاسترجاع" description="أجب أولًا؛ إتقان لا يقيّم الإتقان من إجابة واحدة." /><Empty title="لا توجد أسئلة بعد" copy="اقبل سؤالًا مقترحًا أو أضف سؤالًا من مصدر تعلمك." icon={Brain} action={<Link className="button button-primary" href="/knowledge">افتح خريطة المعرفة</Link>} /></div>;
  const segment = question.citation && ws.segments.find(s => s.id === question.citation?.segmentId);
  const snapshot = {
    prompt: question.prompt, kind: question.kind, choices: [...question.choices], correctChoice: question.correctChoice,
    answer: question.answer, rubric: question.rubric, conceptTitle: ws.concepts.find(c => c.id === question.conceptId)?.title ?? '',
    sourceTitle: ws.sources.find(s => s.id === question.sourceId)?.title ?? '', location: question.location,
    citation: question.citation, citationText: segment?.text,
  };
  const submit = (result: Evidence['outcome']) => {
    if (outcome || (question.kind === 'mcq' && choice === null)) return;
    const evidence: Evidence = { id: uid(), questionId: question.id, conceptId: question.conceptId, sourceId: question.sourceId, snapshot, activity: question.kind, selectedChoice: question.kind === 'mcq' ? choice ?? undefined : undefined, responseText: question.kind === 'short' ? shortAnswer : undefined, outcome: question.kind === 'mcq' ? choice === question.correctChoice ? 'correct' : 'incorrect' : result, confidence, assisted: false, durationMs: 0, createdAt: nowIso() };
    update(w => ({ ...w, evidence: [...w.evidence, evidence] }));
    setOutcome(evidence.outcome);
    flash('حُفظت هذه المحاولة كدليل مستقل عن تقييمك لثقتك.');
  };
  const next = () => { setQuestionIndex(i => (i + 1) % Math.max(questions.length, 1)); setChoice(null); setConfidence(3); setShortAnswer(''); setShowAnswer(false); setOutcome(null); };
  return <div className="content">
    <PageHeading eyebrow="RETRIEVAL PRACTICE" title="جلسة الاسترجاع" description="أجب دون مساعدة. المحاولة دليل واحد، لا حكم نهائي على إتقانك." action={<Link className="button button-secondary" href="/progress">عرض الأثر</Link>} />
    <section className="card study-panel" data-testid="panel-study">
      <div className="study-progress"><span>سؤال {questionIndex + 1} من {questions.length}</span><span className="tag">{question.kind === 'mcq' ? 'اختيار من متعدد' : question.kind === 'short' ? 'إجابة قصيرة' : 'بطاقة استرجاع'}</span></div>
      <div className="question" data-testid="text-question">{question.prompt}</div>
      {question.kind === 'mcq' && !outcome && <div className="choice-list">{question.choices.map((c, i) => <button key={i} className={`choice ${choice === i ? 'selected' : ''}`} aria-pressed={choice === i} onClick={() => setChoice(i)}><span className="choice-key">{i + 1}</span>{c}</button>)}</div>}
      {question.kind === 'short' && !outcome && <div className="field"><label htmlFor="short-answer">اكتب إجابتك (لا يوجد تصحيح آلي)</label><textarea id="short-answer" value={shortAnswer} onChange={e => setShortAnswer(e.target.value)} /></div>}
      {question.kind === 'flashcard' && !showAnswer && !outcome && <button className="button button-secondary" onClick={() => setShowAnswer(true)} data-testid="button-reveal-answer">أظهر الإجابة بعد محاولتي</button>}
      {(question.kind === 'flashcard' && showAnswer || question.kind === 'short' && outcome) && <div className="answer-feedback"><b>الإجابة المرجعية:</b> {question.answer}<div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{question.rubric}</div></div>}
      {!outcome && <fieldset className="confidence-options" style={{ border: 0, padding: 0 }}><legend className="setting-copy">ثقتك قبل النتيجة</legend>{[1, 2, 3, 4, 5].map(x => <button type="button" key={x} className={`confidence-chip ${confidence === x ? 'selected' : ''}`} aria-pressed={confidence === x} onClick={() => setConfidence(x)}>{x} / 5</button>)}</fieldset>}
      {question.kind === 'mcq' && !outcome && <button className="button button-primary" style={{ marginTop: 15 }} disabled={choice === null} onClick={() => submit(choice === question.correctChoice ? 'correct' : 'incorrect')}>تحقق من إجابتي</button>}
      {(question.kind === 'short' || question.kind === 'flashcard') && showAnswer && !outcome && <div className="form-actions">{(['self-met', 'self-partial', 'self-missed'] as const).map((r, i) => <button className="button button-secondary" key={r} onClick={() => submit(r)}>{['تمكنت منها', 'تذكرت جزءًا', 'لم أستطع استرجاعها'][i]}</button>)}</div>}
      {outcome && <div className="answer-feedback" role="status" data-testid="status-answer-feedback"><b>{outcome === 'correct' ? 'إجابة صحيحة' : outcome === 'incorrect' ? 'إجابة غير صحيحة' : outcome === 'self-met' ? 'قيّمتها: تذكرتها' : outcome === 'self-partial' ? 'قيّمتها: تذكرت جزءًا' : 'قيّمتها: لم أتذكرها'}</b>{question.kind === 'mcq' && <div>{question.answer}</div>}<p>ثقتك {confidence}/5 منفصلة عن نتيجة الاسترجاع.</p><Citation ws={ws} sourceId={question.sourceId} citation={question.citation} label={`ارجع إلى ${question.location}`} /><div className="form-actions"><button className="button button-primary" onClick={next}>السؤال التالي <ArrowLeft size={14} /></button><Link href="/progress" className="button button-secondary">سجل الأثر</Link></div></div>}
    </section>
  </div>;
}

function ProgressPage() {
  const { ws } = useWorkspace();
  return <div className="content"><PageHeading eyebrow="LEARNING EVIDENCE" title="أثر التعلّم" description="سجلّ المحاولات مع نسخة السؤال وقتها. الثقة الذاتية منفصلة عن النتيجة." />
    <div className="metric-grid"><Metric value={ws.evidence.length} label="محاولة مسجلة" /><Metric value={ws.evidence.filter(e => e.outcome === 'correct').length} label="إجابة اختيار صحيحة" /><Metric value={ws.evidence.filter(e => e.outcome.startsWith('self-')).length} label="تقييم ذاتي بعد الاسترجاع" /></div>
    {ws.evidence.length ? <div className="list-stack">{[...ws.evidence].reverse().map(e => <article className="card evidence-row" key={e.id} data-testid={`card-evidence-${e.id}`}><div className="row-icon"><Brain size={17} /></div><div className="row-main"><div className="row-title">{e.snapshot.prompt}</div><div className="row-meta"><span>{e.snapshot.conceptTitle || 'مفهوم غير موجود'}</span><span>{e.snapshot.sourceTitle}</span><span>{new Date(e.createdAt).toLocaleString('ar')}</span></div><div className="answer-feedback" style={{ marginTop: 8 }}>{e.outcome === 'correct' ? 'صحيحة' : e.outcome === 'incorrect' ? 'غير صحيحة' : e.outcome === 'self-met' ? 'استرجاع ذاتي: كامل' : e.outcome === 'self-partial' ? 'استرجاع ذاتي: جزئي' : 'استرجاع ذاتي: لم أتمكن'} · الثقة {e.confidence}/5 · بلا مساعدة</div><Citation ws={ws} sourceId={e.sourceId} citation={e.snapshot.citation} label={e.snapshot.location} /></div></article>)}</div> : <Empty title="لا توجد محاولات مسجلة" copy="ابدأ جلسة استرجاع مستقلة لتسجيل أول دليل." icon={ChartNoAxesColumnIncreasing} action={<Link href="/study" className="button button-primary">ابدأ الاسترجاع</Link>} />}
  </div>;
}

function Metric({ value, label }: { value: number; label: string }) { return <div className="card metric-card"><div className="metric-value">{value.toLocaleString('ar')}</div><div className="metric-label">{label}</div></div>; }

function SettingsPage() {
  const { ws, startFresh } = useWorkspace();
  const [resetError, setResetError] = useState('');
  const reset = async () => {
    if (!window.confirm('سيُحذف كل المحتوى والملفات المحلية. نزّل نسخة احتياطية أولًا إن أردت الاحتفاظ بها. هل تريد المتابعة؟')) return;
    try { await startFresh(false); setResetError(''); }
    catch (e) { setResetError(e instanceof Error ? e.message : 'تعذر إعادة الضبط.'); }
  };
  return <div className="content"><PageHeading eyebrow="YOUR PRIVACY, YOUR CHOICE" title="إعدادات مساحتك" description="لا حساب ولا مزامنة تلقائية. هذه البيانات تخص المتصفح والجهاز الحالي." />
    <section className="card setting-section"><h2 className="setting-title">تخزين محلي</h2><p className="setting-copy">المصادر والملفات والمفاهيم وسجل التعلم محفوظة في IndexedDB على هذا المتصفح. قد يمسح المتصفح بيانات الموقع؛ لا تعتبره نسخة احتياطية.</p><div className="notice"><ShieldCheck size={15} style={{ verticalAlign: 'middle', marginLeft: 7 }} /> نزّل ملف ZIP، ثم احفظه بنفسك في iCloud أو Google Drive أو مكان تختاره. لا يوجد تكامل أو مزامنة آلية.</div></section>
    <section className="card setting-section"><h2 className="setting-title">نسخ البيانات</h2><p className="setting-copy">يتضمن ZIP الملفات الأصلية والإحالات وبيانات التعلّم، مع فحص سلامة ومعاينة قبل الاستبدال.</p><BackupPanel /></section>
    <section className="card setting-section"><h2 className="setting-title">أنماط الجلسة</h2><p className="setting-copy">حدّد عدد الأسئلة للجلسة. الجلسة الحالية تعرض كل أسئلة المساحة.</p>{ws.modes.map(m => <div className="mode-item" key={m.id}><b>{m.name}</b><span>{m.questionCount} أسئلة · بلا تلميحات</span></div>)}</section>
    <section className="card setting-section"><h2 className="setting-title">الوضع الليلي</h2><p className="setting-copy">تغيير بصري يُحفظ محليًا على هذا الجهاز.</p><ThemeButton /></section>
    <section className="card setting-section"><h2 className="setting-title">إعادة ضبط المحتوى</h2><p className="setting-copy">يمسح كل البيانات والملفات المحلية ثم ينشئ مساحة فارغة. لا يمكن التراجع دون نسخة احتياطية.</p>{resetError && <div className="notice notice-danger">{resetError}</div>}<button className="button button-danger" onClick={reset} data-testid="button-reset-data"><Trash2 size={15} /> احذف المحتوى المحلي</button></section>
  </div>;
}

function ThemeButton() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => setDark(d => { const next = !d; document.documentElement.classList.toggle('dark', next); try { localStorage.setItem('itqan-theme', next ? 'dark' : 'light'); } catch { /* ignore visual preference persistence failure */ } return next; });
  return <button className="button button-secondary" onClick={toggle}>{dark ? <Sun size={15} /> : <Moon size={15} />}{dark ? 'استخدم الفاتح' : 'استخدم الداكن'}</button>;
}