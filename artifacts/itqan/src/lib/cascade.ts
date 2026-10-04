import type { Workspace } from './types';

export type Impact = { sources: number; segments: number; concepts: number; relations: number; questions: number; evidence: number; suggestions: number; files: number };

export type Target = { type: 'source' | 'concept' | 'question' | 'relation' | 'segment'; id: string };

/** Compute everything that must go with a target so nothing is left orphaned. */
export function collectCascade(w: Workspace, t: Target) {
  const sources = new Set<string>(), segments = new Set<string>(), concepts = new Set<string>(), relations = new Set<string>(), questions = new Set<string>(), suggestions = new Set<string>(), runs = new Set<string>();
  if (t.type === 'source') {
    sources.add(t.id);
    w.segments.forEach(s => s.sourceId === t.id && segments.add(s.id));
    w.concepts.forEach(c => c.sourceId === t.id && concepts.add(c.id));
    w.questions.forEach(q => q.sourceId === t.id && questions.add(q.id));
    w.suggestions.forEach(s => s.sourceId === t.id && suggestions.add(s.id));
    w.runs.forEach(r => r.sourceId === t.id && runs.add(r.id));
    w.relations.forEach(r => r.sourceId === t.id && relations.add(r.id));
  }
  if (t.type === 'segment') segments.add(t.id);
  if (t.type === 'concept') concepts.add(t.id);
  if (t.type === 'question') questions.add(t.id);
  if (t.type === 'relation') relations.add(t.id);
  // Items whose citation points at a removed segment lose only their citation unless their source also goes.
  w.relations.forEach(r => (concepts.has(r.fromConceptId) || concepts.has(r.toConceptId)) && relations.add(r.id));
  w.questions.forEach(q => concepts.has(q.conceptId) && questions.add(q.id));
  const evidence = new Set(w.evidence.filter(e => questions.has(e.questionId)).map(e => e.id));
  if (t.type === 'segment') w.runs.forEach(r => r.segmentIds.includes(t.id) && runs.add(r.id));
  w.suggestions.forEach(s => runs.has(s.runId) && s.status === 'pending' && suggestions.add(s.id));
  const files = new Set(w.sources.filter(s => sources.has(s.id) && s.fileId).map(s => s.fileId as string));
  const citationsCleared = t.type === 'segment' ? w.concepts.filter(c => c.citation?.segmentId === t.id).length + w.questions.filter(q => q.citation?.segmentId === t.id).length + w.relations.filter(r => r.citation?.segmentId === t.id).length : 0;
  return { sources, segments, concepts, relations, questions, evidence, suggestions, runs, files, citationsCleared };
}

export function impactOf(w: Workspace, t: Target): Impact & { citationsCleared: number } {
  const c = collectCascade(w, t);
  return { sources: c.sources.size, segments: c.segments.size, concepts: c.concepts.size, relations: c.relations.size, questions: c.questions.size, evidence: c.evidence.size, suggestions: c.suggestions.size, files: c.files.size, citationsCleared: c.citationsCleared };
}

export function applyCascade(w: Workspace, t: Target): { next: Workspace; removedFiles: string[] } {
  const c = collectCascade(w, t);
  const clear = <T extends { citation: { segmentId: string } | null }>(x: T): T => (x.citation && c.segments.has(x.citation.segmentId) ? { ...x, citation: null } : x);
  const next: Workspace = {
    ...w,
    sample: false,
    sources: w.sources.filter(s => !c.sources.has(s.id)),
    segments: w.segments.filter(s => !c.segments.has(s.id)),
    concepts: w.concepts.filter(x => !c.concepts.has(x.id)).map(clear),
    relations: w.relations.filter(x => !c.relations.has(x.id)).map(clear),
    questions: w.questions.filter(x => !c.questions.has(x.id)).map(clear),
    evidence: w.evidence.filter(x => !c.evidence.has(x.id)),
    suggestions: w.suggestions.filter(x => !c.suggestions.has(x.id)),
    runs: w.runs.filter(x => !c.runs.has(x.id)),
  };
  return { next, removedFiles: [...c.files] };
}

export function describeImpact(i: Impact & { citationsCleared: number }): string[] {
  const out: string[] = [];
  if (i.sources) out.push(`${i.sources} مصدر`);
  if (i.files) out.push(`${i.files} ملف أصلي محفوظ على الجهاز`);
  if (i.segments) out.push(`${i.segments} مقطع نصي`);
  if (i.concepts) out.push(`${i.concepts} مفهوم`);
  if (i.relations) out.push(`${i.relations} علاقة`);
  if (i.questions) out.push(`${i.questions} سؤال`);
  if (i.evidence) out.push(`${i.evidence} استجابة محفوظة كدليل`);
  if (i.suggestions) out.push(`${i.suggestions} مقترح قيد المراجعة`);
  if (i.citationsCleared) out.push(`ستُزال الإحالة من ${i.citationsCleared} عنصر (يبقى العنصر نفسه بلا سند)`);
  return out;
}
