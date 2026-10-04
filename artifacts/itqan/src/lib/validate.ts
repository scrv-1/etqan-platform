import type { Workspace } from './types';

const oneOf = (v: unknown, xs: string[]) => typeof v === 'string' && xs.includes(v);
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (o: Record<string, unknown>, k: string) => typeof o[k] === 'string';
const optStr = (o: Record<string, unknown>, k: string) => o[k] === undefined || typeof o[k] === 'string';
const optNum = (o: Record<string, unknown>, k: string) => o[k] === undefined || (typeof o[k] === 'number' && Number.isFinite(o[k]));
const num = (o: Record<string, unknown>, k: string) => typeof o[k] === 'number' && Number.isFinite(o[k]);
const intIn = (o: Record<string, unknown>, k: string, min: number, max: number) => Number.isInteger(o[k]) && (o[k] as number) >= min && (o[k] as number) <= max;
const optIntMin = (o: Record<string, unknown>, k: string, min: number) => o[k] === undefined || (Number.isInteger(o[k]) && (o[k] as number) >= min);
const optNumMin = (o: Record<string, unknown>, k: string, min: number) => o[k] === undefined || (typeof o[k] === 'number' && Number.isFinite(o[k]) && (o[k] as number) >= min);
const strArr = (v: unknown) => Array.isArray(v) && v.every(x => typeof x === 'string');
const QK = ['mcq', 'flashcard', 'short'];
const snapshotOk = (v: unknown) => isRec(v) && str(v, 'prompt') && oneOf(v.kind, QK) && strArr(v.choices) && num(v, 'correctChoice') && str(v, 'answer') && str(v, 'rubric') && str(v, 'conceptTitle') && str(v, 'sourceTitle') && str(v, 'location') && citation(v.citation) && optStr(v, 'citationText');
const citation = (v: unknown) => v === null || (isRec(v) && str(v, 'segmentId') && optStr(v, 'quote'));


/** Structural validation of a v2 workspace. Returns a list of problems (empty = valid). */
export function validateWorkspaceShape(v: unknown): string[] {
  const errs: string[] = [];
  if (!isRec(v)) return ['ليس كائن بيانات'];
  if (v.schema !== 2) errs.push(`إصدار مخطط غير مدعوم: ${String(v.schema)}`);
  if (typeof v.sample !== 'boolean') errs.push('حقل sample مفقود');
  const arr = (k: string, check: (x: Record<string, unknown>) => boolean) => {
    const a = v[k];
    if (!Array.isArray(a)) { errs.push(`القائمة ${k} مفقودة`); return; }
    a.forEach((x, i) => { if (!isRec(x) || !check(x)) errs.push(`عنصر غير صالح في ${k} رقم ${i + 1}`); });
  };
  arr('sources', x => str(x, 'id') && str(x, 'title') && oneOf(x.kind, ['pdf', 'text', 'markdown', 'docx', 'youtube', 'article', 'paste', 'legacy']) && str(x, 'createdAt') && strArr(x.warnings) && optStr(x, 'fileId') && optIntMin(x, 'pageCount', 1) && optNumMin(x, 'fileSize', 0) && (x.extractedPages === undefined || (Array.isArray(x.extractedPages) && x.extractedPages.every(n => Number.isInteger(n) && n >= 1))) && (x.scannedPages === undefined || (Array.isArray(x.scannedPages) && x.scannedPages.every(n => Number.isInteger(n) && n >= 1))));
  arr('segments', x => str(x, 'id') && str(x, 'sourceId') && str(x, 'text') && num(x, 'order') && optIntMin(x, 'page', 1) && optNumMin(x, 'startSeconds', 0) && optNumMin(x, 'endSeconds', 0) && oneOf(x.origin, ['text', 'pdf-text', 'ocr-reviewed', 'transcript-manual', 'transcript-file', 'article', 'legacy']));
  arr('concepts', x => str(x, 'id') && str(x, 'title') && str(x, 'description') && str(x, 'sourceId') && oneOf(x.kind, ['concept', 'prerequisite', 'example']) && citation(x.citation) && str(x, 'location') && str(x, 'status'));
  arr('relations', x => str(x, 'id') && str(x, 'fromConceptId') && str(x, 'toConceptId') && str(x, 'label') && num(x, 'confidence') && (x.confidence as number) >= 0 && (x.confidence as number) <= 100 && str(x, 'reviewStatus') && (x.sourceId === null || typeof x.sourceId === 'string') && citation(x.citation));
  arr('questions', x => str(x, 'id') && oneOf(x.kind, ['mcq', 'flashcard', 'short']) && str(x, 'prompt') && strArr(x.choices) && Number.isInteger(x.correctChoice) && str(x, 'answer') && str(x, 'rubric') && str(x, 'conceptId') && str(x, 'sourceId') && citation(x.citation) && (x.kind !== 'mcq' || ((x.choices as unknown[]).length >= 2 && (x.correctChoice as number) >= 0 && (x.correctChoice as number) < (x.choices as unknown[]).length)));
  arr('evidence', x => str(x, 'id') && str(x, 'questionId') && str(x, 'conceptId') && str(x, 'sourceId') && snapshotOk(x.snapshot) && oneOf(x.activity, QK) && oneOf(x.outcome, ['correct', 'incorrect', 'self-met', 'self-partial', 'self-missed']) && intIn(x, 'confidence', 1, 5) && typeof x.assisted === 'boolean' && optNumMin(x, 'durationMs', 0) && optIntMin(x, 'selectedChoice', 0) && optStr(x, 'responseText') && str(x, 'createdAt'));
  arr('modes', x => str(x, 'id') && str(x, 'name') && intIn(x, 'questionCount', 1, 200) && typeof x.allowHints === 'boolean');
  arr('suggestions', x => str(x, 'id') && str(x, 'sourceId') && oneOf(x.type, ['concept', 'relation', 'question']) && str(x, 'runId') && oneOf(x.status, ['pending', 'accepted', 'rejected']) && typeof x.verified === 'boolean' && citation(x.citation) && (x.type !== 'concept' || (str(x, 'title') && str(x, 'description') && oneOf(x.kind, ['concept', 'prerequisite', 'example']))) && (x.type !== 'relation' || (str(x, 'fromKey') && str(x, 'toKey') && str(x, 'label'))) && (x.type !== 'question' || (str(x, 'prompt') && oneOf(x.kind, QK) && strArr(x.choices) && Number.isInteger(x.correctChoice))));
  arr('runs', x => str(x, 'id') && str(x, 'sourceId') && str(x, 'hash') && strArr(x.segmentIds) && strArr(x.warnings));
  return errs;
}

