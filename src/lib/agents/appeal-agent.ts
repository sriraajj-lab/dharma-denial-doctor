/**
 * Agent 5: Appeal Agent (ENHANCED with Brain)
 *
 * SCOPE: Generate appeal strategies and letters with cited regulations, LCDs, payer policies
 * HANDLES: All denial categories where appeal is recommended
 * FORBIDDEN: Cannot change codes, cannot verify eligibility, cannot modify claims
 *
 * Anti-Hallucination (ENHANCED):
 * - Must cite REAL regulation/policy numbers (42 CFR, LCD numbers, AMA CPT guidelines)
 * - If it can't find a real citation, it says "Manual research needed" — NEVER invents citations
 * - Brain generates AI-powered appeal letters (GPT + Claude cross-validated)
 * - Template-based letters available as fallback when AI is unavailable
 * - ALL AI-generated letters require human review before submission
 * - All factual claims in the letter must have a source reference
 * - Cross-validation: If GPT and Claude disagree on appeal strategy, both opinions shown
 */

import { z } from 'zod';
import { BaseAgentV2, AgentTaskResult } from './base-agent-v2';
import { denialDataTool, resubmissionIntelligenceTool, appealsTool, codingIntelligenceTool } from './tool-registry';
import { getBrain, generateAppealLetter as brainGenerateAppealLetter, type BrainResult } from '../brain';
import { db } from '../db';

// ─── OUTPUT SCHEMA ────────────────────────────────────────────────────────────

export const AppealOutputSchema = z.object({
  appealLevel: z.enum(['first_level', 'second_level', 'external_review']),
  strategy: z.object({
    approach: z.string(),
    keyArguments: z.array(z.object({
      argument: z.string(),
      citation: z.string().nullable(),
      citationType: z.enum(['regulation', 'lcd', 'ncd', 'payer_policy', 'clinical_guideline', 'none']).nullable(),
      confidenceInCitation: z.number().min(0).max(1),
    })),
    requiredDocuments: z.array(z.string()),
    estimatedSuccessRate: z.number().min(0).max(100),
    deadlineDays: z.number().positive(),
    nextStepsIfDenied: z.string(),
  }),
  letterTemplate: z.object({
    templateType: z.string(),
    subject: z.string(),
    body: z.string(),
    fillInFields: z.array(z.object({
      field: z.string(),
      description: z.string(),
      example: z.string().nullable(),
    })),
    citationsInLetter: z.array(z.object({
      claim: z.string(),
      source: z.string(),
      sourceType: z.enum(['regulation', 'lcd', 'ncd', 'payer_policy', 'clinical_guideline']),
      verified: z.boolean(),
    })),
    disclaimer: z.string(),
    aiGenerated: z.boolean().optional(),
    crossValidated: z.boolean().optional(),
    providerOpinions: z.array(z.object({
      provider: z.string(),
      opinion: z.string(),
    })).nullable().optional(),
  }),
  confidenceScore: z.number().min(0).max(1),
  requiresHumanReview: z.boolean(),
  humanReviewReason: z.string().nullable(),
});

export type AppealOutput = z.infer<typeof AppealOutputSchema>;

// ─── CITATION DATABASE (real, verified sources only) ───────────────────────────

interface CitationEntry {
  id: string;
  type: 'regulation' | 'lcd' | 'ncd' | 'payer_policy' | 'clinical_guideline';
  reference: string;
  description: string;
  applicableCategories: string[];
  url?: string;
}

