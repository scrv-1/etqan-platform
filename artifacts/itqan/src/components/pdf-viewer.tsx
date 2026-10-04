import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronLeft, ZoomIn, ZoomOut, LoaderCircle, CircleAlert } from 'lucide-react';
import { getFile } from '@/lib/db';
import { openPdf, renderPage, type PdfDoc } from '@/lib/ingest/pdf';

export function usePdfDoc(fileId: string | undefined) {
  const [state, setState] = useState<{ doc: PdfDoc | null; labels: string[] | null; error: string; loading: boolean }>({ doc: null, labels: null, error: '', loading: !!fileId });
  useEffect(() => {
    if (!fileId) return;
    let alive = true, opened: PdfDoc | null = null;
    setState({ doc: null, labels: null, error: '', loading: true });
    (async () => {
      try {
        const f = await getFile(fileId);
        if (!f) throw new Error('الملف الأصلي غير موجود في تخزين هذا الجهاز. استعد نسخة احتياطية تتضمنه.');
        const { doc, labels } = await openPdf(await f.blob.arrayBuffer());
        opened = doc;
        if (alive) setState({ doc, labels, error: '', loading: false }); else void doc.destroy();
      } catch (e) { if (alive) setState({ doc: null, labels: null, error: e instanceof Error ? e.message : 'تعذر فتح الملف', loading: false }); }
    })();
    return () => { alive = false; void opened?.destroy(); };
  }, [fileId]);
  return state;
}

export function PdfCanvas({ doc, labels, page, onPage }: { doc: PdfDoc; labels: string[] | null; page: number; onPage: (n: number) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const [zoom, setZoom] = useState(1);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(String(page));
  useEffect(() => setDraft(String(page)), [page]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let task: Awaited<ReturnType<typeof renderPage>> | null = null;
    const c = canvas.current;
    if (!c) return;
    setRendering(true); setError('');
    renderPage(doc, page, c, Math.floor(width * zoom) - 2).then(t => {
      task = t;
      if (cancelled) { t.cancel(); return; }
      return t.promise;
    }).then(() => { if (!cancelled) setRendering(false); }).catch(e => {
      if (cancelled || (e as Error)?.name === 'RenderingCancelledException') return;
      setError('تعذر عرض هذه الصفحة.'); setRendering(false);
    });
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, page, width, zoom]);

  const go = (n: number) => { if (n >= 1 && n <= doc.numPages) onPage(n); };
  const label = labels?.[page - 1];
  return <div className="pdf-viewer">
    <div className="pdf-toolbar">
      <button className="icon-button" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="الصفحة السابقة" data-testid="button-pdf-prev"><ChevronRight size={17} /></button>
      <form onSubmit={e => { e.preventDefault(); go(Number(draft)); }} className="page-jump"><label htmlFor="pdf-page" className="sr-only">رقم الصفحة</label><input id="pdf-page" dir="ltr" inputMode="numeric" value={draft} onChange={e => setDraft(e.target.value.replace(/\D/g, ''))} onBlur={() => go(Number(draft))} data-testid="input-pdf-page" /><span>/ {doc.numPages}</span></form>
      <button className="icon-button" onClick={() => go(page + 1)} disabled={page >= doc.numPages} aria-label="الصفحة التالية" data-testid="button-pdf-next"><ChevronLeft size={17} /></button>
      {label && label !== String(page) && <span className="tag" data-testid="text-printed-page">المطبوعة: {label}</span>}
      <span style={{ flex: 1 }} />
      {rendering && <LoaderCircle size={14} className="spin" aria-label="يعرض" />}
      <button className="icon-button" onClick={() => setZoom(z => Math.max(0.6, +(z - 0.2).toFixed(1)))} aria-label="تصغير" data-testid="button-zoom-out"><ZoomOut size={16} /></button>
      <span className="mono-small">{Math.round(zoom * 100)}%</span>
      <button className="icon-button" onClick={() => setZoom(z => Math.min(2.4, +(z + 0.2).toFixed(1)))} aria-label="تكبير" data-testid="button-zoom-in"><ZoomIn size={16} /></button>
    </div>
    <div className="pdf-stage" ref={wrap}>
      {error ? <div className="notice notice-danger"><CircleAlert size={14} /> {error}</div> : <canvas ref={canvas} className="pdf-canvas" aria-label={`صفحة ${page} من الملف`} data-testid="canvas-pdf-page" />}
    </div>
  </div>;
}
