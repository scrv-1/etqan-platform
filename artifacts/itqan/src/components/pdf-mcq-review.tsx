import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, CircleAlert, FileText, Plus, Trash2, X } from 'lucide-react';
import type { PdfMcqCandidate } from '@/lib/ingest/pdf-mcq';
import './pdf-mcq-review.css';

type PdfMcqReviewProps = {
  candidates: PdfMcqCandidate[];
  isOpen: boolean;
  concepts: { id: string; title: string }[];
  segments: { id: string; page?: number; text: string }[];
  importedKeys: Set<string>;
  suggestedTopic?: string;
  onSave: (value: {
    candidate: PdfMcqCandidate;
    prompt: string;
    choices: string[];
    correctChoice: number;
    conceptId: string;
    segmentId: string;
    newConceptTitle: string;
  }) => void;
  onClose: () => void;
};

type ReviewDraft = {
  prompt: string;
  choices: string[];
  correctChoice: number | null;
  conceptId: string;
  newConceptTitle: string;
  segmentId: string;
};

function makeDraft(candidate: PdfMcqCandidate, segments: PdfMcqReviewProps['segments'], suggestedTopic?: string): ReviewDraft {
  return {
    prompt: candidate.prompt,
    choices: candidate.choices.length >= 2 ? [...candidate.choices] : [...candidate.choices, ...Array(Math.max(0, 2 - candidate.choices.length)).fill('')],
    correctChoice: null,
    conceptId: '',
    newConceptTitle: suggestedTopic ?? '',
    segmentId: segments.some(segment => segment.id === candidate.segmentId)
      ? candidate.segmentId!
      : segments.find(segment => segment.page === candidate.page)?.id ?? '',
  };
}