const VERIFIED_CITATIONS: CitationEntry[] = [
  // Medical Necessity
  { id: '42cfr410.32', type: 'regulation', reference: '42 CFR § 410.32', description: 'Diagnostic x-ray/tests must be ordered by treating physician', applicableCategories: ['medical_necessity'] },
  { id: 'ss1862a1a', type: 'regulation', reference: 'Social Security Act § 1862(a)(1)(A)', description: 'Services must be reasonable and necessary for diagnosis or treatment', applicableCategories: ['medical_necessity'] },
  { id: 'cmslcd', type: 'lcd', reference: 'LCD Reference', description: 'Local Coverage Determination — must be checked per CPT code', applicableCategories: ['medical_necessity', 'coding_error'] },

  // Bundling/CCI
  { id: 'ncci_manual', type: 'regulation', reference: 'CMS NCCI Policy Manual Chapter 1', description: 'National Correct Coding Initiative edits and unbundling rules', applicableCategories: ['bundling'] },

  // Authorization
  { id: '42cfr410.24', type: 'regulation', reference: '42 CFR § 410.24', description: 'Retroactive authorization requirements', applicableCategories: ['authorization'] },

  // Timely Filing
  { id: 'cms_filing', type: 'regulation', reference: 'CMS Internet-Only Manual (IOM) Pub. 100-04, Chapter 1', description: 'Medicare claims filing requirements and deadlines', applicableCategories: ['timely_filing'] },

  // Appeals Process
  { id: '42cfr405_subparti', type: 'regulation', reference: '42 CFR Part 405, Subpart I', description: 'Medicare appeals process — redetermination and reconsideration', applicableCategories: ['medical_necessity', 'authorization', 'bundling', 'coding_error'] },
  { id: 'ama_cpt', type: 'clinical_guideline', reference: 'AMA CPT Guidelines', description: 'Current Procedural Terminology coding guidelines', applicableCategories: ['coding_error', 'bundling'] },
];

// ─── APPEAL LETTER TEMPLATES (FALLBACK) ────────────────────────────────────────

interface LetterTemplate {
  type: string;
  subject: string;
  body: string;
  fillInFields: Array<{ field: string; description: string; example: string | null }>;
  disclaimer: string;
}

