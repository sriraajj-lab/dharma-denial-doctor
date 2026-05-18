'use client';

import { useAppStore } from '@/lib/store';
import { ViewType, LEVEL_CONFIGS } from '@/lib/types';
import {
  LayoutDashboard,
  FileText,
  Upload,
  Bot,
  Shield,
  Activity,
  ChevronLeft,
  ChevronRight,
  Gavel,
  BookOpen,
  DollarSign,
  ShieldCheck,
  ClipboardList,
  Stethoscope,
  Heart,
  Home,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems: Array<{ view: ViewType; label: string; icon: React.ReactNode; section?: string; minLevel?: number }> = [
  { view: 'landing', label: 'Home / Switch', icon: <Home className="h-5 w-5" />, section: 'main' },
  { view: 'upload', label: 'Upload & Scan', icon: <Upload className="h-5 w-5" />, section: 'main' },
  { view: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, section: 'main' },
  { view: 'denials', label: 'Denial Queue', icon: <FileText className="h-5 w-5" />, section: 'main' },
  { view: 'worklist', label: 'AI Worklist', icon: <Activity className="h-5 w-5" />, section: 'main', minLevel: 2 },
  { view: 'agents', label: 'AI Agents', icon: <Bot className="h-5 w-5" />, section: 'main' },
  { view: 'health-scan', label: 'Health Scan', icon: <Shield className="h-5 w-5" />, section: 'main' },
  { view: 'nl-query', label: 'Search', icon: <Activity className="h-5 w-5" />, section: 'main' },
  { view: 'appeals', label: 'Appeals', icon: <Gavel className="h-5 w-5" />, section: 'management', minLevel: 2 },
  { view: 'followup', label: 'Follow-ups', icon: <Activity className="h-5 w-5" />, section: 'management', minLevel: 2 },
  { view: 'appeal-deadlines', label: 'Deadlines', icon: <Activity className="h-5 w-5" />, section: 'management', minLevel: 2 },
  { view: 'prevention', label: 'Prevention', icon: <ShieldCheck className="h-5 w-5" />, section: 'management' },
  { view: 'scrub', label: 'Claim Scrub', icon: <ShieldCheck className="h-5 w-5" />, section: 'management' },
  { view: 'financials', label: 'Financials', icon: <DollarSign className="h-5 w-5" />, section: 'management' },
  { view: 'payer-rules', label: 'Payer Rules', icon: <BookOpen className="h-5 w-5" />, section: 'settings' },
  { view: 'staff-metrics', label: 'Staff Metrics', icon: <Activity className="h-5 w-5" />, section: 'settings' },
  { view: 'audit-log', label: 'Audit Log', icon: <ClipboardList className="h-5 w-5" />, section: 'settings' },
];

export function AppSidebar() {
  const { currentView, setCurrentView, sidebarOpen, setSidebarOpen, contractSigned, practiceType, accessLevel } = useAppStore();

  const mainItems = navItems.filter((i) => i.section === 'main');
  const managementItems = navItems.filter((i) => i.section === 'management');
  const settingsItems = navItems.filter((i) => i.section === 'settings');

  const levelConfig = LEVEL_CONFIGS.find(l => l.level === accessLevel);

  // Filter items based on access level
  const filterByLevel = (items: typeof navItems) =>
    items.filter(item => !item.minLevel || (accessLevel && accessLevel >= item.minLevel));

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r border-border bg-sidebar transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        {sidebarOpen && (
          <div className="flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-sm font-bold text-sidebar-foreground">Dharma Solutions</h1>
              <div className="flex items-center gap-1.5">
                {practiceType && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    {practiceType === 'dental' ? <Heart className="h-2.5 w-2.5 text-cyan" /> : <Stethoscope className="h-2.5 w-2.5 text-primary" />}
                    {practiceType === 'dental' ? 'Dental' : 'Medical'}
                  </span>
                )}
                {accessLevel && (
                  <span className="text-[9px] bg-primary/20 text-primary px-1 py-0 rounded">
                    L{accessLevel}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all"
        >
          {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      <nav className="mt-4 flex flex-col gap-1 px-2 overflow-y-auto max-h-[calc(100vh-12rem)]">
        {/* Main Section */}
        {filterByLevel(mainItems).map((item) => (
          <button
            key={item.view}
            onClick={() => setCurrentView(item.view)}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
              currentView === item.view
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            )}
          >
            {item.icon}
            {sidebarOpen && <span>{item.label}</span>}

          </button>
        ))}

        {/* Management Section */}
        {sidebarOpen && (
          <div className="mt-4 mb-1 px-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Management</span>
          </div>
        )}
        {!sidebarOpen && <div className="my-2 border-t border-border/50" />}
        {filterByLevel(managementItems).map((item) => (
          <button
            key={item.view}
            onClick={() => setCurrentView(item.view)}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
              currentView === item.view
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            )}
          >
            {item.icon}
            {sidebarOpen && <span>{item.label}</span>}
          </button>
        ))}

        {/* Settings Section */}
        {sidebarOpen && (
          <div className="mt-4 mb-1 px-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">System</span>
          </div>
        )}
        {!sidebarOpen && <div className="my-2 border-t border-border/50" />}
        {filterByLevel(settingsItems).map((item) => (
          <button
            key={item.view}
            onClick={() => setCurrentView(item.view)}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
              currentView === item.view
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
            )}
          >
            {item.icon}
            {sidebarOpen && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {sidebarOpen && (
        <div className="absolute bottom-4 left-4 right-4">
          <div className="rounded-lg border border-border bg-sidebar-accent/30 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-emerald" />
              <span className="text-xs font-medium text-sidebar-foreground">System Status</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald animate-pulse" />
              <span className="text-xs text-muted-foreground">
                {contractSigned
                  ? `${accessLevel === 3 ? '16' : accessLevel === 2 ? '8' : '3'} Agents Active`
                  : 'Scan Agent Active'}
              </span>
            </div>
            {levelConfig && (
              <div className="mt-2 text-[10px] text-muted-foreground">
                Level {accessLevel}: {levelConfig.name}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