export function PdfMcqReview({
  candidates,
  isOpen,
  concepts,
  segments,
  importedKeys,
  suggestedTopic,
  onSave,
  onClose,
}: PdfMcqReviewProps) {
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [savedKeys, setSavedKeys] = useState<Set<string>>(() => new Set());
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const candidate = candidates[index];
  const draft = useMemo(
    () => candidate ? drafts[candidate.importKey] ?? makeDraft(candidate, segments, suggestedTopic) : null,
    [candidate, drafts, segments, suggestedTopic],
  );
  const duplicate = !!candidate && importedKeys.has(candidate.importKey);
  const alreadySaved = !!candidate && savedKeys.has(candidate.importKey);
  const hasConcept = !!draft && (!!draft.conceptId || !!draft.newConceptTitle.trim());
  const valid = !!draft
    && !!draft.prompt.trim()
    && draft.choices.length >= 2
    && draft.choices.every(choice => !!choice.trim())
    && draft.correctChoice !== null
    && hasConcept
    && (!!draft.segmentId || candidate.page > 0)
    && !duplicate
    && !alreadySaved;

  useEffect(() => {
    if (!isOpen) return;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.altKey && event.key === 'ArrowLeft') setIndex(current => Math.max(0, current - 1));
      if (event.altKey && event.key === 'ArrowRight') setIndex(current => Math.min(candidates.length - 1, current + 1));
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [candidates.length, isOpen]);

  const updateDraft = (update: Partial<ReviewDraft>) => {
    if (!candidate || !draft) return;
    setDrafts(current => ({
      ...current,
      [candidate.importKey]: { ...draft, ...update },
    }));
  };

  const moveTo = (next: number) => setIndex(Math.max(0, Math.min(candidates.length - 1, next)));

  const handleSave = () => {
    if (!candidate || !draft || !valid) return;
    onSave({
      candidate,
      prompt: draft.prompt.trim(),
      choices: draft.choices.map(choice => choice.trim()),
      correctChoice: draft.correctChoice!,
      conceptId: draft.conceptId,
      segmentId: draft.segmentId,
      newConceptTitle: draft.newConceptTitle.trim(),
    });
    setSavedKeys(current => new Set(current).add(candidate.importKey));
    if (index < candidates.length - 1) moveTo(index + 1);
  };

  if (!isOpen) return null;

  return (
    <div className="pdf-mcq-review__backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className="pdf-mcq-review card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-mcq-review-title"
        tabIndex={-1}
        ref={dialogRef}
        dir="rtl"
        data-testid="dialog-pdf-mcq-review"
      >
        <header className="pdf-mcq-review__header">
          <div className="pdf-mcq-review__heading">
            <div className="pdf-mcq-review__eyebrow"><FileText size={14} /> مراجعة استيراد PDF</div>
            <h2 id="pdf-mcq-review-title">راجع السؤال قبل حفظه</h2>
            <p>تحقق من النص والإجابة والمفهوم والموضع في المصدر.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="إغلاق المراجعة" data-testid="button-close-pdf-mcq-review">
            <X size={18} />
          </button>
        </header>

        {!candidate ? (
          <div className="pdf-mcq-review__empty" data-testid="empty-pdf-mcq-candidates">
            <div className="pdf-mcq-review__empty-mark"><FileText size={23} /></div>
            <h3>لا توجد أسئلة للمراجعة</h3>
            <p>لم يُعثر على أسئلة اختيار من متعدد في الصفحات المحددة.</p>
            <button type="button" className="button button-secondary" onClick={onClose} data-testid="button-close-empty-pdf-mcq">إغلاق</button>
          </div>
        ) : (
          <>
            <div className="pdf-mcq-review__navigator">
              <div>
                <span className="pdf-mcq-review__counter" data-testid={`text-candidate-position-${candidate.importKey}`}>
                  السؤال {index + 1} <span>من</span> {candidates.length}
                </span>
                <span className="pdf-mcq-review__source-meta" data-testid={`text-candidate-source-${candidate.importKey}`}>
                  رقم {candidate.questionNumber} · صفحة {candidate.page}
                </span>
              </div>
              <div className="pdf-mcq-review__step-controls" aria-label="التنقل بين الأسئلة">
                <button type="button" className="button button-secondary" onClick={() => moveTo(index - 1)} disabled={index === 0} aria-label="السؤال السابق" data-testid="button-previous-candidate">
                  <ChevronRight size={16} /> السابق
                </button>
                <button type="button" className="button button-secondary" onClick={() => moveTo(index + 1)} disabled={index === candidates.length - 1} aria-label="السؤال التالي" data-testid="button-next-candidate">
                  التالي <ChevronLeft size={16} />
                </button>
              </div>
            </div>

            <div className="pdf-mcq-review__body" data-testid={`record-pdf-mcq-candidate-${candidate.importKey}`}>
              {duplicate && (
                <div className="pdf-mcq-review__notice pdf-mcq-review__notice--duplicate" role="status" data-testid={`status-duplicate-candidate-${candidate.importKey}`}>
                  <CircleAlert size={17} />
                  <span><strong>هذا السؤال مستورد مسبقًا.</strong> يمكنك مراجعته، لكن لا يمكن حفظ نسخة مكررة.</span>
                </div>
              )}
              {alreadySaved && (
                <div className="pdf-mcq-review__notice" role="status" data-testid={`status-saved-candidate-${candidate.importKey}`}>
                  <Check size={17} />
                  <span>تم حفظ هذا السؤال في هذه الجلسة.</span>
                </div>
              )}

              <div className="pdf-mcq-review__field">
                <label htmlFor="pdf-mcq-prompt">نص السؤال</label>
                <textarea
                  id="pdf-mcq-prompt"
                  rows={3}
                  value={draft!.prompt}
                  onChange={event => updateDraft({ prompt: event.target.value })}
                  placeholder="اكتب نص السؤال"
                  data-testid={`input-candidate-prompt-${candidate.importKey}`}
                />
              </div>

              <fieldset className="pdf-mcq-review__options">
                <legend>الخيارات <span>اختر الإجابة الصحيحة بزر الاختيار</span></legend>
                <div className="pdf-mcq-review__option-list" role="radiogroup" aria-label="الخيارات والإجابة الصحيحة" data-testid={`group-candidate-options-${candidate.importKey}`}>
                  {draft!.choices.map((choice, choiceIndex) => (
                    <div className={`pdf-mcq-review__option ${draft!.correctChoice === choiceIndex ? 'is-correct' : ''}`} key={`${candidate.importKey}-choice-${choiceIndex}`} data-testid={`row-candidate-option-${candidate.importKey}-${choiceIndex}`}>
                      <label className="pdf-mcq-review__radio-label">
                        <input
                          type="radio"
                          name={`correct-choice-${candidate.importKey}`}
                          checked={draft!.correctChoice === choiceIndex}
                          onChange={() => updateDraft({ correctChoice: choiceIndex })}
                          aria-label={`تحديد الخيار ${choiceIndex + 1} إجابة صحيحة`}
                          data-testid={`radio-correct-choice-${candidate.importKey}-${choiceIndex}`}
                        />
                        <span className="pdf-mcq-review__choice-letter">{String.fromCharCode(65 + choiceIndex)}</span>
                      </label>
                      <input
                        className="pdf-mcq-review__choice-input"
                        type="text"
                        value={choice}
                        onChange={event => updateDraft({ choices: draft!.choices.map((item, itemIndex) => itemIndex === choiceIndex ? event.target.value : item) })}
                        aria-label={`نص الخيار ${choiceIndex + 1}`}
                        placeholder={`الخيار ${choiceIndex + 1}`}
                        data-testid={`input-candidate-choice-${candidate.importKey}-${choiceIndex}`}
                      />
                      <button
                        type="button"
                        className="icon-button pdf-mcq-review__remove"
                        onClick={() => {
                          if (draft!.choices.length <= 2) return;
                          const choices = draft!.choices.filter((_, itemIndex) => itemIndex !== choiceIndex);
                          const oldCorrect = draft!.correctChoice;
                          updateDraft({
                            choices,
                            correctChoice: oldCorrect === null ? null : oldCorrect === choiceIndex ? null : oldCorrect > choiceIndex ? oldCorrect - 1 : oldCorrect,
                          });
                        }}
                        disabled={draft!.choices.length <= 2}
                        aria-label={`حذف الخيار ${choiceIndex + 1}`}
                        data-testid={`button-remove-choice-${candidate.importKey}-${choiceIndex}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="button button-quiet pdf-mcq-review__add-option" onClick={() => updateDraft({ choices: [...draft!.choices, ''] })} data-testid={`button-add-choice-${candidate.importKey}`}>
                  <Plus size={16} /> إضافة خيار
                </button>
                {draft!.correctChoice === null && <span className="pdf-mcq-review__hint" data-testid={`hint-correct-choice-${candidate.importKey}`}>لم تُحدّد الإجابة الصحيحة بعد.</span>}
              </fieldset>

              <div className="pdf-mcq-review__details">
                <div className="pdf-mcq-review__field">
                  <label htmlFor="pdf-mcq-concept">ربط بمفهوم</label>
                  <select
                    id="pdf-mcq-concept"
                    value={draft!.conceptId}
                    onChange={event => updateDraft({ conceptId: event.target.value, newConceptTitle: event.target.value ? '' : draft!.newConceptTitle })}
                    data-testid={`select-candidate-concept-${candidate.importKey}`}
                  >
                    <option value="">اختر مفهومًا موجودًا أو أضف جديدًا</option>
                    {concepts.map(concept => <option key={concept.id} value={concept.id}>{concept.title}</option>)}
                  </select>
                  <label className="pdf-mcq-review__sub-label" htmlFor="pdf-mcq-new-concept">أو اكتب عنوان مفهوم جديد</label>
                  <input
                    id="pdf-mcq-new-concept"
                    type="text"
                    value={draft!.newConceptTitle}
                    onChange={event => updateDraft({ newConceptTitle: event.target.value, conceptId: event.target.value.trim() ? '' : draft!.conceptId })}
                    placeholder="عنوان المفهوم"
                    data-testid={`input-candidate-new-concept-${candidate.importKey}`}
                  />
                </div>
                <div className="pdf-mcq-review__field">
                  <label htmlFor="pdf-mcq-segment">موضع السؤال في المصدر</label>
                  <select id="pdf-mcq-segment" value={draft!.segmentId} onChange={event => updateDraft({ segmentId: event.target.value })} data-testid={`select-candidate-segment-${candidate.importKey}`}>
                    <option value="">اختر مقطعًا أو صفحة</option>
                    {segments.map((segment, segmentIndex) => (
                      <option key={segment.id} value={segment.id}>
                        {segment.page ? `صفحة ${segment.page}` : `مقطع ${segmentIndex + 1}`} — {segment.text.replace(/\s+/g, ' ').trim().slice(0, 72)}
                      </option>
                    ))}
                  </select>
                  {!draft!.segmentId && <span className="pdf-mcq-review__hint" data-testid={`hint-no-source-segments-${candidate.importKey}`}>ستُربط الإحالة بصفحة PDF {candidate.page}، ويُنشأ مقطع محلي من السؤال عند الحفظ.</span>}
                </div>
              </div>
            </div>

            <footer className="pdf-mcq-review__footer">
              <span className="pdf-mcq-review__save-hint" data-testid={`status-save-requirements-${candidate.importKey}`}>
                {duplicate ? 'السؤال المكرر غير قابل للحفظ.' : alreadySaved ? 'تم حفظ السؤال.' : valid ? 'جاهز للحفظ في مساحة التعلّم.' : 'أكمل الحقول وحدّد الإجابة الصحيحة للمتابعة.'}
              </span>
              <div className="pdf-mcq-review__footer-actions">
                <button type="button" className="button button-secondary" onClick={onClose} data-testid="button-cancel-pdf-mcq-review">إغلاق</button>
                <button type="button" className="button button-primary" onClick={handleSave} disabled={!valid} data-testid={`button-save-candidate-${candidate.importKey}`}>
                  <Check size={16} /> حفظ السؤال
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}

export default PdfMcqReview;