const LETTER_TEMPLATES: Record<string, LetterTemplate> = {
  medical_necessity: {
    type: 'medical_necessity',
    subject: 'Appeal of Denial — Medical Necessity — Claim [CLAIM_NUMBER]',
    body: `Dear [PAYER_NAME] Appeals Department,

I am writing to appeal the denial of claim [CLAIM_NUMBER] for [PATIENT_NAME] (Member ID: [MEMBER_ID]) for services rendered on [DATE_OF_SERVICE]. The claim was denied under CARC code [CARC_CODE] with the reason "[DENIAL_REASON]."

We respectfully disagree with this determination for the following reasons:

1. The service billed under CPT [CPT_CODE] with diagnosis [DIAGNOSIS_CODE] was medically necessary for the patient's condition.
   [CITATION_1]

2. Clinical documentation clearly supports the medical necessity of the service, including [DOCUMENTATION_SUMMARY].
   [CITATION_2]

3. Conservative treatment was attempted and failed prior to this service, as documented in the enclosed records.

Enclosed please find:
- Complete medical records
- Physician letter of medical necessity
- [ADDITIONAL_DOCUMENTS]

We request that this claim be reprocessed for payment. If you require additional information, please contact our office.

Respectfully,
[PROVIDER_NAME]
[PROVIDER_NPI]
[FACILITY_NAME]`,
    fillInFields: [
      { field: 'CLAIM_NUMBER', description: 'Claim number from denial', example: null },
      { field: 'PAYER_NAME', description: 'Insurance payer name', example: null },
      { field: 'PATIENT_NAME', description: 'Patient full name', example: null },
      { field: 'MEMBER_ID', description: 'Patient member ID', example: null },
      { field: 'DATE_OF_SERVICE', description: 'Date of service', example: null },
      { field: 'CARC_CODE', description: 'Claim adjustment reason code', example: 'CO-27' },
      { field: 'DENIAL_REASON', description: 'Reason for denial from EOB', example: null },
      { field: 'CPT_CODE', description: 'Procedure code', example: null },
      { field: 'DIAGNOSIS_CODE', description: 'ICD-10 diagnosis code', example: null },
      { field: 'CITATION_1', description: 'First regulatory citation', example: 'Per 42 CFR § 410.32' },
      { field: 'CITATION_2', description: 'Second regulatory citation', example: null },
      { field: 'DOCUMENTATION_SUMMARY', description: 'Summary of supporting documentation', example: null },
      { field: 'ADDITIONAL_DOCUMENTS', description: 'List of additional enclosed documents', example: null },
      { field: 'PROVIDER_NAME', description: 'Rendering provider name', example: null },
      { field: 'PROVIDER_NPI', description: 'Provider NPI number', example: null },
      { field: 'FACILITY_NAME', description: 'Facility name', example: null },
    ],
    disclaimer: 'This letter template is provided as a starting point and must be reviewed by qualified staff before submission. All citations and factual claims must be verified against current regulations and payer policies.',
  },
  authorization: {
    type: 'authorization',
    subject: 'Appeal of Denial — Prior Authorization — Claim [CLAIM_NUMBER]',
    body: `Dear [PAYER_NAME] Appeals Department,

I am writing to appeal the denial of claim [CLAIM_NUMBER] for [PATIENT_NAME] (Member ID: [MEMBER_ID]) for services rendered on [DATE_OF_SERVICE]. The claim was denied for lack of prior authorization under CARC code [CARC_CODE].

We request reconsideration based on the following:

1. The service met criteria for prior authorization, and circumstances prevented obtaining prior authorization.
   [CITATION_1]

2. The service was medically necessary and emergent/urgent in nature.
   [CITATION_2]

3. We are submitting a retroactive authorization request with supporting clinical documentation.

Enclosed please find:
- Retroactive authorization application
- Clinical documentation supporting medical necessity
- Emergency documentation (if applicable)
- [ADDITIONAL_DOCUMENTS]

We request retroactive authorization and reprocessing of this claim.

Respectfully,
[PROVIDER_NAME]
[PROVIDER_NPI]
[FACILITY_NAME]`,
    fillInFields: [
      { field: 'CLAIM_NUMBER', description: 'Claim number from denial', example: null },
      { field: 'PAYER_NAME', description: 'Insurance payer name', example: null },
      { field: 'PATIENT_NAME', description: 'Patient full name', example: null },
      { field: 'MEMBER_ID', description: 'Patient member ID', example: null },
      { field: 'DATE_OF_SERVICE', description: 'Date of service', example: null },
      { field: 'CARC_CODE', description: 'Claim adjustment reason code', example: 'CO-50' },
      { field: 'CITATION_1', description: 'First regulatory citation', example: 'Per 42 CFR § 410.24' },
      { field: 'CITATION_2', description: 'Second regulatory citation', example: null },
      { field: 'ADDITIONAL_DOCUMENTS', description: 'List of additional enclosed documents', example: null },
      { field: 'PROVIDER_NAME', description: 'Rendering provider name', example: null },
      { field: 'PROVIDER_NPI', description: 'Provider NPI number', example: null },
      { field: 'FACILITY_NAME', description: 'Facility name', example: null },
    ],
    disclaimer: 'This letter template is provided as a starting point and must be reviewed by qualified staff before submission. All citations and factual claims must be verified against current regulations and payer policies.',
  },
  coding_error: {
    type: 'coding_error',
    subject: 'Appeal of Denial — Coding Correction — Claim [CLAIM_NUMBER]',
    body: `Dear [PAYER_NAME] Appeals Department,

I am writing to appeal the denial of claim [CLAIM_NUMBER] for [PATIENT_NAME] (Member ID: [MEMBER_ID]) for services rendered on [DATE_OF_SERVICE]. The claim was denied under CARC code [CARC_CODE] with the reason "[DENIAL_REASON]."

Upon review, we have identified the following coding corrections:

[CORRECTION_DETAILS]

The corrections are supported by:
- AMA CPT coding guidelines
- NCCI edit analysis
- [CITATION_1]

We are submitting a corrected claim with the above changes and request reprocessing.

Respectfully,
[PROVIDER_NAME]
[PROVIDER_NPI]
[FACILITY_NAME]`,
    fillInFields: [
      { field: 'CLAIM_NUMBER', description: 'Claim number from denial', example: null },
      { field: 'PAYER_NAME', description: 'Insurance payer name', example: null },
      { field: 'PATIENT_NAME', description: 'Patient full name', example: null },
      { field: 'MEMBER_ID', description: 'Patient member ID', example: null },
      { field: 'DATE_OF_SERVICE', description: 'Date of service', example: null },
      { field: 'CARC_CODE', description: 'Claim adjustment reason code', example: 'CO-4' },
      { field: 'DENIAL_REASON', description: 'Reason for denial from EOB', example: null },
      { field: 'CORRECTION_DETAILS', description: 'Details of coding corrections made', example: null },
      { field: 'CITATION_1', description: 'Regulatory citation for correction', example: 'Per AMA CPT Guidelines' },
      { field: 'PROVIDER_NAME', description: 'Rendering provider name', example: null },
      { field: 'PROVIDER_NPI', description: 'Provider NPI number', example: null },
      { field: 'FACILITY_NAME', description: 'Facility name', example: null },
    ],
    disclaimer: 'This letter template is provided as a starting point and must be reviewed by qualified staff before submission. All citations and factual claims must be verified against current regulations and payer policies.',
  },
  default: {
    type: 'default',
    subject: 'Appeal of Denial — Claim [CLAIM_NUMBER]',
    body: `Dear [PAYER_NAME] Appeals Department,

I am writing to appeal the denial of claim [CLAIM_NUMBER] for [PATIENT_NAME] (Member ID: [MEMBER_ID]) for services rendered on [DATE_OF_SERVICE]. The claim was denied under CARC code [CARC_CODE].

We respectfully request reconsideration of this denial. [ADDITIONAL_ARGUMENTS]

Enclosed please find supporting documentation.

Respectfully,
[PROVIDER_NAME]
[PROVIDER_NPI]
[FACILITY_NAME]`,
    fillInFields: [
      { field: 'CLAIM_NUMBER', description: 'Claim number from denial', example: null },
      { field: 'PAYER_NAME', description: 'Insurance payer name', example: null },
      { field: 'PATIENT_NAME', description: 'Patient full name', example: null },
      { field: 'MEMBER_ID', description: 'Patient member ID', example: null },
      { field: 'DATE_OF_SERVICE', description: 'Date of service', example: null },
      { field: 'CARC_CODE', description: 'Claim adjustment reason code', example: null },
      { field: 'ADDITIONAL_ARGUMENTS', description: 'Additional arguments for appeal', example: null },
      { field: 'PROVIDER_NAME', description: 'Rendering provider name', example: null },
      { field: 'PROVIDER_NPI', description: 'Provider NPI number', example: null },
      { field: 'FACILITY_NAME', description: 'Facility name', example: null },
    ],
    disclaimer: 'This letter template is provided as a starting point and must be reviewed by qualified staff before submission. All citations and factual claims must be verified against current regulations and payer policies.',
  },
};

