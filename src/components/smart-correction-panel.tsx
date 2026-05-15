'use client';

import { useState } from 'react';
import { Denial } from '@/lib/types';
import {
  Zap, AlertTriangle, CheckCircle2, XCircle, Info, TrendingUp,
  Code, FileCode, Shield, ArrowRight, Loader2, BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface SmartCorrectionResult {
  denialId: string;
  codingAnalysis: {
    overallAssessment: string;
    confidenceScore: number;
    corrections: Array<{
      type: string;
      field: string;
      currentValue: string;
      suggestedValue: string;
      rationale: string;
      riskLevel: string;
      supportingReference?: string;
    }>;
    ncciFindings: Array<{
      column1Code: string;
      column2Code: string;
      modifierAllowed: boolean;
      recommendation: string;
    }>;
    modifierSuggestions: Array<{
      modifier: string;
      modifierName: string;
      action: string;
      reason: string;
      documentationRequired: string;
    }>;
    coverageAnalysis: {
      isCovered: boolean;
      currentDiagnosis: string;
      suggestedDiagnoses: string[];
      lcdReference?: string;
      missingDocumentation: string[];
      coverageNotes: string;
    } | null;
    resubmissionStrategy: {
      method: string;
      frequencyCode: string;
      timelineRecommendation: string;
      steps: string[];
      estimatedDaysToResolution: number;
    };
    estimatedSuccessRate: number;
  };
  carcGuidance: {
    commonFixes: string[];
    successRate: number;
    typicalResolutionDays: number;
  };
  prediction: {
    predictedSuccessRate: number;
    confidence: number;
    basedOn: number;
    factors: Array<{ factor: string; impact: string; weight: number; detail: string }>;
    recommendation: string;
    alternativeStrategies: Array<{ strategy: string; predictedSuccess: number }>;
  };
  summary: {
    assessment: string;
    totalCorrections: number;
    estimatedSuccessRate: number;
    predictedSuccessRate: number;
    recommendation: string;
    resubmissionMethod: string;
    estimatedDaysToResolution: number;
    steps: string[];
  };
}

export function SmartCorrectionPanel({ denial }: { denial: Denial }) {
  const [result, setResult] = useState<SmartCorrectionResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runSmartCorrection() {
    setLoading(true);
    try {
      const res = await fetch(`/api/denials/${denial.id}/smart-correct`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setResult(data);
      toast.success('Smart coding analysis complete');
    } catch (err) {
      toast.error('Failed to run smart correction');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card className="border-violet-500/30 bg-card">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="relative">
              <Zap className="h-16 w-16 text-violet-400 animate-pulse" />
              <Loader2 className="h-6 w-6 text-violet-400 absolute -bottom-1 -right-1 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold mt-4">Smart Coding Engine Running</h3>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Checking NCCI edits, validating modifiers, analyzing LCD/NCD coverage, predicting success...
            </p>
            <Progress className="w-64 mt-4" value={55} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <Zap className="h-12 w-12 text-violet-400/50 mb-3" />
            <h3 className="text-lg font-medium text-foreground">Smart Coding Correction</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Runs NCCI edit validation, modifier analysis, CPT-ICD crosswalk, and predicts resubmission success using historical data.
            </p>
            <Button onClick={runSmartCorrection} className="mt-4 bg-violet-600 hover:bg-violet-700 text-white">
              <Zap className="h-4 w-4 mr-2" /> Run Smart Correction
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { codingAnalysis, carcGuidance, prediction, summary } = result;

  const assessmentColor = {
    correctable: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    partially_correctable: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    requires_appeal: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    not_correctable: 'text-red-400 bg-red-500/10 border-red-500/30',
  }[codingAnalysis.overallAssessment] || 'text-gray-400 bg-gray-500/10 border-gray-500/30';

  const recommendationColor = {
    proceed: 'text-emerald-400',
    proceed_with_caution: 'text-yellow-400',
    consider_appeal: 'text-orange-400',
    write_off: 'text-red-400',
  }[prediction.recommendation] || 'text-gray-400';

  return (
    <div className="space-y-4">
      {/* Assessment Summary */}
      <Card className={`border ${assessmentColor.split(' ').slice(1).join(' ')}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className="h-6 w-6 text-violet-400" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Assessment: <span className={assessmentColor.split(' ')[0]}>{summary.assessment.replace('_', ' ').toUpperCase()}</span>
                </h3>
                <p className="text-xs text-muted-foreground">{summary.totalCorrections} corrections identified</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Predicted Success</p>
              <p className={`text-2xl font-bold ${recommendationColor}`}>{summary.predictedSuccessRate}%</p>
            </div>
          </div>

          {/* Success meters */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="rounded-lg bg-secondary p-3 text-center">
              <p className="text-xs text-muted-foreground">Coding Engine</p>
              <p className="text-lg font-bold text-violet-400">{summary.estimatedSuccessRate}%</p>
            </div>
            <div className="rounded-lg bg-secondary p-3 text-center">
              <p className="text-xs text-muted-foreground">Historical Data</p>
              <p className="text-lg font-bold text-blue-400">{summary.predictedSuccessRate}%</p>
            </div>
            <div className="rounded-lg bg-secondary p-3 text-center">
              <p className="text-xs text-muted-foreground">Resolution Time</p>
              <p className="text-lg font-bold text-foreground">{summary.estimatedDaysToResolution}d</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* NCCI Findings */}
      {codingAnalysis.ncciFindings.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Code className="h-4 w-4 text-blue-400" /> NCCI Edit Findings
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {codingAnalysis.ncciFindings.map((finding, idx) => (
              <div key={idx} className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">
                    {finding.column1Code} + {finding.column2Code}
                  </Badge>
                  <Badge variant="outline" className={finding.modifierAllowed ? 'text-emerald-400 border-emerald-500/30 text-[10px]' : 'text-red-400 border-red-500/30 text-[10px]'}>
                    Modifier {finding.modifierAllowed ? 'ALLOWED' : 'NOT ALLOWED'}
                  </Badge>
                </div>
                <p className="text-sm text-foreground/90">{finding.recommendation}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Modifier Suggestions */}
      {codingAnalysis.modifierSuggestions.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileCode className="h-4 w-4 text-purple-400" /> Modifier Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {codingAnalysis.modifierSuggestions.map((mod, idx) => (
              <div key={idx} className="rounded-lg bg-purple-500/5 border border-purple-500/20 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-mono font-bold text-purple-400">{mod.modifier}</span>
                  <span className="text-xs text-muted-foreground">({mod.modifierName})</span>
                  <Badge variant="outline" className="text-[10px] ml-auto capitalize">{mod.action}</Badge>
                </div>
                <p className="text-sm text-foreground/90">{mod.reason}</p>
                <p className="text-xs text-muted-foreground mt-1">Documentation: {mod.documentationRequired}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Coverage Analysis */}
      {codingAnalysis.coverageAnalysis && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-orange-400" /> LCD/NCD Coverage Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              {codingAnalysis.coverageAnalysis.isCovered ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              ) : (
                <XCircle className="h-5 w-5 text-red-400" />
              )}
              <span className={`text-sm font-medium ${codingAnalysis.coverageAnalysis.isCovered ? 'text-emerald-400' : 'text-red-400'}`}>
                {codingAnalysis.coverageAnalysis.isCovered ? 'Diagnosis meets coverage criteria' : 'Diagnosis may NOT meet coverage criteria'}
              </span>
            </div>
            <p className="text-sm text-foreground/80">{codingAnalysis.coverageAnalysis.coverageNotes}</p>

            {codingAnalysis.coverageAnalysis.lcdReference && (
              <p className="text-xs text-muted-foreground">Reference: LCD {codingAnalysis.coverageAnalysis.lcdReference}</p>
            )}

            {codingAnalysis.coverageAnalysis.suggestedDiagnoses.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">Covered diagnoses to consider:</p>
                <div className="flex flex-wrap gap-1">
                  {codingAnalysis.coverageAnalysis.suggestedDiagnoses.map((dx, i) => (
                    <Badge key={i} variant="outline" className="text-xs font-mono text-emerald-400 border-emerald-500/30">{dx}</Badge>
                  ))}
                </div>
              </div>
            )}

            {codingAnalysis.coverageAnalysis.missingDocumentation.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">Required documentation:</p>
                <ul className="space-y-1">
                  {codingAnalysis.coverageAnalysis.missingDocumentation.map((doc, i) => (
                    <li key={i} className="text-xs text-foreground/80 flex items-start gap-1">
                      <span className="text-orange-400 mt-0.5">-</span> {doc}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Specific Corrections */}
      {codingAnalysis.corrections.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Recommended Corrections ({codingAnalysis.corrections.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {codingAnalysis.corrections.map((corr, idx) => (
              <div key={idx} className="rounded-lg bg-secondary p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{corr.field}</span>
                  <Badge variant="outline" className={
                    corr.riskLevel === 'low' ? 'text-emerald-400 border-emerald-500/30' :
                    corr.riskLevel === 'medium' ? 'text-yellow-400 border-yellow-500/30' :
                    'text-red-400 border-red-500/30'
                  }>
                    {corr.riskLevel} risk
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">{corr.currentValue || '(none)'}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">{corr.suggestedValue}</span>
                </div>
                <p className="text-xs text-muted-foreground">{corr.rationale}</p>
                {corr.supportingReference && (
                  <p className="text-[10px] text-blue-400">{corr.supportingReference}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Prediction Factors */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-400" /> Success Prediction Factors
            <span className="text-xs text-muted-foreground ml-auto">Based on {prediction.basedOn} similar records</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-2">
          {prediction.factors.map((factor, idx) => (
            <div key={idx} className="flex items-start gap-2 text-sm">
              {factor.impact === 'positive' ? (
                <TrendingUp className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              ) : factor.impact === 'negative' ? (
                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
              ) : (
                <Info className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <span className="font-medium text-foreground">{factor.factor}</span>
                <p className="text-xs text-muted-foreground">{factor.detail}</p>
              </div>
            </div>
          ))}

          {prediction.alternativeStrategies.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Alternative strategies:</p>
              {prediction.alternativeStrategies.map((alt, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs py-1">
                  <span className="text-foreground">{alt.strategy}</span>
                  <span className="font-bold text-blue-400">{alt.predictedSuccess}%</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resubmission Steps */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-emerald-400" /> Resubmission Steps
            <Badge variant="outline" className="ml-2 text-[10px]">{codingAnalysis.resubmissionStrategy.method.replace(/_/g, ' ')}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-3">{codingAnalysis.resubmissionStrategy.timelineRecommendation}</p>
          <ol className="space-y-2">
            {codingAnalysis.resubmissionStrategy.steps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-3 text-sm">
                <span className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0 mt-0.5">{idx + 1}</span>
                <span className="text-foreground/90">{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* CARC Quick Reference */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Info className="h-4 w-4 text-cyan-400" /> CARC {denial.carcCode} Quick Reference
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 mb-3">
            <div className="rounded-lg bg-secondary p-2 text-center flex-1">
              <p className="text-xs text-muted-foreground">Historical Success</p>
              <p className="text-lg font-bold text-cyan-400">{carcGuidance.successRate}%</p>
            </div>
            <div className="rounded-lg bg-secondary p-2 text-center flex-1">
              <p className="text-xs text-muted-foreground">Typical Resolution</p>
              <p className="text-lg font-bold text-foreground">{carcGuidance.typicalResolutionDays} days</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Common fixes for this denial code:</p>
          <ul className="space-y-1">
            {carcGuidance.commonFixes.map((fix, idx) => (
              <li key={idx} className="text-xs text-foreground/80 flex items-start gap-1">
                <CheckCircle2 className="h-3 w-3 text-cyan-400 mt-0.5 flex-shrink-0" /> {fix}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
