import './_group.css';
import { ArrowDownLeft, ArrowLeft, BookOpen, Brain, ChartNoAxesColumnIncreasing, ChevronLeft, Network, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

function DemoLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  return <a href={href} className={className} onClick={event => event.preventDefault()}>{children}</a>;
}

function Stat({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return <div className="stat-cell"><div><div className="stat-num">{value.toLocaleString('ar')}</div><div className="stat-label">{label}</div></div>{icon}</div>;
}

export function Current() {
  return <main className="itqan-home-preview" dir="rtl" lang="ar">
    <div className="content">
      <header className="page-heading">
        <div><div className="eyebrow">YOUR OWN LEARNING SPACE</div><h1 className="page-title">أهلًا بك في إتقان</h1><p className="page-desc">ابدأ بمصدر، اربط الأفكار، ثم اختبر ما تستطيع استرجاعه.</p></div>
        <DemoLink href="/sources" className="button button-primary"><Plus size={15} /> أضف مصدرًا</DemoLink>
      </header>
      <div className="sample-note"><Sparkles size={15} /> محتوى تجريبي قابل للتحرير؛ غيّره أو احذفه وابدأ بمصادرك الخاصة.</div>
      <section className="home-hero" aria-label="ابدأ التعلّم">
        <div className="hero-copy">
          <span className="hero-kicker">LEARN FROM YOUR SOURCES</span>
          <h2 className="hero-title">المعرفة التي تسترجعها،<br />تصبح أقرب إليك.</h2>
          <p className="hero-sub">مقاطع ومراجع واضحة، وممارسة مستقلة عن المساعدة الذكية.</p>
          <DemoLink href="/study" className="button button-secondary">ابدأ جلسة استرجاع <ArrowLeft size={15} /></DemoLink>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="orbit" /><div className="orbit" /><div className="orbit-dot" /><div className="hero-core">إ</div></div>
      </section>
      <div className="stats-strip" aria-label="ملخص المساحة">
        <Stat icon={<BookOpen size={18} />} value={2} label="مصدر محفوظ محليًا" />
        <Stat icon={<Network size={18} />} value={3} label="مفهوم" />
        <Stat icon={<ChartNoAxesColumnIncreasing size={18} />} value={0} label="استجابة مسجلة كدليل" />
      </div>
      <div className="section-head"><h2 className="section-title">خطوتك التالية</h2></div>
      <div className="next-grid">
        <DemoLink href="/study?due=1" className="card action-card"><span className="action-icon"><Brain size={20} /></span><span className="row-main"><span className="action-title">مراجعة مستحقة</span><span className="action-caption">٤ أسئلة جديدة أو حان موعد استرجاعها.</span></span><ChevronLeft size={17} /></DemoLink>
        <DemoLink href="/study" className="card action-card"><span className="action-icon"><Brain size={20} /></span><span className="row-main"><span className="action-title">راجع: ما الذي يحدث لبخار الماء عندما يبرد في الجو؟</span><span className="action-caption">لا تظهر الإجابة قبل محاولتك.</span></span><ChevronLeft size={17} /></DemoLink>
        <DemoLink href="/knowledge" className="card action-card"><span className="action-icon"><Network size={20} /></span><span className="row-main"><span className="action-title">شبكة الأفكار</span><span className="action-caption">٣ مفاهيم وعلاقة واحدة؛ راجع ما هو مقترح قبل اعتماده.</span></span><ArrowDownLeft size={17} /></DemoLink>
      </div>
      <div className="notice" style={{ marginTop: 18 }}><ShieldCheck size={15} style={{ verticalAlign: 'middle', marginLeft: 7 }} /> المحتوى يبقى في هذا المتصفح. التحليل وOCR لا يرسلان شيئًا دون موافقتك الصريحة.</div>
    </div>
  </main>;
}