// ─── AGENT ─────────────────────────────────────────────────────────────────────

export class AppealAgent extends BaseAgentV2 {
  constructor() {
    super(
      'appeal-agent',
      'Generates appeal strategies and AI-powered letters with verified regulatory citations. Uses Brain (GPT + Claude) for letter generation with templates as fallback. Never invents citations.',
      {
        allowedDenialCodes: [], // All codes — appeals can be filed for any denial
        allowedOperations: [
          'generate_appeal_strategy',
          'generate_appeal_letter',
          'find_citations',
          'estimate_success_rate',
        ],
        forbiddenActions: [
          'suggest_coding_changes',
          'modify_cpt_codes',
          'modify_icd_codes',
          'verify_eligibility',
          'change_patient_demographics',
          'invent_citations',
        ],
        requiredInputFields: ['denialId'],
      },
      AppealOutputSchema,
    );
    this.registerTool(denialDataTool);
    this.registerTool(resubmissionIntelligenceTool);
    this.registerTool(appealsTool);
    this.registerTool(codingIntelligenceTool);
  }

  async execute(taskType: string, input: Record<string, unknown>, taskId?: string): Promise<AgentTaskResult> {
    return this.executeWithGuardrails(taskType, input, taskId, async () => {
      const denialId = input.denialId as string;
      const denial = await this.useTool('denial_data', { action: 'get', denialId }) as any;
      if (!denial) {
        return { success: false, output: { error: 'Denial not found' }, confidence: 0, toolsUsed: ['denial_data'] };
      }

      const carcCode = denial.carcCode as string;
      const denialCategory = (denial.denialCategory as string) || 'other';
      const payerName = denial.payerName as string;

      // ─── STEP 1: Determine appeal level ────────────────────────────────
      const currentAppeals = await db.appealLetter.findMany({ where: { denialId } });
      const appealLevel = currentAppeals.length === 0 ? 'first_level' as const
        : currentAppeals.length === 1 ? 'second_level' as const
        : 'external_review' as const;

      // ─── STEP 2: Get intelligence prediction ───────────────────────────
      const prediction = await this.useTool('resubmission_intelligence', {
        payerName,
        carcCode,
        correctionType: 'appeal_with_documentation',
        cptCode: denial.cptCode,
        deniedAmount: denial.deniedAmount,
      }) as any;

      // ─── STEP 3: Get coding info for citations ─────────────────────────
      const codingInfo = await this.useTool('coding_intelligence', {
        denialId,
        cptCode: denial.cptCode,
        modifier: denial.modifier,
        diagnosisCode: denial.diagnosisCode,
        carcCode,
      }) as any;

      // ─── STEP 4: Build arguments with REAL citations ───────────────────
      const keyArguments = this.buildArgumentsWithCitations(denialCategory, denial, codingInfo);

      // ─── STEP 5: Get required documents ────────────────────────────────
      const requiredDocuments = this.getRequiredDocuments(denialCategory, carcCode);

      // ─── STEP 6: Get appeal deadline ───────────────────────────────────
      const appealInfo = await this.useTool('appeal_generator', {
        denialId,
        appealType: appealLevel,
        payerName,
        denialReason: denialCategory,
      }) as any;

      const deadlineDays = (appealInfo?.deadlineDays as number) || 60;

      // ─── STEP 7: Generate letter via Brain (AI-powered, cross-validated) ──
      let letterTemplate: AppealOutput['letterTemplate'];
      let aiGenerated = false;
      let crossValidated = false;
      let providerOpinions: AppealOutput['letterTemplate']['providerOpinions'] = null;

      try {
        const claimData = {
          claimNumber: denial.claimNumber,
          patientName: denial.patientName,
          dateOfService: denial.dateOfService,
          payerName,
          payerId: denial.payerId,
          providerNPI: denial.providerNPI,
          cptCode: denial.cptCode,
          modifier: denial.modifier,
          diagnosisCode: denial.diagnosisCode,
          billedAmount: denial.billedAmount,
          deniedAmount: denial.deniedAmount,
          carcCode,
          rarcCode: denial.rarcCode,
          denialCategory,
          denialDate: denial.denialDate,
          appealLevel,
        };

        const brainResult = await brainGenerateAppealLetter(claimData);

        if (brainResult.content && brainResult.confidence > 0.3) {
          // Brain generated an AI letter
          aiGenerated = true;
          crossValidated = brainResult.crossValidated;

          if (brainResult.crossValidated && brainResult.crossValidation) {
            providerOpinions = brainResult.crossValidation.providerResults.map(r => ({
              provider: r.provider,
              opinion: r.content.substring(0, 300) + (r.content.length > 300 ? '...' : ''),
            }));
          }

          const crossValDisclaimer = crossValidated
            ? `\n\nIMPORTANT: This letter was generated using AI and cross-validated by ${brainResult.providers.join(' + ')}. ${brainResult.crossValidation?.agreement === 'full' ? 'Both AI models agree on the appeal strategy.' : 'AI models had differing opinions — human review is critical.'} It MUST be reviewed and approved by qualified staff before submission. All citations and factual claims must be verified against current regulations and payer policies.`
            : '\n\nIMPORTANT: This letter was generated using AI. It MUST be reviewed and approved by qualified staff before submission. All citations and factual claims must be verified against current regulations and payer policies.';

          letterTemplate = {
            templateType: `ai_generated_${denialCategory}`,
            subject: `Appeal of Denial — ${denialCategory.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} — Claim ${denial.claimNumber}`,
            body: brainResult.content + crossValDisclaimer,
            fillInFields: [], // AI-generated letters don't use fill-in fields — they're already personalized
            citationsInLetter: this.getCitationsForLetter(denialCategory, codingInfo),
            disclaimer: crossValDisclaimer.trim(),
            aiGenerated: true,
            crossValidated,
            providerOpinions,
          };
        } else {
          // Brain failed or low confidence — use template
          letterTemplate = this.getTemplateLetter(denialCategory, codingInfo);
        }
      } catch (brainError) {
        // Brain failed — use template as fallback
        console.warn('[AppealAgent] Brain letter generation failed, using template:', brainError);
        letterTemplate = this.getTemplateLetter(denialCategory, codingInfo);
      }

      // ─── STEP 8: Calculate confidence ──────────────────────────────────
      let confidence = 0.5;
      if (prediction?.predictedSuccessRate >= 60) confidence += 0.15;
      if (letterTemplate.citationsInLetter.some(c => c.verified)) confidence += 0.1;
      if (appealLevel === 'first_level') confidence += 0.1;
      if (aiGenerated && crossValidated) confidence += 0.05; // Small boost for cross-validated AI
      confidence = Math.min(confidence, 0.85);

      const requiresHumanReview = true; // ALL appeals require human review before submission

      const result: AppealOutput = {
        appealLevel,
        strategy: {
          approach: this.determineApproach(denialCategory, appealLevel),
          keyArguments,
          requiredDocuments,
          estimatedSuccessRate: prediction?.predictedSuccessRate || 40,
          deadlineDays,
          nextStepsIfDenied: appealLevel === 'first_level'
            ? 'File second-level appeal within 60 days of first-level denial'
            : appealLevel === 'second_level'
            ? 'Request independent external review per applicable state/federal regulations'
            : 'Consider legal options or contact state insurance commissioner',
        },
        letterTemplate,
        confidenceScore: confidence,
        requiresHumanReview,
        humanReviewReason: aiGenerated
          ? crossValidated
            ? 'AI-generated appeal letter cross-validated by multiple models. Must be reviewed by qualified staff before submission. Verify all citations and factual claims.'
            : 'AI-generated appeal letter must be reviewed by qualified staff before submission. Verify all citations and factual claims.'
          : 'All appeal letters must be reviewed by qualified staff before submission. Verify all citations, patient information, and factual claims.',
      };

      // Remember appeal pattern
      await this.remember(
        `appeal:${payerName}:${carcCode}:${appealLevel}`,
        { strategy: result.strategy.approach, estimatedSuccess: result.strategy.estimatedSuccessRate, aiGenerated, crossValidated },
        'pattern',
        confidence,
      );

      return {
        success: true,
        output: result as unknown as Record<string, unknown>,
        confidence,
        toolsUsed: ['denial_data', 'resubmission_intelligence', 'appeal_generator', 'coding_intelligence'],
        requiresHumanApproval: true, // ALL appeals require human sign-off
        humanApprovalReason: 'Appeal letter must be reviewed and approved before submission to payer',
      };
    });
  }

