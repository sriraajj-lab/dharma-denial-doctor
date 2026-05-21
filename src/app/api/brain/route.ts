/**
 * Brain Status API
 *
 * GET /api/brain — Returns the current status of the Brain AI service,
 * including which providers are configured, cross-validation mode, and cost tracking.
 *
 * POST /api/brain — Send a prompt to the Brain for processing.
 * Body: { systemPrompt, userMessage, category, outputFormat }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getBrain } from '@/lib/brain';

export async function GET() {
  try {
    const brain = getBrain();
    const status = brain.getStatus();
    const costReport = brain.getCostReport();

    return NextResponse.json({
      status: 'online',
      providers: status.providers,
      crossValidation: {
        mode: process.env.BRAIN_CROSS_VALIDATION || 'high_stakes',
        description: 'When multiple providers are available, the Brain cross-validates AI outputs for anti-hallucination. "high_stakes" mode cross-validates code generation and corrections. "always" mode cross-validates all AI calls.',
      },
      costTracking: {
        enabled: true,
        totalCost: costReport.totalCost.toFixed(4),
        byProvider: Object.fromEntries(
          Object.entries(costReport.byProvider).map(([k, v]) => [k, v.toFixed(4)])
        ),
        recentCalls: costReport.records.slice(-10),
      },
      antiHallucination: {
        layers: [
          'Layer 1: Rule-based (0% hallucination risk)',
          'Layer 2: Single-model AI (with deterministic validation)',
          'Layer 3: Dual-model cross-validation (GPT + Claude)',
          'Layer 4: Deterministic validation (format, NCCI, code checks)',
          'Layer 5: Human review (mandatory for AI-generated content)',
        ],
        guards: [
          'CPT code format validation (4-5 digits)',
          'ICD-10 code format validation (letter + digits)',
          'Modifier format validation',
          'NCCI edit cross-reference',
          'Citation verification against known database',
          'Confidence threshold enforcement',
          'Zod schema validation on all outputs',
          'AI-generated content always flagged for human review',
        ],
      },
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { systemPrompt, userMessage, category = 'general', outputFormat = 'text' } = body;

    if (!systemPrompt || !userMessage) {
      return NextResponse.json(
        { error: 'systemPrompt and userMessage are required' },
        { status: 400 },
      );
    }

    const brain = getBrain();
    const result = await brain.think({
      systemPrompt,
      userMessage,
      outputFormat: outputFormat as 'json' | 'text',
      category: category as any,
      highStakes: false,
      temperature: 0.1,
    });

    return NextResponse.json({
      content: result.content,
      parsedContent: result.parsedContent,
      providers: result.providers,
      confidence: result.confidence,
      crossValidated: result.crossValidated,
      crossValidation: result.crossValidation,
      validation: result.validation,
      requiresHumanReview: result.requiresHumanReview,
      fallbackUsed: result.fallbackUsed,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
