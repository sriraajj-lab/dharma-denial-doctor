'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { PracticeType } from '@/lib/types';
import {
  Shield, ChevronRight, CheckCircle2,
  Upload, Stethoscope,
  ArrowRight, Users, Clock, TrendingUp,
  Heart, Zap, Bot, ShieldCheck, Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ─── Landing Page (Dharma Solutions Internal) ──────────────────────────────────

export function LandingView() {
  const { setPracticeType, setAccessLevel, setContractSigned, setCurrentView } = useAppStore();
  const [selectedPractice, setSelectedPractice] = useState<PracticeType | null>(null);

  const handlePracticeSelect = (type: PracticeType) => {
    setSelectedPractice(type);
  };

  const handleGetStarted = () => {
    if (selectedPractice) {
      setPracticeType(selectedPractice);
      setAccessLevel(3); // Full access for internal staff
      setContractSigned(true);
      setCurrentView('dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-cyan/5" />
        <div className="relative max-w-7xl mx-auto px-6 py-16">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
              <Shield className="h-10 w-10 text-primary" />
              <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight">
                Dharma Solutions
              </h1>
            </div>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-sm px-4 py-1 mb-4">
              Internal Denial Management Platform
            </Badge>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mt-4 leading-relaxed">
              Full access denial recovery platform with 16 specialized AI agents. Scan, fix, appeal, and auto-resubmit
              claims across medical and dental billing clients.
            </p>
            <div className="flex items-center justify-center gap-6 mt-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span>50,000+ claims processed</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald" />
                <span>85% recovery rate</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-cyan" />
                <span>Real-time processing</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Practice Type Selection */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-4">
            <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
            Select Client Practice Type
          </div>
          <h2 className="text-3xl font-bold text-foreground">Medical or Dental?</h2>
          <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
            Choose your client&apos;s practice type for specialized denial management with the right code sets and rules.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Medical Card */}
          <button
            onClick={() => handlePracticeSelect('medical')}
            className={`group relative rounded-2xl border-2 p-8 text-left transition-all duration-300 hover:shadow-xl ${
              selectedPractice === 'medical'
                ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10 scale-[1.02]'
                : 'border-border bg-card hover:border-primary/50 hover:bg-primary/5'
            }`}
          >
            {selectedPractice === 'medical' && (
              <div className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            )}
            <div className="flex items-center gap-4 mb-6">
              <div className={`h-16 w-16 rounded-2xl flex items-center justify-center transition-all ${
                selectedPractice === 'medical' ? 'bg-primary/20' : 'bg-primary/10'
              }`}>
                <Stethoscope className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-foreground">Medical</h3>
                <p className="text-sm text-muted-foreground">Hospitals, Clinics, Physicians</p>
              </div>
            </div>
            <div className="space-y-3">
              {[
                'CPT / HCPCS code support',
                'ICD-10 diagnosis validation',
                'NCCI edit pair checking',
                'LCD/NCD coverage analysis',
                'E/M level optimization',
                'Medicare/Medicaid rules',
                'Commercial payer patterns',
                'Modifier validation (25, 59, XE/XS/XP/XU)',
              ].map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-sm text-foreground">{feature}</span>
                </div>
              ))}
            </div>
          </button>

          {/* Dental Card */}
          <button
            onClick={() => handlePracticeSelect('dental')}
            className={`group relative rounded-2xl border-2 p-8 text-left transition-all duration-300 hover:shadow-xl ${
              selectedPractice === 'dental'
                ? 'border-cyan bg-cyan/5 shadow-lg shadow-cyan/10 scale-[1.02]'
                : 'border-border bg-card hover:border-cyan/50 hover:bg-cyan/5'
            }`}
          >
            {selectedPractice === 'dental' && (
              <div className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-cyan text-primary-foreground flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            )}
            <div className="flex items-center gap-4 mb-6">
              <div className={`h-16 w-16 rounded-2xl flex items-center justify-center transition-all ${
                selectedPractice === 'dental' ? 'bg-cyan/20' : 'bg-cyan/10'
              }`}>
                <Heart className="h-8 w-8 text-cyan" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-foreground">Dental</h3>
                <p className="text-sm text-muted-foreground">Dental Practices, DSOs, Orthodontists</p>
              </div>
            </div>
            <div className="space-y-3">
              {[
                'CDT code support (D0000-D9999)',
                'Dental ICD-10-CM diagnosis codes',
                'Frequency limitation checks',
                'Missing tooth clause validation',
                'Pre-treatment authorization tracking',
                'Coordination of benefits (COB)',
                'Delta Dental / Cigna Dental rules',
                'CDT-to-CPT cross-coding for medical dental',
              ].map((feature, idx) => (
                <div key={idx} className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-cyan flex-shrink-0" />
                  <span className="text-sm text-foreground">{feature}</span>
                </div>
              ))}
            </div>
          </button>
        </div>
      </section>

      {/* Full Access Features */}
      {selectedPractice && (
        <section className="max-w-7xl mx-auto px-6 py-12 border-t border-border">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-emerald/10 text-emerald px-4 py-1.5 rounded-full text-sm font-medium mb-4">
              <ShieldCheck className="h-4 w-4" />
              Full Internal Access
            </div>
            <h2 className="text-3xl font-bold text-foreground">All Features Unlocked</h2>
            <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
              As a Dharma Solutions team member, you have full access to all platform capabilities — no restrictions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <div className="h-12 w-12 rounded-xl bg-cyan/10 flex items-center justify-center mx-auto mb-4">
                <Activity className="h-6 w-6 text-cyan" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Scan & Score</h3>
              <p className="text-sm text-muted-foreground">AI-powered denial analysis with CARC/RARC mapping, coding validation, and client health scoring.</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <div className="h-12 w-12 rounded-xl bg-emerald/10 flex items-center justify-center mx-auto mb-4">
                <Zap className="h-6 w-6 text-emerald" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">Fix & Appeal</h3>
              <p className="text-sm text-muted-foreground">Generate corrections, pre-auth letters, appeal drafts, and detailed fix reports for manual execution.</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">EHR Auto-Fix</h3>
              <p className="text-sm text-muted-foreground">16 AI agents autonomously fix and resubmit claims through EHR integration. Hands-free recovery.</p>
            </div>
          </div>
        </section>
      )}

      {/* Bottom CTA */}
      {selectedPractice && (
        <section className="max-w-7xl mx-auto px-6 py-16">
          <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-cyan/10 border border-primary/20 p-8 text-center">
            <h3 className="text-2xl font-bold text-foreground mb-3">Ready to recover your denied claims?</h3>
            <p className="text-muted-foreground max-w-lg mx-auto mb-6">
              {selectedPractice === 'medical' ? 'Medical' : 'Dental'} billing with full AI-powered access.
              Upload your denial report and let AI start recovering revenue for your clients.
            </p>
            <Button
              size="lg"
              onClick={handleGetStarted}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-lg px-8 py-6"
            >
              <Upload className="h-5 w-5 mr-2" />
              Launch Dashboard
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-foreground">Dharma Solutions</span>
          </div>
          <p className="text-xs text-muted-foreground">Internal Denial Management Platform</p>
          <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
            <span>HIPAA Compliant</span>
            <span>SOC 2 Certified</span>
            <span>256-bit Encryption</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
