import { AppealLetter, Denial } from './types';
import { callAzureOpenAI } from './azure-openai';

// In-memory appeal store
let appeals: AppealLetter[] = [];

export const APPEAL_LETTER_PROMPT = `You are an expert healthcare appeals writer specializing in medical claim denials. Generate a professional appeal letter for the denied claim. The letter should:

1. Be addressed properly to the payer
2. Reference the specific claim and denial reason (CARC/RARC codes)
3. Clearly state why the denial should be overturned
4. Cite relevant medical policies, LCD/NCD references, CPT guidelines
5. Include supporting clinical rationale
6. Request specific action (full payment, reconsideration, peer-to-peer review)
7. Be professionally formatted in markdown

Return ONLY the appeal letter content in markdown format. Do not wrap in JSON.`;

export async function generateAppealLetter(denial: Denial): Promise<string> {
  const claimContext = `
Claim Number: ${denial.claimNumber}
Patient: ${denial.patientName}
Date of Service: ${denial.dateOfService}
Payer: ${denial.payerName} (ID: ${denial.payerId})
Provider NPI: ${denial.providerNPI}
CPT Code: ${denial.cptCode}${denial.modifier ? ` (Modifier: ${denial.modifier})` : ''}
Diagnosis: ${denial.diagnosisCode}
Billed Amount: $${denial.billedAmount.toFixed(2)}
Denied Amount: $${denial.deniedAmount.toFixed(2)}
CARC Code: ${denial.carcCode}
RARC Code: ${denial.rarcCode || 'N/A'}
Denial Category: ${denial.denialCategory}
Denial Date: ${denial.denialDate}
${denial.analysis ? `
AI Analysis Summary: ${denial.analysis.denialSummary}
Root Cause: ${denial.analysis.rootCauseDetail}
Recommended Action: ${denial.analysis.recommendedNextAction}
` : ''}`;

  try {
    const letterContent = await callAzureOpenAI(APPEAL_LETTER_PROMPT, claimContext);
    return letterContent;
  } catch (error) {
    // Fallback template if AI fails
    return generateFallbackAppealLetter(denial);
  }
}

function generateFallbackAppealLetter(denial: Denial): string {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const denialReasonMap: Record<string, string> = {
    'CO-16': 'missing or incomplete information',
    'CO-18': 'duplicate claim determination',
    'CO-22': 'bundling/CCI edit application',
    'CO-27': 'medical necessity determination',
    'CO-29': 'timely filing',
    'CO-50': 'prior authorization requirements',
    'CO-197': 'prior authorization/precertification',
    'PR-1': 'patient responsibility/deductible',
    'CO-4': 'coding/modifier inconsistency',
    'CO-11': 'diagnosis not supporting level of service',
    'CO-15': 'missing required documentation',
    'CO-109': 'patient eligibility',
  };

  const reason = denialReasonMap[denial.carcCode] || `denial code ${denial.carcCode}`;

  return `# Appeal Letter - Claim ${denial.claimNumber}

**Date:** ${today}

**To:**  
${denial.payerName}  
Claims Appeals Department  

**Re:** Appeal of Denied Claim  
**Claim Number:** ${denial.claimNumber}  
**Patient:** ${denial.patientName}  
**Date of Service:** ${denial.dateOfService}  
**CPT Code:** ${denial.cptCode}${denial.modifier ? ` (Modifier: ${denial.modifier})` : ''}  
**Denied Amount:** $${denial.deniedAmount.toFixed(2)}  
**CARC Code:** ${denial.carcCode}  

---

Dear Claims Review Department,

I am writing to formally appeal the denial of the above-referenced claim. The claim was denied citing ${reason} (CARC ${denial.carcCode}${denial.rarcCode ? `, RARC ${denial.rarcCode}` : ''}).

## Basis for Appeal

After careful review, we believe this denial should be overturned for the following reasons:

1. **Clinical Justification:** The services rendered on ${denial.dateOfService} were medically necessary based on the patient's presenting condition (${denial.diagnosisCode}).

2. **Documentation Support:** Complete medical documentation supports the medical necessity and appropriateness of the billed service (CPT ${denial.cptCode}).

3. **Coding Accuracy:** The procedure code and diagnosis code are correctly linked and supported by the medical record.

## Requested Action

We respectfully request that ${denial.payerName}:

- Overturn the denial and process the claim for payment at the contracted rate
- If additional documentation is needed, please specify exact requirements
- If a peer-to-peer review is available, we request that option

## Supporting Documentation

The following documents are enclosed to support this appeal:

- [ ] Complete medical records for date of service ${denial.dateOfService}
- [ ] Operative notes (if applicable)
- [ ] Prior authorization reference (if applicable)
- [ ] Supporting clinical guidelines/LCD references

---

Please process this appeal within the timeframe specified in our provider agreement. If you have any questions, please contact our office.

Sincerely,

**Provider Office**  
NPI: ${denial.providerNPI}  
`;
}

// CRUD Operations
export function createAppeal(appeal: Omit<AppealLetter, 'id' | 'createdAt' | 'updatedAt'>): AppealLetter {
  const newAppeal: AppealLetter = {
    ...appeal,
    id: `APL-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  appeals.push(newAppeal);
  return newAppeal;
}

export function getAppealsForDenial(denialId: string): AppealLetter[] {
  return appeals
    .filter((a) => a.denialId === denialId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getAllAppeals(filters?: {
  status?: string;
  appealType?: string;
}): AppealLetter[] {
  let filtered = [...appeals];
  if (filters?.status) filtered = filtered.filter((a) => a.status === filters.status);
  if (filters?.appealType) filtered = filtered.filter((a) => a.appealType === filters.appealType);
  return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function updateAppeal(id: string, updates: Partial<AppealLetter>): AppealLetter | null {
  const index = appeals.findIndex((a) => a.id === id);
  if (index === -1) return null;
  appeals[index] = { ...appeals[index], ...updates, updatedAt: new Date().toISOString() };
  return appeals[index];
}

export function deleteAppeal(id: string): boolean {
  const index = appeals.findIndex((a) => a.id === id);
  if (index === -1) return false;
  appeals.splice(index, 1);
  return true;
}
