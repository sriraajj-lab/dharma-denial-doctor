'use client';

import { useAppStore } from '@/lib/store';
import { AppSidebar } from '@/components/app-sidebar';
import { DashboardView } from '@/components/dashboard-view';
import { DenialsView } from '@/components/denials-view';
import { DenialDetailView } from '@/components/denial-detail-view';
import { UploadView } from '@/components/upload-view';
import { AgentsView } from '@/components/agents-view';
import { OverviewReportView } from '@/components/overview-report-view';
import { Shield } from 'lucide-react';

export default function Home() {
  const { currentView, sidebarOpen, selectedReportId, contractSigned } = useAppStore();

  // We need to track the current report for the overview-report view
  // For now, we'll use a simple approach - the upload view manages the report state
  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView />;
      case 'denials':
        return <DenialsView />;
      case 'denial-detail':
        return <DenialDetailView />;
      case 'upload':
        return <UploadView />;
      case 'agents':
        return <AgentsView />;
      case 'overview-report':
        // The overview report view needs the report data
        // We'll handle this by passing it from the store or fetching it
        return <OverviewReportPlaceholder />;
      default:
        return <UploadView />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main
        className="transition-all duration-300"
        style={{ marginLeft: sidebarOpen ? '16rem' : '4rem' }}
      >
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-6 h-14">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Denial Management Agent
            </span>
            <span className="text-xs text-muted-foreground ml-2">Phase 1</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald animate-pulse" />
              <span className="text-xs text-muted-foreground">{contractSigned ? 'Full Access' : 'Overview Only'}</span>
            </div>
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-xs font-bold text-primary">DM</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6">
          {renderView()}
        </div>
      </main>
    </div>
  );
}

// Placeholder that will redirect to upload if no report data is available
function OverviewReportPlaceholder() {
  const { setCurrentView } = useAppStore();
  
  // Since we don't have a global report store, redirect to upload
  // The upload view handles the report display directly
  setCurrentView('upload');
  return null;
}
