import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { LIMITS } from '../types';
import { chunkText } from '../util';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDoc = PDFDocumentProxy;

export async function openPdf(data: ArrayBuffer): Promise<{ doc: PdfDoc; labels: string[] | null }> {
  // pdf.js transfers the buffer to its worker; pass a copy so callers keep theirs.
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)), isEvalSupported: false });
  let doc: PdfDoc;
  try { doc = await task.promise; }
  catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'PasswordException') throw new Error('الملف محمي بكلمة مرور؛ لا يمكن قراءته.');
    throw new Error('تعذر فتح ملف PDF؛ قد يكون تالفًا أو ليس PDF.');
  }
  if (doc.numPages > LIMITS.pdfMaxPages) { await doc.destroy(); throw new Error(`الملف يحتوي ${doc.numPages} صفحة، والحد المسموح ${LIMITS.pdfMaxPages}.`); }
  let labels: string[] | null = null;
  try { labels = await doc.getPageLabels(); } catch { labels = null; }
  return { doc, labels };
}

export type PageText = { page: number; printedPage?: string; text: string; scanned: boolean };

async function pageText(doc: PdfDoc, n: number): Promise<string> {
  const page = await doc.getPage(n);
  const content = await page.getTextContent();
  let out = '';
  for (const item of content.items) {
    if (!('str' in item)) continue;
    out += item.str;
    if (item.hasEOL) out += '\n';
    else if (item.str && !item.str.endsWith(' ')) out += ' ';
  }
  page.cleanup();
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Extract selected pages one at a time; checks the abort signal between pages. */
export async function extractPages(doc: PdfDoc, labels: string[] | null, pages: number[], signal: AbortSignal, onProgress: (done: number, total: number) => void): Promise<PageText[]> {
  if (pages.length > LIMITS.pdfPagesPerExtraction) throw new Error(`الحد ${LIMITS.pdfPagesPerExtraction} صفحة في كل استخراج.`);
  const out: PageText[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    const n = pages[i];
    const text = await pageText(doc, n);
    const letters = (text.match(/[\p{L}\p{N}]/gu) || []).length;
    const label = labels?.[n - 1];
    out.push({ page: n, printedPage: label && label !== String(n) ? label : undefined, text, scanned: letters < 25 });
    onProgress(i + 1, pages.length);
    await new Promise(r => setTimeout(r, 0));
  }
  return out;
}

export function pageSegments(sourceId: string, p: PageText, startOrder: number) {
  return chunkText(p.text).map((text, i) => ({ id: `${sourceId}:p${p.page}:${i}`, sourceId, order: startOrder + i, text, page: p.page, printedPage: p.printedPage, origin: 'pdf-text' as const }));
}

/** Render a page to a canvas at a given CSS width. Returns the render task for cancellation. */
export async function renderPage(doc: PdfDoc, n: number, canvas: HTMLCanvasElement, cssWidth: number) {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = cssWidth / base.width;
  const vp = page.getViewport({ scale: scale * dpr });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
  canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
  const task = page.render({ canvas, viewport: vp });
  return task;
}

/** Render a page to a JPEG data URL whose longest edge is <= maxPx, for OCR after consent. */
export async function pageImageDataUrl(doc: PdfDoc, n: number, maxPx = LIMITS.ocrMaxPx): Promise<string> {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = maxPx / Math.max(base.width, base.height);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
  await page.render({ canvas, viewport: vp }).promise;
  let quality = 0.85, url = canvas.toDataURL('image/jpeg', quality);
  while (url.length > LIMITS.ocrImageChars && quality > 0.4) { quality -= 0.15; url = canvas.toDataURL('image/jpeg', quality); }
  if (url.length > LIMITS.ocrImageChars) throw new Error('صورة الصفحة أكبر من الحد المسموح للإرسال.');
  return url;
}
