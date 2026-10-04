import { LIMITS, type SourceKind } from '../types';

export function detectKind(file: File): SourceKind | null {
  const n = file.name.toLowerCase();
  if (n.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (n.endsWith('.docx')) return 'docx';
  if (n.endsWith('.md') || n.endsWith('.markdown')) return 'markdown';
  if (n.endsWith('.txt') || file.type === 'text/plain') return 'text';
  return null;
}

export async function readTextFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { text = new TextDecoder('windows-1256').decode(buf); }
  return text.replace(/^\uFEFF/, '');
}

export async function readDocx(file: File): Promise<{ text: string; warnings: string[] }> {
  const mammoth = await import('mammoth');
  const lib = (mammoth as unknown as { default?: typeof mammoth }).default ?? mammoth;
  try {
    const r = await lib.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { text: r.value, warnings: r.messages.filter(m => m.type === 'warning').slice(0, 5).map(m => m.message) };
  } catch {
    throw new Error('تعذر قراءة ملف DOCX؛ قد يكون تالفًا أو بصيغة DOC قديمة.');
  }
}

export function checkTextLimit(text: string) {
  if (!text.trim()) throw new Error('لم أجد نصًا قابلًا للقراءة في هذا الملف.');
  if (text.length > LIMITS.sourceChars) throw new Error(`النص أطول من الحد (${LIMITS.sourceChars.toLocaleString('ar')} حرف). قسّمه إلى أكثر من مصدر.`);
}
