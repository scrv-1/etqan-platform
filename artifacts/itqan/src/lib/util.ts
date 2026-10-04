export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
export const nowIso = () => new Date().toISOString();

export async function sha256(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Normalise Arabic/Latin text for quote verification and search. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[«»"“”'‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} م.ب`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} ج.ب`;
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), rr = String(r).padStart(2, '0');
  return h ? `${h}:${mm}:${rr}` : `${mm}:${rr}`;
}

/** Parse "1-5, 9, 12-14" into a sorted unique page list. Returns error string on failure. */
export function parsePageRange(input: string, max: number): number[] | string {
  const out = new Set<number>();
  const cleaned = input.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/،/g, ',').trim();
  if (!cleaned) return 'اكتب أرقام الصفحات، مثل 1-10 أو 3, 7, 12.';
  for (const part of cleaned.split(',')) {
    const p = part.trim();
    if (!p) continue;
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(p);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      if (a < 1 || b < a) return `نطاق غير صالح: ${p}`;
      if (b - a > 1000) return `نطاق كبير جدًا: ${p}`;
      for (let i = a; i <= b; i++) out.add(i);
    } else if (/^\d+$/.test(p)) out.add(Number(p));
    else return `لم أفهم «${p}».`;
  }
  const list = [...out].sort((a, b) => a - b);
  if (!list.length) return 'لم تحدد أي صفحة.';
  if (list[list.length - 1] > max) return `الملف يحتوي ${max} صفحة فقط.`;
  return list;
}

/** Split long text into readable chunks on paragraph / sentence boundaries. */
export function chunkText(text: string, target = 900): string[] {
  const paras = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of paras) {
    if (p.length <= target * 1.4) { out.push(p); continue; }
    const sentences = p.split(/(?<=[.!?؟。]|\n)\s+/);
    let cur = '';
    for (const s of sentences) {
      if ((cur + ' ' + s).length > target && cur) { out.push(cur.trim()); cur = s; }
      else cur = cur ? `${cur} ${s}` : s;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out.flatMap(c => (c.length > target * 3 ? c.match(new RegExp(`[\\s\\S]{1,${target * 2}}`, 'g')) || [c] : [c]));
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof DOMException && err.name === 'AbortError') return 'أُلغيت العملية.';
  if (typeof err === 'object' && err) {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string') return (data as { error: string }).error;
    const status = (err as { status?: unknown }).status;
    if (typeof status === 'number') return `${fallback} (رمز ${status})`;
  }
  if (err instanceof Error && err.message) return `${fallback}: ${err.message}`;
  return fallback;
}

export function isAbort(err: unknown) {
  return (err instanceof DOMException && err.name === 'AbortError') || (err instanceof Error && err.name === 'AbortError');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
