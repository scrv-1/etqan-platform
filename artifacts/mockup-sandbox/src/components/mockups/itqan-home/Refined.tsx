import './_group.css';
import './Refined.css';
import { ArrowDownLeft, ArrowLeft, BookOpen, Brain, ChartNoAxesColumnIncreasing, ChevronLeft, Network, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

function DemoLink({ href, className, children, ariaLabel }: { href: string; className: string; children: ReactNode; ariaLabel?: string }) {
  return <a href={href} className={className} aria-label={ariaLabel} onClick={event => event.preventDefault()}>{children}</a>;
}

function Snapshot({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return <div className="refined-stat">
    <div className="refined-stat-copy">
      <div className="refined-stat-number">{value.toLocaleString('ar')}</div>
      <div className="refined-stat-label">{label}</div>
    </div>
    <span className="refined-stat-icon" aria-hidden="true">{icon}</span>
  </div>;
}

export function Refined() {
  return <main className="itqan-refined" dir="rtl" lang="ar">
    <div className="refined-content">
      <header className="refined-header">
        <div className="refined-heading">
          <span className="refined-mark" aria-hidden="true">إ</span>
          <div>
            <h1 className="refined-title">أهلًا بك في إتقان</h1>
            <p className="refined-description">ابدأ بمصدر، اربط الأفكار، ثم اختبر ما تستطيع استرجاعه.</p>
          </div>
        </div>
        <DemoLink href="/sources" className="refined-button" ariaLabel="أضف مصدرًا">
          <Plus size={16} aria-hidden="true" /> أضف مصدرًا
        </DemoLink>
      </header>

      <aside className="refined-sample" aria-label="تنبيه بشأن المحتوى التجريبي">
        <Sparkles size={15} aria-hidden="true" />
        <span>محتوى تجريبي قابل للتحرير؛ غيّره أو احذفه وابدأ بمصادرك الخاصة.</span>
      </aside>

      <section className="refined-hero" aria-labelledby="refined-hero-title">
        <div className="refined-hero-copy">
          <h2 id="refined-hero-title" className="refined-hero-title">المعرفة التي تسترجعها،<br />تصبح أقرب إليك.</h2>
          <p className="refined-hero-sub">مقاطع ومراجع واضحة، وممارسة مستقلة عن المساعدة الذكية.</p>
          <DemoLink href="/study" className="refined-button refined-button-light">
            ابدأ جلسة استرجاع <ArrowLeft size={15} aria-hidden="true" />
          </DemoLink>
        </div>
        <div className="refined-learning-path" aria-label="من المصدر إلى الفكرة ثم الاسترجاع">
          <div className="refined-path-step"><span className="refined-path-dot">١</span><span>مصدر</span></div>
          <div className="refined-path-step"><span className="refined-path-dot">٢</span><span>فكرة</span></div>
          <div className="refined-path-step"><span className="refined-path-dot">٣</span><span>استرجاع</span></div>
        </div>
      </section>

      <section className="refined-stats" aria-label="ملخص المساحة">
        <Snapshot icon={<BookOpen size={17} />} value={2} label="مصدر محفوظ محليًا" />
        <Snapshot icon={<Network size={17} />} value={3} label="مفهوم" />
        <Snapshot icon={<ChartNoAxesColumnIncreasing size={17} />} value={0} label="استجابة مسجلة كدليل" />
      </section>

      <section aria-labelledby="refined-next-title">
        <div className="refined-section-head">
          <h2 id="refined-next-title" className="refined-section-title">خطوتك التالية</h2>
        </div>
        <div className="refined-next">
          <DemoLink href="/study" className="refined-card refined-card-question">
            <span className="refined-card-icon" aria-hidden="true"><Brain size={21} /></span>
            <span className="refined-card-body">
              <span className="refined-card-title">راجع: ما الذي يحدث لبخار الماء عندما يبرد في الجو؟</span>
              <span className="refined-card-caption">لا تظهر الإجابة قبل محاولتك.</span>
            </span>
            <ChevronLeft className="refined-card-arrow" size={17} aria-hidden="true" />
          </DemoLink>

          <DemoLink href="/study?due=1" className="refined-card">
            <span className="refined-card-icon" aria-hidden="true"><Brain size={19} /></span>
            <span className="refined-card-body">
              <span className="refined-card-title">مراجعة مستحقة</span>
              <span className="refined-card-caption">٤ أسئلة جديدة أو حان موعد استرجاعها.</span>
            </span>
            <span className="refined-due-count" aria-label="أربعة أسئلة">٤</span>
            <ChevronLeft className="refined-card-arrow" size={16} aria-hidden="true" />
          </DemoLink>

          <DemoLink href="/knowledge" className="refined-card">
            <span className="refined-card-icon" aria-hidden="true"><Network size={19} /></span>
            <span className="refined-card-body">
              <span className="refined-card-title">شبكة الأفكار</span>
              <span className="refined-card-caption">٣ مفاهيم وعلاقة واحدة؛ راجع ما هو مقترح قبل اعتماده.</span>
            </span>
            <ArrowDownLeft className="refined-card-arrow" size={17} aria-hidden="true" />
          </DemoLink>
        </div>
      </section>

      <aside className="refined-privacy">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>المحتوى يبقى في هذا المتصفح. التحليل وOCR لا يرسلان شيئًا دون موافقتك الصريحة.</span>
      </aside>
    </div>
  </main>;
}
