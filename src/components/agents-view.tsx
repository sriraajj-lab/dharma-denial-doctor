'use client';

import { useState } from 'react';
import { AgentStatus } from '@/lib/types';
import {
  Bot,
  Wrench,
  ShieldCheck,
  Activity,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Zap,
  BrainCircuit,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

const AGENT_STATUS_COLORS: Record<string, string> = {
  idle: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  running: 'bg-primary/20 text-primary border-primary/30',
  completed: 'bg-emerald/20 text-emerald border-emerald/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const AGENT_STATUS_DOT: Record<string, string> = {
  idle: 'bg-gray-400',
  running: 'bg-primary animate-pulse',
  completed: 'bg-emerald',
  error: 'bg-red-400',
};

const defaultAgents: AgentStatus[] = [
  {
    id: 'denial-analysis',
    name: 'Denial Analysis Agent',
    description: 'Analyzes denied medical claims using CARC/RARC codes, identifies root causes, classifies denials, and recommends next actions.',
    status: 'idle',
    totalRuns: 156,
    successRate: 94.2,
    avgDuration: 3.2,
  },
  {
    id: 'correction-suggestion',
    name: 'Correction Suggestion Agent',
    description: 'Recommends compliant corrections for denied claims including demographic fixes, coding changes, authorization additions, and modifier corrections.',
    status: 'idle',
    totalRuns: 128,
    successRate: 91.8,
    avgDuration: 4.1,
  },
  {
    id: 'quality-checker',
    name: 'Quality Checker Agent',
    description: 'Validates proposed corrections before resubmission by checking that corrections address denial reasons, required fields are complete, and no compliance risks exist.',
    status: 'idle',
    totalRuns: 98,
    successRate: 97.4,
    avgDuration: 2.8,
  },
];

const agentIcons: Record<string, React.ReactNode> = {
  'denial-analysis': <BrainCircuit className="h-8 w-8" />,
  'correction-suggestion': <Wrench className="h-8 w-8" />,
  'quality-checker': <ShieldCheck className="h-8 w-8" />,
};

const agentColors: Record<string, string> = {
  'denial-analysis': 'text-primary',
  'correction-suggestion': 'text-orange-400',
  'quality-checker': 'text-emerald',
};

export function AgentsView() {
  const [agents] = useState<AgentStatus[]>(defaultAgents);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">AI Agents</h2>
        <p className="text-muted-foreground mt-1">Monitor and manage AI-powered denial management agents</p>
      </div>

      {/* Agent Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground">3</p>
            <p className="text-xs text-muted-foreground">Active Agents</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <div className="h-12 w-12 rounded-full bg-emerald/10 flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="h-6 w-6 text-emerald" />
            </div>
            <p className="text-2xl font-bold text-foreground">382</p>
            <p className="text-xs text-muted-foreground">Total Runs</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 text-center">
            <div className="h-12 w-12 rounded-full bg-cyan/10 flex items-center justify-center mx-auto mb-2">
              <Zap className="h-6 w-6 text-cyan" />
            </div>
            <p className="text-2xl font-bold text-foreground">94.5%</p>
            <p className="text-xs text-muted-foreground">Overall Success Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Agent Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {agents.map((agent) => (
          <Card key={agent.id} className="border-border bg-card hover:border-primary/30 transition-smooth">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className={`${agentColors[agent.id]}`}>
                  {agentIcons[agent.id]}
                </div>
                <Badge variant="outline" className={AGENT_STATUS_COLORS[agent.status]}>
                  <div className={`h-2 w-2 rounded-full mr-1.5 ${AGENT_STATUS_DOT[agent.status]}`} />
                  {agent.status}
                </Badge>
              </div>
              <CardTitle className="text-base font-semibold mt-3">{agent.name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">{agent.description}</p>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-4">
              <Separator className="bg-border" />

              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground">{agent.totalRuns}</p>
                  <p className="text-[10px] text-muted-foreground">Total Runs</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-emerald">{agent.successRate}%</p>
                  <p className="text-[10px] text-muted-foreground">Success Rate</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-primary">{agent.avgDuration}s</p>
                  <p className="text-[10px] text-muted-foreground">Avg Duration</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Success Rate</span>
                  <span className="text-xs font-medium text-emerald">{agent.successRate}%</span>
                </div>
                <Progress value={agent.successRate} className="h-1.5" />
              </div>

              {agent.lastRun && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Last run: {new Date(agent.lastRun).toLocaleString()}
                </div>
              )}

              {agent.status === 'running' && (
                <div className="flex items-center gap-2 text-xs text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Currently processing...
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Agent Architecture */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" /> Agent Workflow Architecture
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            <div className="flex-1 rounded-xl bg-primary/10 border border-primary/20 p-6 text-center">
              <BrainCircuit className="h-10 w-10 text-primary mx-auto mb-3" />
              <h3 className="text-sm font-bold text-foreground">Step 1: Analyze</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Analyze CARC/RARC codes, identify root cause, classify denial, determine correctability
              </p>
            </div>
            <div className="text-muted-foreground text-2xl hidden md:block">→</div>
            <div className="text-muted-foreground text-2xl md:hidden">↓</div>
            <div className="flex-1 rounded-xl bg-orange-500/10 border border-orange-500/20 p-6 text-center">
              <Wrench className="h-10 w-10 text-orange-400 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-foreground">Step 2: Correct</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Suggest compliant corrections, propose changes, identify required documents
              </p>
            </div>
            <div className="text-muted-foreground text-2xl hidden md:block">→</div>
            <div className="text-muted-foreground text-2xl md:hidden">↓</div>
            <div className="flex-1 rounded-xl bg-emerald/10 border border-emerald/20 p-6 text-center">
              <ShieldCheck className="h-10 w-10 text-emerald mx-auto mb-3" />
              <h3 className="text-sm font-bold text-foreground">Step 3: Validate</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Validate corrections, check compliance, ensure completeness before resubmission
              </p>
            </div>
          </div>

          <div className="mt-6 p-4 rounded-lg bg-secondary">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Agent Configuration</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">AI Model</span>
                <span className="font-mono text-primary">Azure OpenAI GPT-5.5</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">API Version</span>
                <span className="font-mono text-foreground">2025-04-01-preview</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Response Format</span>
                <span className="font-mono text-foreground">Structured JSON</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Phase</span>
                <span className="font-mono text-emerald">Phase 1 - Denial Management</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
