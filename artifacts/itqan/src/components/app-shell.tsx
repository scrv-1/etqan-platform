import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { BookOpen, Network, Brain, ChartNoAxesColumnIncreasing, Settings, Home, Sun, Moon, CircleAlert, LoaderCircle } from 'lucide-react';
import { useWorkspace } from '@/state/workspace';

const navItems = [
  { href: '/', label: 'اليوم', Icon: Home, id: 'today' },
  { href: '/sources', label: 'مصادري', Icon: BookOpen, id: 'sources' },
  { href: '/knowledge', label: 'خريطة المعرفة', Icon: Network, id: 'knowledge' },
  { href: '/study', label: 'تدرّب', Icon: Brain, id: 'study' },
  { href: '/progress', label: 'أثر التعلّم', Icon: ChartNoAxesColumnIncreasing, id: 'progress' },
  { href: '/settings', label: 'الإعدادات', Icon: Settings, id: 'settings' },
];
const titles: Record<string, string> = { '/': 'مساحة اليوم', '/sources': 'مصادري', '/knowledge': 'خريطة المعرفة', '/study': 'جلسة الاسترجاع', '/progress': 'أثر التعلّم', '/settings': 'إعدادات مساحتك' };

export function AppShell({ children, page, dark, toggleTheme }: { children: ReactNode; page: string; dark: boolean; toggleTheme: () => void }) {
  const { save, retrySave } = useWorkspace();
  const section = page.startsWith('/sources/') ? '/sources' : page;
  const nav = (mobile = false) => <nav aria-label="التنقل الرئيسي" className={mobile ? 'mobile-nav' : 'nav-group'}>{navItems.map(({ href, label, Icon, id }) => <Link key={href} href={href} data-testid={`nav-${id}${mobile ? '-mobile' : ''}`} className={`nav-link ${section === href ? 'active' : ''}`} aria-current={section === href ? 'page' : undefined}><Icon size={18} /><span className="nav-label">{label}</span></Link>)}</nav>;
  return <div className="app-shell" dir="rtl">
    <aside className="sidebar"><Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark">إ</span><span><span className="brand-name">إتقان</span><span className="brand-sub">LEARN, IN YOUR OWN WORDS</span></span></Link>{nav()}
      <div className="side-bottom"><span className={`storage-dot ${save.status === 'error' ? 'is-error' : ''}`} /> {save.status === 'error' ? 'تعذر الحفظ على هذا الجهاز' : 'بياناتك محفوظة على هذا الجهاز'}<br /><span style={{ fontSize: 10 }}>تخزين المتصفح المحلي، بلا حساب أو مزامنة. انسخ احتياطيًا بنفسك.</span></div></aside>
    <main className="main-area">
      <header className="topbar"><span className="crumb">مساحتك الشخصية <span style={{ opacity: .5 }}> / </span> {page.startsWith('/sources/') ? 'قارئ المصدر' : titles[page] || 'إتقان'}</span>
        <div className="top-actions">
          {save.status === 'saving' && <span className="save-chip" data-testid="status-saving"><LoaderCircle size={12} className="spin" /> يحفظ</span>}
          <span className="date-label">{new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</span>
          <button type="button" className="top-icon" onClick={toggleTheme} aria-label={dark ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'} data-testid="toggle-theme">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
      </header>
      {save.status === 'error' && <div role="alert" className="notice notice-danger shell-alert" data-testid="status-save-error"><CircleAlert size={15} /><span><b>لم تُحفظ آخر التغييرات.</b> {save.message} ما زالت في هذه الصفحة؛ لا تغلقها قبل نجاح الحفظ أو تنزيل نسخة احتياطية.</span><button className="button button-secondary" onClick={retrySave} data-testid="button-retry-save">إعادة المحاولة</button></div>}
      {children}
    </main>{nav(true)}
  </div>;
}