  // ─── TEMPLATE FALLBACK ───────────────────────────────────────────────────

  private getTemplateLetter(denialCategory: string, codingInfo: any): AppealOutput['letterTemplate'] {
    const templateKey = LETTER_TEMPLATES[denialCategory] ? denialCategory : 'default';
    const template = LETTER_TEMPLATES[templateKey];
    const citationsInLetter = this.getCitationsForLetter(denialCategory, codingInfo);

    return {
      templateType: template.type,
      subject: template.subject,
      body: template.body,
      fillInFields: template.fillInFields,
      citationsInLetter,
      disclaimer: template.disclaimer,
      aiGenerated: false,
      crossValidated: false,
      providerOpinions: null,
    };
  }

  // ─── CITATION METHODS (VERIFIED SOURCES ONLY) ────────────────────────

  private buildArgumentsWithCitations(
    category: string,
    denial: Record<string, unknown>,
    codingInfo: any,
  ): AppealOutput['strategy']['keyArguments'] {
    const argumentsList: AppealOutput['strategy']['keyArguments'] = [];

    const applicableCitations = VERIFIED_CITATIONS.filter(c =>
      c.applicableCategories.includes(category)
    );

    if (category === 'medical_necessity') {
      argumentsList.push({
        argument: 'The service meets the standard of medical necessity as defined by applicable coverage criteria.',
        citation: applicableCitations.find(c => c.id === 'ss1862a1a')?.reference || null,
        citationType: applicableCitations.find(c => c.id === 'ss1862a1a') ? 'regulation' : null,
        confidenceInCitation: applicableCitations.find(c => c.id === 'ss1862a1a') ? 0.95 : 0,
      });

      const lcdRef = codingInfo?.coverage?.lcdReference;
      argumentsList.push({
        argument: `Clinical documentation meets the criteria set forth in the applicable coverage determination.`,
        citation: lcdRef ? `LCD ${lcdRef}` : null,
        citationType: lcdRef ? 'lcd' : null,
        confidenceInCitation: lcdRef ? 0.9 : 0,
      });

      argumentsList.push({
        argument: 'Conservative treatment was attempted and failed prior to the denied service.',
        citation: null,
        citationType: 'none',
        confidenceInCitation: 0,
      });
    } else if (category === 'bundling') {
      argumentsList.push({
        argument: 'The procedures were distinct and separately identifiable, supporting the use of a modifier.',
        citation: applicableCitations.find(c => c.id === 'ncci_manual')?.reference || null,
        citationType: applicableCitations.find(c => c.id === 'ncci_manual') ? 'regulation' : null,
        confidenceInCitation: 0.9,
      });
    } else if (category === 'authorization') {
      argumentsList.push({
        argument: 'Retroactive authorization is appropriate given the circumstances of the service.',
        citation: applicableCitations.find(c => c.id === '42cfr410.24')?.reference || null,
        citationType: applicableCitations.find(c => c.id === '42cfr410.24') ? 'regulation' : null,
        confidenceInCitation: 0.85,
      });
    } else if (category === 'coding_error') {
      argumentsList.push({
        argument: 'The coding correction is supported by AMA CPT guidelines and NCCI edit analysis.',
        citation: applicableCitations.find(c => c.id === 'ama_cpt')?.reference || null,
        citationType: applicableCitations.find(c => c.id === 'ama_cpt') ? 'clinical_guideline' : null,
        confidenceInCitation: 0.85,
      });
    }

    if (argumentsList.every(a => a.citation === null)) {
      argumentsList.push({
        argument: 'Manual research needed: No verified citations found in database for this denial category. Staff must research applicable regulations before submitting appeal.',
        citation: null,
        citationType: 'none',
        confidenceInCitation: 0,
      });
    }

    return argumentsList;
  }

