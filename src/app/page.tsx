'use client';

import { useAppStore } from '@/lib/store';
import { LandingView } from '@/components/landing-view';
import { AppSidebar } from '@/components/app-sidebar';
import { DashboardView } from '@/components/dashboard-view';
import { DenialsView } from '@/components/denials-view';
import { DenialDetailView } from '@/components/denial-detail-view';
import { UploadView } from '@/components/upload-view';
import { AgentsView } from '@/components/agents-view';
import { OverviewReportView } from '@/components/overview-report-view';
import { WorklistView } from '@/components/worklist-view';
import { PreventionDashboard } from '@/components/prevention-dashboard';
import { FollowUpView } from '@/components/followup-view';
import { AppealDeadlinesView } from '@/components/appeal-deadlines-view';
import { StaffMetricsView } from '@/components/staff-metrics-view';
import { NLQueryView } from '@/components/nl-query-view';
import { AppealsView } from '@/components/appeals-view';
import { PayerRulesView } from '@/components/payer-rules-view';
import { AuditLogView } from '@/components/audit-log-view';
import { ScrubView } from '@/components/scrub-view';
import { FinancialsView } from '@/components/financials-view';
import { HealthScanView } from '@/components/health-scan-view';
import { Shield, User, Heart, Stethoscope } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function Home() {
  const { currentView, sidebarOpen, contractSigned, currentUser, practiceType, accessLevel } = useAppStore();

  // Show Landing Page if no practice type selected
  if (currentView === 'landing' || !practiceType) {
    return <LandingView />;
  }

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
      case 'worklist':
        return <WorklistView />;
      case 'prevention':
        return <PreventionDashboard />;
      case 'followup':
        return <FollowUpView />;
      case 'appeal-deadlines':
        return <AppealDeadlinesView />;
      case 'staff-metrics':
        return <StaffMetricsView />;
      case 'nl-query':
        return <NLQueryView />;
      case 'health-scan':
        return <HealthScanView />;
      case 'overview-report':
        return <OverviewReportPlaceholder />;
      case 'appeals':
        return <AppealsView />;
      case 'payer-rules':
        return <PayerRulesView />;
      case 'audit-log':
        return <AuditLogView />;
      case 'scrub':
        return <ScrubView />;
      case 'financials':
        return <FinancialsView />;
      default:
        return <UploadView />;
    }
  };

  const getLevelBadge = () => {
    if (!accessLevel) return null;
    const colors = {
      1: 'bg-cyan/20 text-cyan border-cyan/30',
      2: 'bg-emerald/20 text-emerald border-emerald/30',
      3: 'bg-primary/20 text-primary border-primary/30',
    };
    const names = { 1: 'Scan & Score', 2: 'Fix & Appeal', 3: 'EHR Auto-Fix' };
    return (
      <Badge variant="outline" className={colors[accessLevel]}>
        L{accessLevel}: {names[accessLevel]}
      </Badge>
    );
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
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Denial Doctor
            </span>
            <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded ml-1">AI-Powered</span>
            {practiceType && (
              <Badge variant="outline" className={practiceType === 'medical' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-cyan/10 text-cyan border-cyan/30'}>
                {practiceType === 'medical' ? <Stethoscope className="h-3 w-3 mr-1" /> : <Heart className="h-3 w-3 mr-1" />}
                {practiceType === 'medical' ? 'Medical' : 'Dental'}
              </Badge>
            )}
            {getLevelBadge()}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald animate-pulse" />
              <span className="text-xs text-muted-foreground">{contractSigned ? 'Full Access' : 'Overview Only'}</span>
            </div>
            <div className="flex items-center gap-2 border-l border-border pl-3">
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="hidden md:block">
                <p className="text-xs font-medium text-foreground">{currentUser?.name || 'System Admin'}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{currentUser?.role || 'admin'}</p>
              </div>
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

function OverviewReportPlaceholder() {
  const { setCurrentView } = useAppStore();
  setCurrentView('upload');
  return null;
}
