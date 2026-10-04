import type { Workspace } from './types';

export const DEFAULT_MODES = [
  { id: 'mode-gentle', name: 'جلسة هادئة', questionCount: 3, allowHints: false },
  { id: 'mode-focus', name: 'تركيز قصير', questionCount: 5, allowHints: false },
];

export function createSeed(): Workspace {
  const t = new Date().toISOString();
  return {
    schema: 2, sample: true,
    sources: [
      { id: 's-water', title: 'دورة الماء في الطبيعة (عينة)', kind: 'paste', createdAt: t, updatedAt: t, warnings: [], note: 'محتوى تجريبي' },
      { id: 's-memory', title: 'مبادئ التعلّم والاسترجاع (عينة)', kind: 'paste', createdAt: t, updatedAt: t, warnings: [], note: 'محتوى تجريبي' },
    ],
    segments: [
      { id: 's-water:0', sourceId: 's-water', order: 0, origin: 'text', text: 'تسخّن الشمس مياه البحار والمحيطات، فيتحول جزء منها إلى بخار ماء يصعد إلى الجو.' },
      { id: 's-water:1', sourceId: 's-water', order: 1, origin: 'text', text: 'عندما يبرد البخار يتكاثف مكوّناً السحب، ثم يعود الماء إلى الأرض على هيئة مطر أو ثلج. وتسمى هذه الحركة المستمرة دورة الماء.' },
      { id: 's-memory:0', sourceId: 's-memory', order: 0, origin: 'text', text: 'يساعد الاسترجاع النشط على تقوية الروابط في الذاكرة.' },
      { id: 's-memory:1', sourceId: 's-memory', order: 1, origin: 'text', text: 'محاولة تذكّر المعلومة قبل الرجوع إلى المصدر تكشف ما نعرفه وما يحتاج إلى مراجعة.' },
    ],
    concepts: [
      { id: 'c-evap', title: 'التبخر', description: 'تحول الماء السائل إلى بخار بفعل الحرارة.', sourceId: 's-water', kind: 'concept', citation: { segmentId: 's-water:0', quote: 'فيتحول جزء منها إلى بخار ماء' }, location: 'المقطع 1', status: 'مراجعتي الأولى', origin: 'sample', createdAt: t },
      { id: 'c-cond', title: 'التكاثف', description: 'تبريد بخار الماء وتحوله إلى قطرات تكوّن السحب.', sourceId: 's-water', kind: 'concept', citation: { segmentId: 's-water:1', quote: 'عندما يبرد البخار يتكاثف مكوّناً السحب' }, location: 'المقطع 2', status: 'قيد المراجعة', origin: 'sample', createdAt: t },
      { id: 'c-recall', title: 'الاسترجاع النشط', description: 'محاولة استحضار المعرفة من الذاكرة قبل الاطلاع على المصدر.', sourceId: 's-memory', kind: 'concept', citation: { segmentId: 's-memory:1' }, location: 'المقطع 2', status: 'مراجعتي الأولى', origin: 'sample', createdAt: t },
    ],
    relations: [
      { id: 'r1', fromConceptId: 'c-evap', toConceptId: 'c-cond', label: 'يسبق في الدورة', confidence: 72, reviewStatus: 'بحاجة للمراجعة', citation: { segmentId: 's-water:1' }, sourceId: 's-water', origin: 'sample' },
    ],
    questions: [
      { id: 'q1', kind: 'mcq', prompt: 'ما الذي يحدث لبخار الماء عندما يبرد في الجو؟', choices: ['يتكاثف مكوّناً السحب', 'يتحول مباشرة إلى تربة', 'يختفي من دورة الماء'], correctChoice: 0, answer: 'يتكاثف مكوّناً السحب', rubric: '', conceptId: 'c-cond', sourceId: 's-water', citation: { segmentId: 's-water:1' }, location: 'المقطع 2', origin: 'sample', updatedAt: t },
      { id: 'q2', kind: 'mcq', prompt: 'متى تكون محاولة الاسترجاع أكثر فائدة؟', choices: ['بعد قراءة الإجابة مباشرة', 'قبل الرجوع إلى المصدر', 'عند نسخ التعريف فقط'], correctChoice: 1, answer: 'قبل الرجوع إلى المصدر', rubric: '', conceptId: 'c-recall', sourceId: 's-memory', citation: { segmentId: 's-memory:1' }, location: 'المقطع 2', origin: 'sample', updatedAt: t },
      { id: 'q3', kind: 'flashcard', prompt: 'عرّف التبخر بكلماتك.', choices: [], correctChoice: 0, answer: 'تحوّل الماء السائل إلى بخار بفعل حرارة الشمس.', rubric: '', conceptId: 'c-evap', sourceId: 's-water', citation: { segmentId: 's-water:0' }, location: 'المقطع 1', origin: 'sample', updatedAt: t },
      { id: 'q4', kind: 'short', prompt: 'اشرح لماذا يكشف الاسترجاع ما نحتاج إلى مراجعته.', choices: [], correctChoice: 0, answer: 'لأن محاولة التذكر قبل النظر إلى المصدر تُظهر الفجوات التي لا نستطيع استحضارها.', rubric: 'يذكر التذكر قبل الرجوع للمصدر\nيربط ذلك بكشف الفجوات', conceptId: 'c-recall', sourceId: 's-memory', citation: { segmentId: 's-memory:1' }, location: 'المقطع 2', origin: 'sample', updatedAt: t },
    ],
    evidence: [], modes: DEFAULT_MODES.map(m => ({ ...m })), suggestions: [], runs: [],
  };
}

export function createEmpty(): Workspace {
  return { schema: 2, sample: false, sources: [], segments: [], concepts: [], relations: [], questions: [], evidence: [], modes: DEFAULT_MODES.map(m => ({ ...m })), suggestions: [], runs: [] };
}
