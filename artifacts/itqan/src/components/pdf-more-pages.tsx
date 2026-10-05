import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, RotateCcw, X } from 'lucide-react';
import { useWorkspace } from '@/state/workspace';
import { LIMITS, type Source } from '@/lib/types';
import { isAbort, nowIso, parsePageRange } from '@/lib/util';
import { extractPages, pageSegments, type PdfDoc } from '@/lib/ingest/pdf';
import { ProgressBar } from './common';

function compactPageRange(pages: number[]) {
  const ranges: [number, number][] = [];
  for (const page of pages) {
    const last = ranges[ranges.length - 1];
    if (last && page === last[1] + 1) last[1] = page;
    else ranges.push([page, page]);
  }
  return ranges.map(([start, end]) => start === end ? `${start}` : `${start}-${end}`).join(', ');
}

export function PdfMorePages({ source, doc, labels }: { source: Source; doc: PdfDoc; labels: string[] | null }) {
  const { ws, update, flash } = useWorkspace();
  const [range, setRange] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const maxPages = source.pageCount ?? doc.numPages;
  const extractedPages = source.extractedPages ?? [];
  const extractedSignature = [...new Set(extractedPages)].sort((a, b) => a - b).join(',');
  const extracted = new Set(extractedPages);
  const availablePages = Array.from({ length: maxPages }, (_, i) => i + 1).filter(page => !extracted.has(page));

  useEffect(() => {
    setRange(compactPageRange(availablePages.slice(0, LIMITS.pdfPagesPerExtraction)));
    setError('');
    setProgress(0);
  // Reset the suggested range only when extraction state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id, maxPages, extractedSignature]);
  useEffect(() => () => abort.current?.abort(), []);

  const parsed = range ? parsePageRange(range, maxPages) : 'اكتب أرقام الصفحات المراد استخراجها.';
  const rangeError = availablePages.length === 0 ? '' :
    typeof parsed === 'string' ? parsed :
    parsed.length > LIMITS.pdfPagesPerExtraction ? `الحد ${LIMITS.pdfPagesPerExtraction} صفحة في كل مرة.` :
    parsed.some(page => extracted.has(page)) ? 'تتضمن المجموعة صفحة سبق استخراجها؛ اختر صفحات أخرى.' : '';
  const selectedPages = Array.isArray(parsed) && !rangeError ? parsed : [];

  const run = async () => {
    if (!selectedPages.length || busy) return;
    setBusy(true); setError(''); setProgress(0);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const pages = await extractPages(doc, labels, selectedPages, controller.signal, (done, total) => setProgress(done / total));
      if (controller.signal.aborted) throw new DOMException('aborted', 'AbortError');
      const currentChars = ws.segments.filter(segment => segment.sourceId === source.id).reduce((total, segment) => total + segment.text.length, 0);
      const addedChars = pages.filter(page => !page.scanned).reduce((total, page) => total + page.text.length, 0);
      if (currentChars + addedChars > LIMITS.sourceChars) throw new Error('النص المستخرج سيتجاوز الحد المسموح لهذا المصدر. اختر صفحات أقل.');
      update(w => {
        const current = w.sources.find(item => item.id === source.id);
        if (!current) return w;
        const existingPages = new Set(current.extractedPages ?? []);
        const addedPages = pages.filter(page => !existingPages.has(page.page));
        if (!addedPages.length) return w;

        let order = w.segments.filter(segment => segment.sourceId === source.id).reduce((last, segment) => Math.max(last, segment.order), -1) + 1;
        const addedSegments = addedPages.filter(page => !page.scanned).flatMap(page => {
          const segments = pageSegments(source.id, page, order);
          order += segments.length;
          return segments;
        });
        const segmentIds = new Set(w.segments.map(segment => segment.id));
        const uniqueSegments = addedSegments.filter(segment => !segmentIds.has(segment.id));
        const allExtracted = [...new Set([...(current.extractedPages ?? []), ...addedPages.map(page => page.page)])].sort((a, b) => a - b);
        const scannedPages = [...new Set([...(current.scannedPages ?? []), ...addedPages.filter(page => page.scanned).map(page => page.page)])].sort((a, b) => a - b);
        const warnings = (current.warnings ?? []).filter(warning => !/^\d+ صفحة بلا طبقة نصية/.test(warning));
        if (scannedPages.length) warnings.push(`${scannedPages.length} صفحة بلا طبقة نصية (ممسوحة ضوئيًا على الأرجح): ${scannedPages.slice(0, 12).join('، ')}${scannedPages.length > 12 ? '…' : ''}`);
        if (labels && addedPages.some(page => page.printedPage) && !warnings.some(warning => warning.includes('أرقام الصفحات المطبوعة'))) {
          warnings.push('أرقام الصفحات المطبوعة تختلف عن ترقيم الملف؛ تظهر الاثنتان في الإحالات.');
        }

        return {
          ...w,
          sample: false,
          segments: [...w.segments, ...uniqueSegments],
          sources: w.sources.map(item => item.id === source.id ? {
            ...item,
            extractedPages: allExtracted,
            scannedPages,
            warnings,
            updatedAt: nowIso(),
          } : item),
        };
      });
      const textPages = pages.filter(page => !page.scanned).length;
      flash(textPages
        ? `استُخرج النص من ${textPages} صفحة إضافية. اختر مقاطعها في قسم اقتراح الأسئلة.`
        : `فُحصت ${pages.length} صفحة ولم تحتوِ على طبقة نصية؛ استخدم OCR من القارئ بعد موافقتك وراجع النص.`);
    } catch (cause) {
      setError(isAbort(cause) ? 'أُلغي الاستخراج.' : cause instanceof Error ? cause.message : 'تعذر استخراج الصفحات.');
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  return <div className="pdf-more-pages" data-testid="panel-more-pages">
    <h3 className="setting-title">استخراج صفحات إضافية</h3>
    <p className="setting-copy">فُحصت {extractedPages.length.toLocaleString('ar')} من {maxPages.toLocaleString('ar')} صفحة. اختر صفحات أخرى حتى {LIMITS.pdfPagesPerExtraction} صفحة في كل دفعة. الصفحات المصورة تحتاج OCR منفصلًا. الملف الأصلي يبقى على جهازك.</p>
    {availablePages.length > 0
      ? <div className="form-grid">
        <div className="field"><label htmlFor="pdf-more-range">الصفحات الجديدة</label><input id="pdf-more-range" dir="ltr" value={range} onChange={event => setRange(event.target.value)} placeholder="11-20" data-testid="input-more-pages-range" /></div>
        <div className="field" style={{ alignSelf: 'end' }}>
          {busy
            ? <button className="button button-secondary" onClick={() => abort.current?.abort()} data-testid="button-cancel-more-pages"><X size={15} /> إلغاء</button>
            : <button className="button button-primary" disabled={!!rangeError || !selectedPages.length} onClick={run} data-testid="button-extract-more-pages"><Check size={15} /> استخرج الصفحات</button>}
        </div>
        {rangeError && <div className="field-error full" role="alert" data-testid="status-more-pages-range">{rangeError}</div>}
      </div>
      : <div className="notice">فُحصت كل صفحات الملف. الصفحات الممسوحة تحتاج OCR من صفحة القارئ.</div>}
    {busy && <div style={{ marginTop: 10 }}><ProgressBar value={progress} label="تقدم استخراج الصفحات" /><div className="proc-line"><LoaderCircle size={14} className="spin" /> استخراج النص… {Math.round(progress * 100)}%</div></div>}
    {error && <div className="notice notice-danger" role="alert" data-testid="status-more-pages-error"><RotateCcw size={14} /> {error}</div>}
  </div>;
}
