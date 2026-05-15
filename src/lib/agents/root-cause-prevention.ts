import { BaseAgent, AgentTaskResult } from './base-agent';
import { denialDataTool, claimScrubTool } from './tool-registry';
import { db } from '../db';

export class RootCausePreventionAgent extends BaseAgent {
  constructor() {
    super('root-cause-prevention', 'Identifies root causes of denials and creates prevention rules to stop future denials before they happen', [
      'root_cause_analysis', 'prevention_rule_creation', 'pattern_detection', 'process_improvement'
    ]);
    this.registerTool(denialDataTool);
    this.registerTool(claimScrubTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    if (taskId) await this.updateTaskStatus(taskId, 'running');

    try {
      const denialId = input.denialId as string;

      // Analyze root cause for specific denial
      if (denialId) {
        return await this.analyzeRootCause(denialId, taskId);
      }

      // Full prevention scan
      return await this.runPreventionScan(taskId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return { success: false, output: { error: errorMsg }, confidence: 0, toolsUsed: [], error: errorMsg };
    }
  }

  private async analyzeRootCause(denialId: string, taskId?: string): Promise<AgentTaskResult> {
    const denial = await this.useTool('denial_data', { action: 'get', denialId }) as any;
    if (!denial) {
      return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
    }

    // Analyze the root cause
    const rootCause = this.determineRootCause(denial);

    // Check for similar patterns in other denials
    const similarDenials = await db.denial.findMany({
      where: {
        payerName: denial.payerName,
        carcCode: denial.carcCode,
        cptCode: denial.cptCode,
        status: { notIn: ['Closed'] },
      },
      take: 20,
    });

    // Create prevention rule if pattern detected
    let preventionRuleCreated = false;
    if (similarDenials.length >= 2) {
      const existingRule = await db.preventionRule.findFirst({
        where: {
          ruleType: rootCause.preventionType,
          isActive: true,
        }
      });

      if (!existingRule) {
        await db.preventionRule.create({
          data: {
            ruleName: `Prevent ${rootCause.category} for ${denial.payerName} ${denial.cptCode}`,
            ruleType: rootCause.preventionType,
            triggerConditions: JSON.stringify(rootCause.triggerConditions),
            action: rootCause.severity === 'high' ? 'block' : 'warn',
            severity: rootCause.severity,
            sourceAgent: this.name,
            sourceInsight: rootCause.description,
            isActive: true,
          }
        });
        preventionRuleCreated = true;
      } else {
        // Update trigger count
        await db.preventionRule.update({
          where: { id: existingRule.id },
          data: { timesTriggered: { increment: similarDenials.length } }
        });
      }
    }

    // Run claim scrub to check for prevention opportunities
    const scrubResult = await this.useTool('claim_scrub', {
      claimData: denial,
    }) as any;

    // Remember this root cause pattern
    await this.remember(
      `rootcause:${denial.carcCode}:${denial.cptCode}`,
      { rootCause, similarCount: similarDenials.length, preventionCreated: preventionRuleCreated },
      'pattern',
      0.85
    );

    const result = {
      rootCause,
      similarDenialCount: similarDenials.length,
      preventionRuleCreated,
      scrubFindings: scrubResult.findings,
      recommendedPreventionSteps: rootCause.preventionSteps,
    };

    if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['denial_data', 'claim_scrub']);

    return {
      success: true,
      output: result,
      confidence: 0.85,
      toolsUsed: ['denial_data', 'claim_scrub'],
    };
  }

  private async runPreventionScan(taskId?: string): Promise<AgentTaskResult> {
    // Find repeating denial patterns
    const denialPatterns = await db.denial.groupBy({
      by: ['payerName', 'carcCode', 'cptCode'],
      where: { createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      _count: { id: true },
      _sum: { deniedAmount: true },
    });

    // Post-filter for patterns with 3+ occurrences
    const significantPatterns = denialPatterns
      .filter(p => p._count.id >= 3)
      .sort((a, b) => b._count.id - a._count.id);

    const preventionOpportunities = significantPatterns.map(p => ({
      payerName: p.payerName,
      carcCode: p.carcCode,
      cptCode: p.cptCode,
      count: p._count.id,
      totalAmount: p._sum.deniedAmount || 0,
    }));

    const result = {
      patternsFound: preventionOpportunities.length,
      preventionOpportunities,
      totalPreventableAmount: preventionOpportunities.reduce((sum, p) => sum + p.totalAmount, 0),
    };

    if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['denial_data', 'claim_scrub']);

    return {
      success: true,
      output: result,
      confidence: 0.8,
      toolsUsed: ['denial_data', 'claim_scrub'],
    };
  }

  private determineRootCause(denial: any): {
    category: string;
    description: string;
    preventionType: string;
    triggerConditions: Record<string, unknown>;
    severity: string;
    preventionSteps: string[];
  } {
    const categoryMap: Record<string, { category: string; preventionType: string; preventionSteps: string[] }> = {
      'CO-4': { category: 'coding_error', preventionType: 'coding_prevention', preventionSteps: ['Implement modifier validation', 'Add modifier prompts for surgical codes', 'Train staff on modifier requirements'] },
      'CO-16': { category: 'missing_information', preventionType: 'filing_prevention', preventionSteps: ['Implement claim completeness check', 'Auto-populate required fields', 'Add pre-submission validation'] },
      'CO-22': { category: 'bundling', preventionType: 'coding_prevention', preventionSteps: ['Implement CCI edit checking', 'Add bundling alerts at charge entry', 'Review NCCI updates quarterly'] },
      'CO-27': { category: 'medical_necessity', preventionType: 'auth_prevention', preventionSteps: ['Pre-verify LCD/NCD criteria', 'Document conservative treatment', 'Ensure diagnosis specificity'] },
      'CO-29': { category: 'timely_filing', preventionType: 'filing_prevention', preventionSteps: ['Set up filing deadline alerts', 'Implement automated submission tracking', 'Create escalation workflow for approaching deadlines'] },
      'CO-50': { category: 'authorization', preventionType: 'auth_prevention', preventionSteps: ['Implement auth requirement checking', 'Create auth tracking system', 'Set up pre-service auth verification'] },
    };

    const mapped = categoryMap[denial.carcCode] || {
      category: denial.denialCategory || 'other',
      preventionType: 'coding_prevention',
      preventionSteps: ['Review denial patterns and implement targeted prevention'],
    };

    return {
      category: mapped.category,
      description: `Recurring ${mapped.category} pattern: ${denial.carcCode} for CPT ${denial.cptCode} with ${denial.payerName}`,
      preventionType: mapped.preventionType,
      triggerConditions: {
        payerName: denial.payerName,
        carcCode: denial.carcCode,
        cptCode: denial.cptCode,
      },
      severity: denial.deniedAmount > 1000 ? 'high' : 'medium',
      preventionSteps: mapped.preventionSteps,
    };
  }
}

export const rootCausePrevention = new RootCausePreventionAgent();
