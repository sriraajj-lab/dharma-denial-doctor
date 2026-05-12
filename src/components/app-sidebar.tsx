'use client';

import { useAppStore } from '@/lib/store';
import { ViewType } from '@/lib/types';
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
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems: Array<{ view: ViewType; label: string; icon: React.ReactNode; section?: string }> = [
  { view: 'upload', label: 'Upload & Scan', icon: <Upload className="h-5 w-5" />, section: 'main' },
  { view: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, section: 'main' },
  { view: 'denials', label: 'Denial Queue', icon: <FileText className="h-5 w-5" />, section: 'main' },
  { view: 'agents', label: 'AI Agents', icon: <Bot className="h-5 w-5" />, section: 'main' },
  { view: 'appeals', label: 'Appeals', icon: <Gavel className="h-5 w-5" />, section: 'management' },
  { view: 'scrub', label: 'Claim Scrub', icon: <ShieldCheck className="h-5 w-5" />, section: 'management' },
  { view: 'financials', label: 'Financials', icon: <DollarSign className="h-5 w-5" />, section: 'management' },
  { view: 'payer-rules', label: 'Payer Rules', icon: <BookOpen className="h-5 w-5" />, section: 'settings' },
  { view: 'audit-log', label: 'Audit Log', icon: <ClipboardList className="h-5 w-5" />, section: 'settings' },
];

export function AppSidebar() {
  const { currentView, setCurrentView, sidebarOpen, setSidebarOpen, contractSigned } = useAppStore();

  const mainItems = navItems.filter((i) => i.section === 'main');
  const managementItems = navItems.filter((i) => i.section === 'management');
  const settingsItems = navItems.filter((i) => i.section === 'settings');

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
              <h1 className="text-sm font-bold text-sidebar-foreground">Denial Mgmt</h1>
              <p className="text-[10px] text-muted-foreground">AI Agent - Phase 2</p>
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
        {mainItems.map((item) => (
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
            {sidebarOpen && item.view === 'denials' && !contractSigned && (
              <span className="ml-auto text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">Contract</span>
            )}
          </button>
        ))}

        {/* Management Section */}
        {sidebarOpen && (
          <div className="mt-4 mb-1 px-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Management</span>
          </div>
        )}
        {!sidebarOpen && <div className="my-2 border-t border-border/50" />}
        {managementItems.map((item) => (
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
        {settingsItems.map((item) => (
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
              <span className="text-xs text-muted-foreground">{contractSigned ? '3 Agents Active' : 'Scan Agent Active'}</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
