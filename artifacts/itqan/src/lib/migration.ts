import type { Workspace, Segment, Source, Concept, Relation, Question, Evidence, StudyMode } from './types';
import { DEFAULT_MODES } from './seed';
import { chunkText, nowIso } from './util';

export const LEGACY_KEY = 'itqan-workspace-v1';

type LSource = { id: string; title: string; type: string; content: string; createdAt: string };
type LConcept = { id: string; title: string; description: string; sourceId: string; sourceLocation: string; status: string };
type LRelation = { id: string; fromConceptId: string; toConceptId: string; label: string; confidence: number; reviewStatus: string };
type LQuestion = { id: string; prompt: string; choices: string[]; correctChoice: number; conceptId: string; sourceId: string; sourceLocation: string };
type LEvidence = { id: string; questionId: string; conceptId: string; selectedChoice: number; correct: boolean; confidence: number; assisted: false; createdAt: string };
export type LegacyStore = { schema: 1; sample: boolean; sources: LSource[]; concepts: LConcept[]; relations: LRelation[]; questions: LQuestion[]; evidence: LEvidence[]; modes: StudyMode[] };

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export function isLegacyStore(value: unknown): value is LegacyStore {
  if (!isRec(value) || value.schema !== 1 || typeof value.sample !== 'boolean') return false;
  const keys = ['sources', 'concepts', 'relations', 'questions', 'evidence', 'modes'];
  if (!keys.every(k => Array.isArray(value[k]))) return false;
  const s = (x: unknown, ks: string[]) => isRec(x) && ks.every(k => typeof x[k] === 'string');
  return (value.sources as unknown[]).every(x => s(x, ['id', 'title', 'type', 'content', 'createdAt'])) &&
    (value.concepts as unknown[]).every(x => s(x, ['id', 'title', 'description', 'sourceId', 'sourceLocation', 'status'])) &&
    (value.relations as unknown[]).every(x => s(x, ['id', 'fromConceptId', 'toConceptId', 'label', 'reviewStatus'])) &&
    (value.questions as unknown[]).every(x => s(x, ['id', 'prompt', 'conceptId', 'sourceId', 'sourceLocation']) && Array.isArray((x as Record<string, unknown>).choices)) &&
    (value.evidence as unknown[]).every(x => s(x, ['id', 'questionId', 'conceptId', 'createdAt']));
}

export type LegacyRead = { status: 'none' } | { status: 'invalid'; raw: string } | { status: 'valid'; store: LegacyStore; raw: string };

export function readLegacy(): LegacyRead {
  let raw: string | null = null;
  try { raw = localStorage.getItem(LEGACY_KEY); } catch { return { status: 'none' }; }
  if (!raw) return { status: 'none' };
  try {
    const v: unknown = JSON.parse(raw);
    return isLegacyStore(v) ? { status: 'valid', store: v, raw } : { status: 'invalid', raw };
  } catch { return { status: 'invalid', raw }; }
}

export type MigrationReport = { workspace: Workspace; dropped: string[]; counts: Record<string, number> };

/** Convert v1 store to v2 without mutating input. Orphans are reported, never silently invented. */
export function migrateLegacy(old: LegacyStore): MigrationReport {
  const dropped: string[] = [];
  const t = nowIso();
  const sources: Source[] = [], segments: Segment[] = [];
  for (const s of old.sources) {
    sources.push({ id: s.id, title: s.title, kind: 'legacy', createdAt: s.createdAt || t, updatedAt: t, warnings: [], note: s.type });
    chunkText(s.content).forEach((text, i) => segments.push({ id: `${s.id}:${i}`, sourceId: s.id, order: i, text, origin: 'legacy' }));
    if (!s.content.trim()) segments.push({ id: `${s.id}:0`, sourceId: s.id, order: 0, text: s.title, origin: 'legacy' });
  }
  const srcIds = new Set(sources.map(s => s.id));
  const concepts: Concept[] = [];
  for (const c of old.concepts) {
    if (!srcIds.has(c.sourceId)) { dropped.push(`مفهوم «${c.title}» بلا مصدر`); continue; }
    concepts.push({ id: c.id, title: c.title, description: c.description, sourceId: c.sourceId, kind: 'concept', citation: null, location: c.sourceLocation, status: c.status, origin: 'legacy', createdAt: t });
  }
  const cIds = new Set(concepts.map(c => c.id));
  const cSource = new Map(concepts.map(c => [c.id, c.sourceId]));
  const relations: Relation[] = [];
  for (const r of old.relations) {
    if (!cIds.has(r.fromConceptId) || !cIds.has(r.toConceptId)) { dropped.push(`علاقة «${r.label}» تشير لمفهوم مفقود`); continue; }
    relations.push({ id: r.id, fromConceptId: r.fromConceptId, toConceptId: r.toConceptId, label: r.label, confidence: typeof r.confidence === 'number' ? r.confidence : 50, reviewStatus: r.reviewStatus, citation: null, sourceId: cSource.get(r.fromConceptId) ?? null, origin: 'legacy' });
  }
  const questions: Question[] = [];
  for (const q of old.questions) {
    if (!cIds.has(q.conceptId) || !srcIds.has(q.sourceId)) { dropped.push(`سؤال «${q.prompt.slice(0, 40)}» بلا مفهوم أو مصدر`); continue; }
    const choices = q.choices.map(String);
    const cc = Math.min(Math.max(0, q.correctChoice), choices.length - 1);
    questions.push({ id: q.id, kind: 'mcq', prompt: q.prompt, choices, correctChoice: cc, answer: choices[cc] ?? '', rubric: '', conceptId: q.conceptId, sourceId: q.sourceId, citation: null, location: q.sourceLocation, origin: 'legacy', updatedAt: t });
  }
  const qById = new Map(questions.map(q => [q.id, q]));
  const conById = new Map(concepts.map(c => [c.id, c]));
  const srcById = new Map(sources.map(s => [s.id, s]));
  const evidence: Evidence[] = [];
  for (const e of old.evidence) {
    const q = qById.get(e.questionId);
    if (!q) { dropped.push('استجابة لسؤال محذوف'); continue; }
    evidence.push({
      id: e.id, questionId: q.id, conceptId: q.conceptId, sourceId: q.sourceId, activity: 'mcq', selectedChoice: e.selectedChoice,
      outcome: e.correct ? 'correct' : 'incorrect', confidence: e.confidence, assisted: false, durationMs: 0, createdAt: e.createdAt,
      snapshot: { prompt: q.prompt, kind: 'mcq', choices: q.choices, correctChoice: q.correctChoice, answer: q.answer, rubric: '', conceptTitle: conById.get(q.conceptId)?.title ?? '', sourceTitle: srcById.get(q.sourceId)?.title ?? '', location: q.location, citation: null },
    });
  }
  const modes = old.modes.filter(m => m && typeof m.name === 'string' && typeof m.questionCount === 'number').map(m => ({ ...m, allowHints: false }));
  const workspace: Workspace = { schema: 2, sample: old.sample, sources, segments, concepts, relations, questions, evidence, modes: modes.length ? modes : DEFAULT_MODES.map(m => ({ ...m })), suggestions: [], runs: [], migratedFromLegacyAt: t };
  return { workspace, dropped, counts: { sources: sources.length, concepts: concepts.length, relations: relations.length, questions: questions.length, evidence: evidence.length } };
}
