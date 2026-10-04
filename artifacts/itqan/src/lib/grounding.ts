import type { AnalysisResult } from '@workspace/api-client-react';
import type { Segment, Suggestion, Workspace } from './types';
import { normalizeText, uid } from './util';

/** A quote is verified only if (normalised) it appears verbatim inside the referenced segment. */
export function verifyQuote(segments: Map<string, Segment>, segmentId: string, quote: string): boolean {
  const seg = segments.get(segmentId);
  if (!seg || !quote) return false;
  const q = normalizeText(quote);
  return q.length >= 4 && normalizeText(seg.text).includes(q);
}

export function suggestionsFromAnalysis(result: AnalysisResult, sent: Segment[], sourceId: string, runId: string, existing: Workspace): Suggestion[] {
  const map = new Map(sent.map(s => [s.id, s]));
  const known = new Set([
    ...existing.concepts.filter(c => c.sourceId === sourceId).map(c => normalizeText(c.title)),
    ...existing.suggestions.filter(s => s.type === 'concept' && s.sourceId === sourceId && s.status !== 'rejected').map(s => normalizeText((s as { title: string }).title)),
  ]);
  const knownQ = new Set([
    ...existing.questions.filter(q => q.sourceId === sourceId).map(q => normalizeText(q.prompt)),
    ...existing.suggestions.filter(s => s.type === 'question' && s.sourceId === sourceId && s.status !== 'rejected').map(s => normalizeText((s as { prompt: string }).prompt)),
  ]);
  const out: Suggestion[] = [];
  const keys = new Set<string>();
  for (const c of result.concepts) {
    const n = normalizeText(c.title);
    keys.add(c.key);
    if (known.has(n)) continue;
    known.add(n);
    out.push({ id: uid(), runId, sourceId, type: 'concept', status: 'pending', verified: verifyQuote(map, c.reference.segmentId, c.reference.quote), key: c.key, title: c.title, description: c.description, kind: c.kind, citation: { segmentId: c.reference.segmentId, quote: c.reference.quote } });
  }
  for (const r of result.relations) {
    out.push({ id: uid(), runId, sourceId, type: 'relation', status: 'pending', verified: verifyQuote(map, r.reference.segmentId, r.reference.quote), fromKey: r.fromKey, toKey: r.toKey, label: r.label, citation: { segmentId: r.reference.segmentId, quote: r.reference.quote } });
  }
  for (const q of result.questions) {
    const n = normalizeText(q.prompt);
    if (knownQ.has(n)) continue;
    knownQ.add(n);
    const choices = q.kind === 'mcq' ? q.choices : [];
    const valid = q.kind !== 'mcq' || (choices.length >= 2 && q.correctChoice >= 0 && q.correctChoice < choices.length);
    if (!valid) continue;
    out.push({ id: uid(), runId, sourceId, type: 'question', status: 'pending', verified: verifyQuote(map, q.reference.segmentId, q.reference.quote), conceptKey: q.conceptKey, kind: q.kind, prompt: q.prompt, choices, correctChoice: q.kind === 'mcq' ? q.correctChoice : 0, answer: q.answer, rubric: q.rubric, citation: { segmentId: q.reference.segmentId, quote: q.reference.quote } });
  }
  return out;
}
