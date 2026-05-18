'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { LEVEL_CONFIGS, PRICING_TIERS, AccessLevel, PracticeType, PaymentModel } from '@/lib/types';
import {
  Shield, Activity, Bot, ChevronRight, CheckCircle2, Zap,
  TrendingUp, FileText, Upload, BarChart3, Stethoscope,
  ArrowRight, Star, Users, Clock, DollarSign, Lock,
  Sparkles, Brain, Eye, Wrench, Cpu, Globe, Heart,
  Building2, CreditCard, Percent, Package,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ─── Landing Page ───────────────────────────────────────────────────────────────

export function LandingView() {
  const { setPracticeType, setAccessLevel, setCurrentView } = useAppStore();
  const [selectedPractice, setSelectedPractice] = useState<PracticeType | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<AccessLevel | null>(null);
  const [showPricing, setShowPricing] = useState(false);

  const handlePracticeSelect = (type: PracticeType) => {
    setSelectedPractice(type);
  };

  const handleLevelSelect = (level: AccessLevel) => {
    setSelectedLevel(level);
    setShowPricing(true);
  };

  const handleGetStarted = () => {
    if (selectedPractice && selectedLevel) {
      setPracticeType(selectedPractice);
      setAccessLevel(selectedLevel);
      setCurrentView('upload');
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
                Denial Doctor
              </h1>
            </div>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-sm px-4 py-1 mb-4">
              AI-Powered Revenue Cycle Management
            </Badge>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mt-4 leading-relaxed">
              Recover denied claims with 16 specialized AI agents. From scan to full EHR integration,
              choose your recovery level and let AI handle the rest.
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

      {/* Step 1: Practice Type Selection */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-4">
            <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
            Choose Your Practice Type
          </div>
          <h2 className="text-3xl font-bold text-foreground">Medical or Dental?</h2>
          <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
            Select your practice type to get specialized denial management with the right code sets and rules.
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

      {/* Step 2: Level Selection */}
      {selectedPractice && (
        <section className="max-w-7xl mx-auto px-6 py-16 border-t border-border">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-4">
              <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
              Choose Your Recovery Level
            </div>
            <h2 className="text-3xl font-bold text-foreground">3 Levels of AI-Powered Recovery</h2>
            <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
              From diagnosis to full automation. Pick the level that matches your needs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {LEVEL_CONFIGS.map((level) => {
              const levelIcons = {
                scan: <Eye className="h-8 w-8" />,
                fix: <Wrench className="h-8 w-8" />,
                auto: <Cpu className="h-8 w-8" />,
              };
              const isSelected = selectedLevel === level.level;

              return (
                <button
                  key={level.level}
                  onClick={() => handleLevelSelect(level.level)}
                  className={`group relative rounded-2xl border-2 p-6 text-left transition-all duration-300 hover:shadow-xl ${
                    isSelected
                      ? `${level.borderColor} ${level.bgColor} shadow-lg scale-[1.02]`
                      : 'border-border bg-card hover:border-primary/30'
                  }`}
                >
                  {isSelected && (
                    <div className={`absolute -top-3 -right-3 h-8 w-8 rounded-full ${level.bgColor} ${level.color} flex items-center justify-center border-2 ${level.borderColor}`}>
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  )}
                  {level.level === 2 && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald text-primary-foreground text-xs px-3 py-0.5">
                      <Star className="h-3 w-3 mr-1" /> Most Popular
                    </Badge>
                  )}

                  <div className={`${level.color} mb-4`}>
                    {levelIcons[level.icon as keyof typeof levelIcons]}
                  </div>
                  <div className="mb-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Level {level.level}</span>
                  </div>
                  <h3 className={`text-xl font-bold ${level.color}`}>{level.name}</h3>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">{level.subtitle}</p>
                  <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{level.description}</p>

                  <div className="mt-5 space-y-2">
                    {level.features.slice(0, level.level === 1 ? 9 : level.level === 2 ? 6 : 6).map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className={`h-4 w-4 ${level.color} flex-shrink-0 mt-0.5`} />
                        <span className="text-xs text-foreground">{feature}</span>
                      </div>
                    ))}
                    {level.features.length > (level.level === 1 ? 9 : 6) && (
                      <p className="text-xs text-muted-foreground pl-6">+ {level.features.length - (level.level === 1 ? 9 : 6)} more features</p>
                    )}
                  </div>

                  <div className={`mt-5 pt-4 border-t ${level.borderColor}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs text-muted-foreground">Starting from</span>
                        <div className="flex items-baseline gap-1">
                          <span className={`text-2xl font-bold ${level.color}`}>
                            {level.level === 1 ? '$149' : level.level === 2 ? '$349' : '$699'}
                          </span>
                          <span className="text-xs text-muted-foreground">/100 claims</span>
                        </div>
                      </div>
                      <ArrowRight className={`h-5 w-5 ${level.color} group-hover:translate-x-1 transition-transform`} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Step 3: Pricing */}
      {showPricing && selectedLevel && (
        <section className="max-w-7xl mx-auto px-6 py-16 border-t border-border">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium mb-4">
              <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
              Choose Your Payment Plan
            </div>
            <h2 className="text-3xl font-bold text-foreground">Flexible Payment Options</h2>
            <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
              Pay per hundred claims, per claim, as you grow, or with zero upfront from collections.
            </p>
          </div>

          <PricingCards level={selectedLevel} practiceType={selectedPractice!} onGetStarted={handleGetStarted} />
        </section>
      )}

      {/* Bottom CTA */}
      {selectedPractice && selectedLevel && (
        <section className="max-w-7xl mx-auto px-6 py-16">
          <div className="rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-cyan/10 border border-primary/20 p-8 text-center">
            <h3 className="text-2xl font-bold text-foreground mb-3">Ready to recover your denied claims?</h3>
            <p className="text-muted-foreground max-w-lg mx-auto mb-6">
              {selectedPractice === 'medical' ? 'Medical' : 'Dental'} practice at Level {selectedLevel} ({LEVEL_CONFIGS.find(l => l.level === selectedLevel)?.name}).
              Upload your denial report and let AI start recovering revenue.
            </p>
            <Button
              size="lg"
              onClick={handleGetStarted}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-lg px-8 py-6"
            >
              <Upload className="h-5 w-5 mr-2" />
              Start Denial Recovery
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
            <span className="text-sm font-semibold text-foreground">Denial Doctor</span>
          </div>
          <p className="text-xs text-muted-foreground">AI-Powered Revenue Cycle Management Platform</p>
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

// ─── Pricing Cards Component ────────────────────────────────────────────────────

function PricingCards({ level, practiceType, onGetStarted }: {
  level: AccessLevel;
  practiceType: PracticeType;
  onGetStarted: () => void;
}) {
  const [selectedPayment, setSelectedPayment] = useState<PaymentModel>('per_hundred');
  const levelTiers = PRICING_TIERS.filter(t => t.level === level);
  const selectedTier = levelTiers.find(t => t.paymentModel === selectedPayment);

  const paymentIcons: Record<PaymentModel, React.ReactNode> = {
    per_hundred: <Package className="h-5 w-5" />,
    per_claim: <CreditCard className="h-5 w-5" />,
    pay_as_you_grow: <TrendingUp className="h-5 w-5" />,
    collections_percentage: <Percent className="h-5 w-5" />,
  };

  const paymentLabels: Record<PaymentModel, string> = {
    per_hundred: 'Per 100 Claims',
    per_claim: 'Pay Per Claim',
    pay_as_you_grow: 'Pay As You Grow',
    collections_percentage: 'No Upfront',
  };

  const paymentDescriptions: Record<PaymentModel, string> = {
    per_hundred: 'Best value for consistent volumes. Billed per 100 claims processed.',
    per_claim: 'Maximum flexibility. Only pay for what you use, claim by claim.',
    pay_as_you_grow: 'Start with a lower rate, scale up as your volume grows.',
    collections_percentage: 'Zero upfront cost. We only earn when you recover. Perfect for risk-free start.',
  };

  // Calculate example pricing for 50K claims
  const calculateExample = (model: PaymentModel): string => {
    const tier = levelTiers.find(t => t.paymentModel === model);
    if (!tier) return '';
    switch (model) {
      case 'per_hundred':
        return `$${(tier.price * 500).toLocaleString()} for 50K claims`;
      case 'per_claim':
        return `$${(tier.price * 50000).toLocaleString()} for 50K claims`;
      case 'pay_as_you_grow':
        return `Starts at $${tier.price}/claim, scales with volume`;
      case 'collections_percentage':
        return `${tier.price}% of recovered revenue only`;
    }
  };

  return (
    <div className="space-y-8">
      {/* Payment Model Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto">
        {(Object.keys(paymentLabels) as PaymentModel[]).map((model) => (
          <button
            key={model}
            onClick={() => setSelectedPayment(model)}
            className={`rounded-xl border-2 p-4 text-center transition-all ${
              selectedPayment === model
                ? 'border-primary bg-primary/5 shadow-md'
                : 'border-border bg-card hover:border-primary/30'
            }`}
          >
            <div className={`mx-auto mb-2 ${selectedPayment === model ? 'text-primary' : 'text-muted-foreground'}`}>
              {paymentIcons[model]}
            </div>
            <p className={`text-sm font-semibold ${selectedPayment === model ? 'text-primary' : 'text-foreground'}`}>
              {paymentLabels[model]}
            </p>
          </button>
        ))}
      </div>

      {/* Selected Payment Detail */}
      {selectedTier && (
        <div className="max-w-2xl mx-auto">
          <Card className="border-2 border-primary/30 bg-primary/5">
            <CardContent className="p-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-foreground">{selectedTier.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{selectedTier.description}</p>
                </div>
                {selectedTier.popular && (
                  <Badge className="bg-emerald text-primary-foreground">
                    <Star className="h-3 w-3 mr-1" /> Popular
                  </Badge>
                )}
              </div>

              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-4xl font-bold text-primary">
                  {selectedPayment === 'collections_percentage' ? `${selectedTier.price}%` : `$${selectedTier.price}`}
                </span>
                <span className="text-sm text-muted-foreground">{selectedTier.unit}</span>
              </div>

              <p className="text-sm text-muted-foreground mb-4">{paymentDescriptions[selectedPayment]}</p>

              {/* 50K Example */}
              <div className="rounded-lg bg-background/50 border border-border p-4 mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">50,000 claims example</span>
                </div>
                <p className="text-sm text-muted-foreground">{calculateExample(selectedPayment)}</p>
              </div>

              {selectedTier.savingsNote && (
                <div className="rounded-lg bg-emerald/10 border border-emerald/20 p-3 mb-6">
                  <p className="text-sm text-emerald font-medium">{selectedTier.savingsNote}</p>
                </div>
              )}

              {/* Features for this level */}
              <div className="space-y-2 mb-6">
                {LEVEL_CONFIGS.find(l => l.level === level)?.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm text-foreground">{feature}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={onGetStarted}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-6 text-lg"
              >
                <Upload className="h-5 w-5 mr-2" />
                Get Started - {practiceType === 'medical' ? 'Medical' : 'Dental'} Level {level}
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Comparison note */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground max-w-lg mx-auto">
          All plans include HIPAA-compliant processing, 256-bit encryption, and BAA coverage.
          No long-term contracts. Cancel anytime.
          {selectedPayment === 'collections_percentage' && ' No upfront payment required - we succeed when you recover.'}
        </p>
      </div>
    </div>
  );
}
