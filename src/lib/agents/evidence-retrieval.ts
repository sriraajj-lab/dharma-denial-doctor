import { BaseAgent, AgentTaskResult } from './base-agent';
import { denialDataTool, codingIntelligenceTool } from './tool-registry';
import { db } from '../db';

export class EvidenceRetrievalAgent extends BaseAgent {
  constructor() {
    super('evidence-retrieval', 'Retrieves supporting evidence, documentation requirements, and policy references for denied claims', [
      'evidence_retrieval', 'documentation_requirements', 'policy_lookup', 'lcd_ncd_lookup'
    ]);
    this.registerTool(denialDataTool);
    this.registerTool(codingIntelligenceTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    if (taskId) await this.updateTaskStatus(taskId, 'running');

    try {
      const denialId = input.denialId as string;
      const denial = await this.useTool('denial_data', { action: 'get', denialId }) as Record<string, unknown> | null;
      if (!denial) {
        return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      // Get coding intelligence for coverage/LCD/NCD info
      const codingInfo = await this.useTool('coding_intelligence', {
        denialId,
        cptCode: denial.cptCode as string,
        modifier: denial.modifier as string | undefined,
        diagnosisCode: denial.diagnosisCode as string,
        carcCode: denial.carcCode as string,
      }) as Record<string, unknown>;

      // Determine required documentation
      const requiredDocs = this.getRequiredDocumentation(denial, codingInfo);

      // Find supporting policy references
      const policyRefs = this.getPolicyReferences(denial, codingInfo);

      // Check for similar resolved cases in history
      const similarCases = await this.findSimilarCases(denial);

      // Remember documentation patterns
      await this.remember(
        `docs:${denial.carcCode}:${denial.cptCode}`,
        { requiredDocs, policyRefs },
        'pattern',
        0.85
      );

      const result = {
        requiredDocuments: requiredDocs,
        policyReferences: policyRefs,
        similarCases: similarCases.slice(0, 5),
        codingAnalysis: {
          ncciFindings: codingInfo.ncciFindings,
          coverage: codingInfo.coverage,
          corrections: codingInfo.corrections,
        },
      };

      if (taskId) await this.updateTaskStatus(taskId, 'completed', result, ['denial_data', 'coding_intelligence']);

      const corrections = codingInfo.corrections as Array<unknown> | undefined;
      return {
        success: true,
        output: result,
        confidence: 0.85,
        toolsUsed: ['denial_data', 'coding_intelligence'],
        nextActions: corrections && corrections.length > 0 ? [{
          agent: 'correction-engine',
          task: 'correct',
          input: { denialId, evidence: result },
        }] : [],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (taskId) await this.updateTaskStatus(taskId, 'failed');
      return { success: false, output: { error: errorMsg }, confidence: 0, toolsUsed: [], error: errorMsg };
    }
  }

  private getRequiredDocumentation(
    denial: Record<string, unknown>,
    codingInfo: Record<string, unknown>
  ): Array<{ documentType: string; reason: string; priority: 'required' | 'recommended' | 'optional' }> {
    const docs: Array<{ documentType: string; reason: string; priority: 'required' | 'recommended' | 'optional' }> = [];
    const category = (denial.denialCategory as string) || '';
    const carcCode = denial.carcCode as string;

    // CARC-specific documentation
    if (carcCode === 'CO-16' || carcCode === 'CO-15') {
      docs.push({ documentType: 'Complete claim information', reason: 'Missing information per denial', priority: 'required' });
      docs.push({ documentType: 'Referring physician NPI', reason: 'Required for claim processing', priority: 'required' });
    }
    if (carcCode === 'CO-27' || category === 'medical_necessity') {
      docs.push({ documentType: 'Medical records', reason: 'Support medical necessity of service', priority: 'required' });
      docs.push({ documentType: 'Physician letter of medical necessity', reason: 'Document clinical rationale', priority: 'required' });
      docs.push({ documentType: 'Conservative treatment records', reason: 'Show failed conservative treatment', priority: 'recommended' });
      docs.push({ documentType: 'Peer-reviewed literature', reason: 'Support clinical appropriateness', priority: 'recommended' });
    }
    if (carcCode === 'CO-50' || category === 'authorization') {
      docs.push({ documentType: 'Prior authorization documentation', reason: 'Verify auth was obtained or justified', priority: 'required' });
      docs.push({ documentType: 'Emergency documentation', reason: 'If retro-auth for emergency', priority: 'recommended' });
    }
    if (carcCode === 'CO-22' || category === 'bundling') {
      docs.push({ documentType: 'Operative note', reason: 'Document distinct procedures', priority: 'required' });
      docs.push({ documentType: 'Separate encounter documentation', reason: 'Support modifier 59/X', priority: 'required' });
    }
    if (carcCode === 'CO-29' || category === 'timely_filing') {
      docs.push({ documentType: 'Clearinghouse submission confirmation', reason: 'Prove timely filing', priority: 'required' });
      docs.push({ documentType: 'Original claim acceptance report', reason: 'Show payer received claim on time', priority: 'required' });
    }

    // Coverage-specific from coding intelligence
    const coverage = codingInfo.coverage as Record<string, unknown> | null;
    if (coverage?.lcdReference) {
      docs.push({
        documentType: `LCD ${coverage.lcdReference} criteria documentation`,
        reason: 'Meet local coverage determination',
        priority: 'required',
      });
    }

    // Always recommended
    docs.push({ documentType: 'Explanation of Benefits', reason: 'Reference for appeal', priority: 'recommended' });

    return docs;
  }

  private getPolicyReferences(
    denial: Record<string, unknown>,
    codingInfo: Record<string, unknown>
  ): Array<{ type: string; reference: string; description: string; url?: string }> {
    const refs: Array<{ type: string; reference: string; description: string; url?: string }> = [];

    const coverage = codingInfo.coverage as Record<string, unknown> | null;
    if (coverage?.lcdReference) {
      refs.push({
        type: 'LCD',
        reference: coverage.lcdReference as string,
        description: `Local Coverage Determination for CPT ${denial.cptCode}`,
        url: `https://www.cms.gov/medicare-coverage-database/details/lcd-details.aspx?LCDId=${coverage.lcdReference}`,
      });
    }

    refs.push({ type: 'CARC', reference: denial.carcCode as string, description: 'Claim Adjustment Reason Code' });
    if (denial.rarcCode) {
      refs.push({ type: 'RARC', reference: denial.rarcCode as string, description: 'Remittance Advice Remark Code' });
    }

    // CMS references
    if (denial.carcCode === 'CO-22') {
      refs.push({
        type: 'NCCI',
        reference: 'CMS NCCI Policy Manual',
        description: 'National Correct Coding Initiative edits',
        url: 'https://www.cms.gov/files/zip/ncci-policy-manual-chapter-1-pdf.zip',
      });
    }

    return refs;
  }

  private async findSimilarCases(
    denial: Record<string, unknown>
  ): Promise<Array<{ claimNumber: string; outcome: string; correctionType: string; daysToResolution: number }>> {
    const records = await db.resubmissionRecord.findMany({
      where: {
        OR: [
          { payerName: denial.payerName as string, carcCode: denial.carcCode as string },
          { carcCode: denial.carcCode as string, cptCode: denial.cptCode as string },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return records.map(r => ({
      claimNumber: r.claimNumber,
      outcome: r.outcome,
      correctionType: r.correctionType,
      daysToResolution: r.daysToResolution ?? 30,
    }));
  }
}

export const evidenceRetrieval = new EvidenceRetrievalAgent();