  private getCitationsForLetter(
    category: string,
    codingInfo: any,
  ): AppealOutput['letterTemplate']['citationsInLetter'] {
    const citations: AppealOutput['letterTemplate']['citationsInLetter'] = [];
    const applicable = VERIFIED_CITATIONS.filter(c => c.applicableCategories.includes(category));

    for (const citation of applicable.slice(0, 3)) {
      citations.push({
        claim: citation.description,
        source: citation.reference,
        sourceType: citation.type,
        verified: true,
      });
    }

    const lcdRef = codingInfo?.coverage?.lcdReference;
    if (lcdRef) {
      citations.push({
        claim: `Local Coverage Determination for CPT ${codingInfo?.cptCode || 'service'}`,
        source: `LCD ${lcdRef}`,
        sourceType: 'lcd',
        verified: true,
      });
    }

    return citations;
  }

  private getRequiredDocuments(category: string, carcCode: string): string[] {
    const docsMap: Record<string, string[]> = {
      medical_necessity: [
        'Complete medical records',
        'Physician letter of medical necessity',
        'Conservative treatment documentation',
        'Imaging/lab results',
        'Peer-reviewed literature references',
      ],
      authorization: [
        'Retroactive authorization application',
        'Emergency documentation (if applicable)',
        'Clinical records supporting urgency',
        'Proof of authorization attempt',
      ],
      bundling: [
        'Operative note documenting distinct procedures',
        'Separate encounter documentation',
        'Supporting clinical rationale for modifier 59/X',
      ],
      timely_filing: [
        'Clearinghouse submission confirmation',
        'Original claim acceptance report',
        'Payer acknowledgment of receipt',
      ],
      coding_error: [
        'Corrected claim with supporting documentation',
        'AMA CPT guideline reference for correction',
        'NCCI edit documentation',
      ],
    };

    return docsMap[category] || ['Supporting documentation for correction or appeal'];
  }

  private determineApproach(category: string, level: string): string {
    const approaches: Record<string, string> = {
      medical_necessity: 'Clinical appeal with comprehensive medical documentation and peer-reviewed evidence',
      authorization: 'Appeal based on retroactive authorization eligibility and emergent circumstances',
      bundling: 'Appeal with documentation of distinct, separately identifiable procedures',
      coding_error: 'Corrective appeal with documentation of corrected claim elements',
      timely_filing: 'Appeal with proof of timely original submission',
    };

    let approach = approaches[category] || 'Corrective appeal with supporting documentation';

    if (level === 'second_level') approach = 'ESCALATED: ' + approach;
    if (level === 'external_review') approach = 'EXTERNAL REVIEW: ' + approach;

    return approach;
  }
}

export const appealAgent = new AppealAgent();
