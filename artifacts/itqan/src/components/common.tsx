import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { BookOpen, Sparkles, X, Quote } from 'lucide-react';
import type { Citation, Segment, Source } from '@/lib/types';
import { formatTime } from '@/lib/util';

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1 className="page-title">{title}</h1><p className="page-desc">{description}</p></div>{action}</div>;
}

export function SampleNote() {
  return <div className="sample-note" data-testid="status-sample-content"><Sparkles size={15} /><span><b>محتوى تجريبي قابل للتحرير</b> — المصادر الموسومة «عينة» ليست من ملفاتك. غيّرها أو احذفها وابدأ بمصادرك الخاصة.</span></div>;
}

export function Empty({ title, copy, icon: Icon = BookOpen, action }: { title: string; copy: string; icon?: typeof BookOpen; action?: ReactNode }) {
  return <div className="card empty-state" data-testid="empty-state"><div className="empty-mark"><Icon size={21} /></div><b style={{ display: 'block', color: 'hsl(var(--foreground))', marginBottom: 7 }}>{title}</b><span style={{ fontSize: 12, lineHeight: 1.8 }}>{copy}</span>{action && <div style={{ marginTop: 16 }}>{action}</div>}</div>;
}

export function Modal({ title, onClose, children, wide, testId }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = ''; prev?.focus?.(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`modal card ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} data-testid={testId}>
      <div className="modal-head"><h2 className="section-title" style={{ fontSize: 19 }}>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="إغلاق" data-testid="button-close-modal"><X size={17} /></button></div>
      <div className="modal-body">{children}</div>
    </div>
  </div>;
}

type ConfirmOpts = { title: string; body?: ReactNode; items?: string[]; confirmLabel?: string; danger?: boolean };

/** Promise-based confirmation dialog that can show a list of affected records. */
export function useConfirm(): [ReactNode, (o: ConfirmOpts) => Promise<boolean>] {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>(resolve => setState({ ...o, resolve })), []);
  const done = (v: boolean) => { state?.resolve(v); setState(null); };
  const el = state ? <Modal title={state.title} onClose={() => done(false)} testId="dialog-confirm">
    {state.body && <div className="setting-copy" style={{ marginBottom: 10 }}>{state.body}</div>}
    {state.items && state.items.length > 0 && <><div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>سيُحذف معه:</div><ul className="impact-list" data-testid="list-delete-impact">{state.items.map(i => <li key={i}>{i}</li>)}</ul></>}
    <div className="form-actions"><button className={`button ${state.danger ? 'button-danger-solid' : 'button-primary'}`} onClick={() => done(true)} data-testid="button-confirm">{state.confirmLabel || 'تأكيد'}</button><button className="button button-secondary" onClick={() => done(false)} data-testid="button-cancel-confirm">إلغاء</button></div>
  </Modal> : null;
  return [el, ask];
}

export function locationLabel(seg: Segment | undefined): string {
  if (!seg) return 'موضع غير متاح';
  if (seg.page) return `صفحة الملف ${seg.page}${seg.printedPage ? ` (المطبوعة ${seg.printedPage})` : ''}`;
  if (seg.startSeconds !== undefined && seg.startSeconds >= 0) return `الدقيقة ${formatTime(seg.startSeconds)}`;
  return `المقطع ${seg.order + 1}`;
}

/** Opens the reader focused on the exact cited segment. */
export function CitationLink({ citation, source, segment, fallback, testId }: { citation: Citation | null; source?: Source; segment?: Segment; fallback?: string; testId?: string }) {
  if (!citation || !source || !segment) return <span className="cite cite-none" data-testid={testId}>{fallback ? `${fallback} · ` : ''}بلا إحالة مصدرية</span>;
  return <Link href={`/sources/${source.id}?seg=${encodeURIComponent(segment.id)}`} className="cite" data-testid={testId}><Quote size={11} />{source.title} · {locationLabel(segment)}</Link>;
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return <div className="proc-progress" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}><div style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, value))})` }} /></div>;
}

export const kindLabel: Record<string, string> = { concept: 'مفهوم', prerequisite: 'متطلب سابق', example: 'مثال' };
export const qKindLabel: Record<string, string> = { mcq: 'اختيار من متعدد', flashcard: 'بطاقة', short: 'إجابة قصيرة' };
export const sourceKindLabel: Record<string, string> = { pdf: 'PDF', text: 'ملف نصي', markdown: 'Markdown', docx: 'Word', youtube: 'فيديو YouTube', article: 'صفحة ويب', paste: 'نص ملصق', legacy: 'ملاحظات منقولة' };
