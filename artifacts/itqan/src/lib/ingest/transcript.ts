export type Cue = { start: number; end?: number; text: string };

export function toSeconds(t: string): number | null {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(t.trim());
  if (!m) return null;
  if (Number(m[3]) >= 60) return null;
  if (m[1] !== undefined && Number(m[2]) >= 60) return null;
  return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]) + (m[4] ? Number(m[4].padEnd(3, '0')) / 1000 : 0);
}

/** Parse SRT or WebVTT. Invalid, reversed or out-of-order cues are rejected and counted; repeats are kept. */
export function parseSubtitles(raw: string): Cue[] { return parseSubtitlesDetailed(raw).cues; }

export function parseSubtitlesDetailed(raw: string): { cues: Cue[]; rejected: number } {
  let rejected = 0;
  const lines = raw.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '').split('\n');
  const cues: Cue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)/.exec(lines[i]);
    if (!m) continue;
    const start = toSeconds(m[1]), end = toSeconds(m[2]);
    const text: string[] = [];
    while (i + 1 < lines.length && lines[i + 1].trim() !== '') { i++; text.push(lines[i].replace(/<[^>]+>/g, '').trim()); }
    const t = text.join(' ').trim();
    const prev = cues[cues.length - 1];
    if (start === null || end === null || end < start || (prev && start < prev.start)) { rejected++; continue; }
    if (t) cues.push({ start, end, text: t });
  }
  return { cues, rejected };
}

/** Manual transcript: lines may start with a timestamp like "1:23" or "[01:02:03]". */
export function parseManual(raw: string): { cues: Cue[]; timed: boolean } {
  const cues: Cue[] = [];
  let timed = false;
  for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const l = line.trim();
    if (!l) continue;
    const m = /^\[?((?:\d+:)?\d{1,2}:\d{2})\]?\s*[-–—]?\s*(.*)$/.exec(l);
    const prevStart = cues.length ? cues[cues.length - 1].start : -1;
    if (m && toSeconds(m[1]) !== null && (toSeconds(m[1]) as number) >= prevStart) { timed = true; cues.push({ start: toSeconds(m[1]) as number, text: m[2] }); }
    else if (cues.length) cues[cues.length - 1].text += ` ${l}`;
    else cues.push({ start: -1, text: l });
  }
  return { cues: cues.filter(c => c.text.trim()), timed };
}

/** Group cues into ~45s / ~700-char segments so citations stay precise. */
export function groupCues(cues: Cue[], maxSeconds = 45, maxChars = 700): Cue[] {
  const out: Cue[] = [];
  let cur: Cue | null = null;
  for (const c of cues) {
    if (c.start < 0) { out.push(c); continue; }
    if (cur && (c.start - cur.start > maxSeconds || cur.text.length + c.text.length > maxChars)) { out.push(cur); cur = null; }
    cur = cur ? { start: cur.start, end: c.end ?? c.start, text: `${cur.text} ${c.text}` } : { ...c };
  }
  if (cur) out.push(cur);
  return out;
}