/** Referential integrity: every reference resolves. fileIds are the ids of available stored files. */
export function checkIntegrity(w: Workspace, fileIds?: Set<string>): string[] {
  const errs: string[] = [];
  const ids = (xs: { id: string }[], label: string) => {
    const s = new Set<string>();
    xs.forEach(x => { if (s.has(x.id)) errs.push(`معرّف مكرر في ${label}: ${x.id}`); s.add(x.id); });
    return s;
  };
  const src = ids(w.sources, 'المصادر'), seg = ids(w.segments, 'المقاطع'), con = ids(w.concepts, 'المفاهيم'), q = ids(w.questions, 'الأسئلة');
  ids(w.relations, 'العلاقات'); ids(w.evidence, 'الأدلة'); ids(w.suggestions, 'المقترحات');
  const segById = new Map(w.segments.map(s => [s.id, s]));
  const cite = (c: { segmentId: string } | null, sourceId: string | null, where: string) => {
    if (!c) return;
    const s = segById.get(c.segmentId);
    if (!s) errs.push(`${where}: إحالة إلى مقطع غير موجود`);
    else if (sourceId && s.sourceId !== sourceId) errs.push(`${where}: الإحالة لا تتبع المصدر نفسه`);
  };
  w.sources.forEach(s => { if (s.fileId && fileIds && !fileIds.has(s.fileId)) errs.push(`الملف الأصلي للمصدر «${s.title}» مفقود`); });
  w.segments.forEach(s => { if (!src.has(s.sourceId)) errs.push(`مقطع يتيم: ${s.id}`); });
  w.concepts.forEach(c => { if (!src.has(c.sourceId)) errs.push(`مفهوم «${c.title}» بلا مصدر`); cite(c.citation, c.sourceId, `المفهوم «${c.title}»`); });
  w.relations.forEach(r => {
    if (!con.has(r.fromConceptId) || !con.has(r.toConceptId)) errs.push(`علاقة «${r.label}» تشير إلى مفهوم غير موجود`);
    if (r.sourceId && !src.has(r.sourceId)) errs.push(`علاقة «${r.label}» تشير إلى مصدر غير موجود`);
    cite(r.citation, r.sourceId, `العلاقة «${r.label}»`);
  });
  w.questions.forEach(x => {
    if (!con.has(x.conceptId)) errs.push(`سؤال بلا مفهوم: ${x.prompt.slice(0, 30)}`);
    if (!src.has(x.sourceId)) errs.push(`سؤال بلا مصدر: ${x.prompt.slice(0, 30)}`);
    const qc = w.concepts.find(c => c.id === x.conceptId);
    if (qc && qc.sourceId !== x.sourceId) errs.push(`سؤال مرتبط بمفهوم من مصدر آخر: ${x.prompt.slice(0, 30)}`);
    cite(x.citation, x.sourceId, 'سؤال');
  });
  w.evidence.forEach(e => { if (!q.has(e.questionId)) errs.push(`دليل يشير إلى سؤال محذوف`); if (!con.has(e.conceptId) || !src.has(e.sourceId)) errs.push('دليل يشير إلى مفهوم أو مصدر غير موجود'); });
  ids(w.modes, 'الأنماط'); ids(w.runs, 'التحليلات');
  const runById = new Map(w.runs.map(r => [r.id, r]));
  w.suggestions.forEach(s => {
    if (!src.has(s.sourceId)) errs.push('مقترح بلا مصدر');
    const run = runById.get(s.runId);
    if (!run) errs.push('مقترح يشير إلى تحليل غير موجود');
    else if (run.sourceId !== s.sourceId) errs.push('مقترح لا يتبع مصدر تحليله');
    if (s.acceptedId) {
      const pool: { id: string }[] = s.type === 'concept' ? w.concepts : s.type === 'relation' ? w.relations : w.questions;
      if (s.status !== 'accepted') errs.push('مقترح غير مقبول يحمل معرف قبول');
      else if (!pool.some(x => x.id === s.acceptedId)) { /* accepted item may later be deleted by the learner; allowed */ }
    }
  });
  w.runs.forEach(r => { if (!src.has(r.sourceId)) errs.push('تحليل بلا مصدر'); r.segmentIds.forEach(id => { if (!seg.has(id)) errs.push('تحليل يشير إلى مقطع غير موجود'); }); });
  return [...new Set(errs)];
}

export function isWorkspace(v: unknown): v is Workspace {
  return validateWorkspaceShape(v).length === 0;
}
