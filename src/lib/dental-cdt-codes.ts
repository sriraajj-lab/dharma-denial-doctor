/**
 * Dental CDT Code Intelligence
 * Provides specialized denial management for dental claims using:
 * - CDT (Current Dental Terminology) code validation
 * - Dental-specific denial patterns and fixes
 * - Frequency limitation checking
 * - Missing tooth clause validation
 * - Pre-treatment authorization tracking
 * - CDT-to-CPT cross-coding for medical-dental claims
 */

import { Denial, CDTCodeInfo, CDTCategory, CDT_CATEGORIES } from './types';

// ─── COMMON CDT CODES WITH DENIAL INTELLIGENCE ───────────────────────────────

const CDT_CODE_DATABASE: CDTCodeInfo[] = [
  // Diagnostic
  { code: 'D0150', description: 'Comprehensive oral evaluation', category: 'diagnostic', typicalCost: { min: 75, max: 200 }, commonDenialReasons: ['Frequency limitation (once per 3 years)', 'Not medically necessary', 'Duplicate claim'], requiredDocumentation: ['Clinical notes', 'Periodontal charting if applicable'] },
  { code: 'D0210', description: 'Intraoral complete series of radiographic images', category: 'diagnostic', typicalCost: { min: 100, max: 250 }, commonDenialReasons: ['Frequency limitation (once per 5 years)', 'Not medically necessary', 'FMX taken within 3 years'], requiredDocumentation: ['Previous radiograph date', 'Clinical justification'] },
  { code: 'D0274', description: 'Bitewings - four radiographs', category: 'diagnostic', typicalCost: { min: 40, max: 100 }, commonDenialReasons: ['Frequency limitation (once per 12 months)', 'Not medically necessary'], requiredDocumentation: ['Date of previous bitewings', 'Clinical findings'] },
  { code: 'D0330', description: 'Panoramic radiograph', category: 'diagnostic', typicalCost: { min: 75, max: 150 }, commonDenialReasons: ['Frequency limitation', 'Not medically necessary', 'Pano + FMX same date'], requiredDocumentation: ['Clinical justification', 'Previous radiograph dates'] },

  // Preventive
  { code: 'D1110', description: 'Prophylaxis - adult', category: 'preventive', typicalCost: { min: 75, max: 200 }, commonDenialReasons: ['Frequency limitation (2x per 12 months)', 'Coordination of benefits', 'Submitted as periodontal maintenance instead'], requiredDocumentation: ['Date of last cleaning', 'Periodontal status'] },
  { code: 'D1120', description: 'Prophylaxis - child', category: 'preventive', typicalCost: { min: 55, max: 150 }, commonDenialReasons: ['Frequency limitation', 'Age limitation'], requiredDocumentation: ['Age verification', 'Date of last cleaning'] },
  { code: 'D1206', description: 'Topical application of fluoride varnish', category: 'preventive', typicalCost: { min: 25, max: 65 }, commonDenialReasons: ['Age limitation (under 14 typical)', 'Frequency limitation', 'Not covered for adults'], requiredDocumentation: ['Patient age', 'Caries risk assessment'] },
  { code: 'D1351', description: 'Sealant - per tooth', category: 'preventive', typicalCost: { min: 30, max: 75 }, commonDenialReasons: ['Age limitation (under 16 typical)', 'Tooth not eligible (molars only)', 'Frequency limitation'], requiredDocumentation: ['Patient age', 'Tooth number', 'Clinical evidence of unfilled fissure'] },

  // Restorative
  { code: 'D2140', description: 'Amalgam - one surface, primary or permanent', category: 'restorative', typicalCost: { min: 100, max: 200 }, commonDenialReasons: ['Missing tooth clause', 'Downcode to composite', 'Replacement within 2 years'], requiredDocumentation: ['Tooth number and surfaces', 'Date of prior restoration if replacement', 'Clinical notes'] },
  { code: 'D2150', description: 'Amalgam - two surfaces', category: 'restorative', typicalCost: { min: 130, max: 250 }, commonDenialReasons: ['Same as D2140'], requiredDocumentation: ['Tooth number and surfaces', 'Clinical notes'] },
  { code: 'D2330', description: 'Resin-based composite - one surface, anterior', category: 'restorative', typicalCost: { min: 120, max: 250 }, commonDenialReasons: ['Downcode to amalgam', 'Missing tooth clause', 'Veneer exclusion'], requiredDocumentation: ['Tooth number and surfaces', 'Material justification', 'Clinical notes'] },
  { code: 'D2391', description: 'Resin-based composite - one surface, posterior', category: 'restorative', typicalCost: { min: 130, max: 275 }, commonDenialReasons: ['Downcode to amalgam (plan limitation)', 'Frequency limitation', 'Missing tooth clause'], requiredDocumentation: ['Tooth number and surfaces', 'Material justification if posterior composite', 'Clinical notes'] },
  { code: 'D2392', description: 'Resin-based composite - two surfaces, posterior', category: 'restorative', typicalCost: { min: 160, max: 300 }, commonDenialReasons: ['Downcode to amalgam', 'Frequency limitation'], requiredDocumentation: ['Tooth number and surfaces', 'Clinical justification for composite'] },
  { code: 'D2393', description: 'Resin-based composite - three surfaces, posterior', category: 'restorative', typicalCost: { min: 190, max: 350 }, commonDenialReasons: ['Downcode to amalgam', 'May need crown instead'], requiredDocumentation: ['Tooth number and surfaces', 'Why crown is not indicated'] },
  { code: 'D2394', description: 'Resin-based composite - four or more surfaces, posterior', category: 'restorative', typicalCost: { min: 220, max: 400 }, commonDenialReasons: ['Downcode to amalgam', 'Should be crown per plan'], requiredDocumentation: ['Tooth number and surfaces', 'Why crown is not indicated', 'Clinical notes'] },

  // Endodontics
  { code: 'D3310', description: 'Endodontic therapy, anterior tooth', category: 'endodontics', typicalCost: { min: 500, max: 900 }, commonDenialReasons: ['Missing tooth clause', 'Pre-existing condition', 'Alternative treatment (extraction)', 'No prior authorization'], requiredDocumentation: ['Diagnostic radiograph', 'Pulp vitality test results', 'Clinical symptoms', 'Prior authorization if required'] },
  { code: 'D3320', description: 'Endodontic therapy, premolar tooth', category: 'endodontics', typicalCost: { min: 600, max: 1000 }, commonDenialReasons: ['Same as D3310'], requiredDocumentation: ['Same as D3310'] },
  { code: 'D3330', description: 'Endodontic therapy, molar', category: 'endodontics', typicalCost: { min: 800, max: 1400 }, commonDenialReasons: ['Same as D3310', 'Higher scrutiny for molar RCT'], requiredDocumentation: ['Same as D3310', 'Additional documentation of tooth restorability'] },

  // Periodontics
  { code: 'D4341', description: 'Periodontal scaling and root planing - four or more teeth per quadrant', category: 'periodontics', typicalCost: { min: 200, max: 400 }, commonDenialReasons: ['Frequency limitation (once per 24 months)', 'Not medically necessary', 'Probing depths insufficient', 'Should be prophylaxis'], requiredDocumentation: ['Full periodontal charting (6 points per tooth)', 'Radiographic evidence', 'Bleeding on probing documentation', 'Diagnosis of periodontitis'] },
  { code: 'D4342', description: 'Periodontal scaling and root planing - one to three teeth per quadrant', category: 'periodontics', typicalCost: { min: 100, max: 250 }, commonDenialReasons: ['Same as D4341', 'Number of teeth treated'], requiredDocumentation: ['Same as D4341'] },
  { code: 'D4910', description: 'Periodontal maintenance', category: 'periodontics', typicalCost: { min: 120, max: 250 }, commonDenialReasons: ['Frequency limitation', 'Should be prophylaxis (D1110)', 'No history of SRP'], requiredDocumentation: ['History of SRP treatment', 'Periodontal status', 'Frequency documentation'] },

  // Prosthodontics
  { code: 'D5110', description: 'Complete denture - maxillary', category: 'prosthodontics', typicalCost: { min: 1000, max: 2500 }, commonDenialReasons: ['Missing tooth clause', 'Replacement within 5-7 years', 'Prior authorization required', 'Alternative treatment available'], requiredDocumentation: ['Prior authorization', 'Date of prior denture', 'Radiograph showing edentulous ridge', 'Clinical notes'] },
  { code: 'D5120', description: 'Complete denture - mandibular', category: 'prosthodontics', typicalCost: { min: 1000, max: 2500 }, commonDenialReasons: ['Same as D5110'], requiredDocumentation: ['Same as D5110'] },
  { code: 'D5211', description: 'Removable partial denture - maxillary, resin base', category: 'prosthodontics', typicalCost: { min: 800, max: 2000 }, commonDenialReasons: ['Missing tooth clause', 'Prior authorization required', 'Replacement limitation'], requiredDocumentation: ['Prior authorization', 'Missing teeth documentation', 'Radiographs'] },
  { code: 'D6010', description: 'Implant abutment - connected to implant', category: 'prosthodontics', typicalCost: { min: 300, max: 800 }, commonDenialReasons: ['Not a covered benefit', 'Missing tooth clause', 'Prior authorization required', 'Medical vs dental determination'], requiredDocumentation: ['Prior authorization', 'Implant placement date', 'Radiograph showing implant integration', 'Medical necessity documentation'] },
  { code: 'D6240', description: 'Porcelain with high noble metal - pontic', category: 'prosthodontics', typicalCost: { min: 800, max: 1500 }, commonDenialReasons: ['Missing tooth clause', 'Downcode to base metal', 'Prior authorization required', 'Replacement limitation'], requiredDocumentation: ['Prior authorization', 'Missing tooth clause status', 'Tooth number', 'Material justification'] },
  { code: 'D6750', description: 'Porcelain fused to high noble metal - crown', category: 'prosthodontics', typicalCost: { min: 800, max: 1500 }, commonDenialReasons: ['Missing tooth clause', 'Downcode to base metal', 'Replacement within 5 years', 'Prior authorization'], requiredDocumentation: ['Prior authorization', 'Date of prior crown', 'Radiograph showing crown need', 'Material justification'] },

  // Oral Surgery
  { code: 'D7111', description: 'Extraction, coronal remnants of primary tooth', category: 'oral_surgery', typicalCost: { min: 75, max: 150 }, commonDenialReasons: ['Age limitation', 'Tooth type'], requiredDocumentation: ['Patient age', 'Clinical notes'] },
  { code: 'D7140', description: 'Extraction, erupted tooth or exposed root', category: 'oral_surgery', typicalCost: { min: 100, max: 300 }, commonDenialReasons: ['Alternative treatment available (RCT)', 'Missing tooth clause', 'Not medically necessary'], requiredDocumentation: ['Clinical justification', 'Radiograph', 'Why RCT not feasible'] },
  { code: 'D7210', description: 'Extraction, erupted tooth requiring removal of bone and/or sectioning', category: 'oral_surgery', typicalCost: { min: 200, max: 450 }, commonDenialReasons: ['Downcode to D7140', 'Not medically necessary'], requiredDocumentation: ['Surgical notes', 'Radiograph showing bone involvement', 'Clinical justification'] },
  { code: 'D7240', description: 'Removal of impacted tooth - completely bony', category: 'oral_surgery', typicalCost: { min: 300, max: 600 }, commonDenialReasons: ['Downcode to D7230 or D7220', 'Not medically necessary', 'Asymptomatic third molar'], requiredDocumentation: ['Radiograph showing impaction type', 'Clinical symptoms', 'Nerve risk documentation'] },
  { code: 'D7250', description: 'Surgical removal of residual tooth roots', category: 'oral_surgery', typicalCost: { min: 150, max: 350 }, commonDenialReasons: ['Downcode to D7140', 'Not medically necessary'], requiredDocumentation: ['Radiograph showing root fragments', 'Clinical justification for removal'] },

  // Orthodontics
  { code: 'D8010', description: 'Limited orthodontic treatment of the primary dentition', category: 'orthodontics', typicalCost: { min: 1500, max: 3000 }, commonDenialReasons: ['Age limitation', 'Not a covered benefit', 'Lifetime maximum exceeded'], requiredDocumentation: ['Cephalometric radiograph', 'Treatment plan', 'Age documentation'] },
  { code: 'D8020', description: 'Limited orthodontic treatment of the transitional dentition', category: 'orthodontics', typicalCost: { min: 1500, max: 3500 }, commonDenialReasons: ['Same as D8010'], requiredDocumentation: ['Same as D8010'] },
  { code: 'D8080', description: 'Comprehensive orthodontic treatment, transitional dentition', category: 'orthodontics', typicalCost: { min: 3000, max: 7000 }, commonDenialReasons: ['Not a covered benefit', 'Lifetime orthodontic maximum', 'Cosmetic exclusion', 'Age limitation'], requiredDocumentation: ['Full records', 'Cephalometric analysis', 'Treatment plan with estimated duration', 'Insurance verification'] },
  { code: 'D8090', description: 'Comprehensive orthodontic treatment, adult dentition', category: 'orthodontics', typicalCost: { min: 4000, max: 8000 }, commonDenialReasons: ['Same as D8080', 'Higher scrutiny for adult ortho'], requiredDocumentation: ['Same as D8080', 'Additional medical necessity documentation'] },

  // Adjunctive
  { code: 'D9110', description: 'Palliative (emergency) treatment of dental pain', category: 'adjunctive', typicalCost: { min: 40, max: 100 }, commonDenialReasons: ['Not separately payable with exam', 'Bundled with other procedures'], requiredDocumentation: ['Clinical notes documenting pain', 'Treatment provided'] },
  { code: 'D9220', description: 'Deep sedation/general anesthesia - first 30 minutes', category: 'adjunctive', typicalCost: { min: 250, max: 500 }, commonDenialReasons: ['Not medically necessary', 'Should be moderate sedation', 'Bundled with procedure'], requiredDocumentation: ['Medical necessity for deep sedation', 'ASA classification', 'Duration documentation'] },
  { code: 'D9230', description: 'Intravenous moderate (conscious) sedation analgesia - first 30 minutes', category: 'adjunctive', typicalCost: { min: 150, max: 350 }, commonDenialReasons: ['Bundled with procedure', 'Not medically necessary'], requiredDocumentation: ['Medical necessity', 'Duration documentation', 'Monitoring records'] },
  { code: 'D9610', description: 'Intravenous/injection of drugs or medicaments', category: 'adjunctive', typicalCost: { min: 25, max: 75 }, commonDenialReasons: ['Bundled with procedure', 'Not separately payable'], requiredDocumentation: ['Drug administered', 'Clinical indication'] },
  { code: 'D9944', description: 'Occlusal guard - fixed', category: 'adjunctive', typicalCost: { min: 300, max: 700 }, commonDenialReasons: ['Not a covered benefit', 'Cosmetic exclusion', 'Prior authorization required'], requiredDocumentation: ['Bruxism diagnosis', 'Clinical evidence of wear', 'Prior authorization'] },
];

// ─── CDT-TO-CPT CROSS-CODING (Medical-Dental) ───────────────────────────────

interface CDTtoCPTCrosscode {
  cdtCode: string;
  cptCode: string;
  description: string;
  when: string; // When to use CPT instead of CDT
  diagnosis: string[];
}

const CDT_CPT_CROSSCODES: CDTtoCPTCrosscode[] = [
  { cdtCode: 'D7240', cptCode: '41899', description: 'Impacted tooth removal', when: 'When submitting to medical insurance for impaction causing pain/infection', diagnosis: ['K04.7', 'K01.1', 'M27.3'] },
  { cdtCode: 'D7250', cptCode: '41899', description: 'Residual root removal', when: 'Medical necessity due to infection risk', diagnosis: ['K04.7', 'K04.8', 'M27.3'] },
  { cdtCode: 'D9220', cptCode: '00170', description: 'Deep sedation for dental procedures', when: 'Submitting anesthesia to medical insurance', diagnosis: ['F41.9', 'Z91.8', 'Any supported dental ICD'] },
  { cdtCode: 'D9230', cptCode: '00170', description: 'IV moderate sedation for dental procedures', when: 'Submitting to medical insurance', diagnosis: ['F41.9', 'Z91.8'] },
  { cdtCode: 'D0330', cptCode: '70330', description: 'Panoramic radiograph', when: 'Submitting to medical insurance for TMJ, pathology, or trauma evaluation', diagnosis: ['M26.63', 'K09.8', 'S02.5'] },
  { cdtCode: 'D0210', cptCode: '70355', description: 'FMX radiographic survey', when: 'Medical insurance for pathology evaluation', diagnosis: ['K09.8', 'K06.8', 'M27.2'] },
  { cdtCode: 'D7140', cptCode: '41899', description: 'Tooth extraction', when: 'Medical insurance for trauma or systemic condition', diagnosis: ['K04.7', 'M27.3', 'S02.5'] },
  { cdtCode: 'D3310', cptCode: '41899', description: 'Root canal therapy', when: 'Medical insurance for infection management', diagnosis: ['K04.5', 'K04.6', 'K04.7'] },
  { cdtCode: 'D9944', cptCode: '21089', description: 'Occlusal guard', when: 'Medical insurance for TMJ dysfunction/bruxism', diagnosis: ['M26.63', 'G47.63', 'M26.60'] },
];

// ─── DENTAL-SPECIFIC FREQUENCY LIMITATIONS ───────────────────────────────────

interface FrequencyLimit {
  cdtCode: string;
  description: string;
  maxPerPeriod: number;
  periodMonths: number;
  notes: string;
}

const FREQUENCY_LIMITS: FrequencyLimit[] = [
  { cdtCode: 'D0150', description: 'Comprehensive oral eval', maxPerPeriod: 1, periodMonths: 36, notes: 'Once per 3 years per provider' },
  { cdtCode: 'D0210', description: 'Full mouth x-ray series', maxPerPeriod: 1, periodMonths: 60, notes: 'Once per 5 years' },
  { cdtCode: 'D0274', description: 'Bitewings (4 films)', maxPerPeriod: 1, periodMonths: 12, notes: 'Once per 12 months' },
  { cdtCode: 'D0330', description: 'Panoramic radiograph', maxPerPeriod: 1, periodMonths: 36, notes: 'Once per 3 years, not with FMX same date' },
  { cdtCode: 'D1110', description: 'Adult prophylaxis', maxPerPeriod: 2, periodMonths: 12, notes: '2x per 12 months' },
  { cdtCode: 'D1120', description: 'Child prophylaxis', maxPerPeriod: 2, periodMonths: 12, notes: '2x per 12 months' },
  { cdtCode: 'D1206', description: 'Fluoride varnish', maxPerPeriod: 2, periodMonths: 12, notes: 'Usually limited to children under 14-19' },
  { cdtCode: 'D1351', description: 'Sealant', maxPerPeriod: 1, periodMonths: 36, notes: 'Per tooth, permanent molars only, age limits apply' },
  { cdtCode: 'D4341', description: 'SRP 4+ teeth per quad', maxPerPeriod: 1, periodMonths: 24, notes: 'Once per 24 months per quadrant' },
  { cdtCode: 'D4910', description: 'Periodontal maintenance', maxPerPeriod: 4, periodMonths: 12, notes: '2-4x per year depending on plan' },
  { cdtCode: 'D6750', description: 'PFM crown', maxPerPeriod: 1, periodMonths: 60, notes: 'Once per 5 years per tooth' },
  { cdtCode: 'D5110', description: 'Complete denture max', maxPerPeriod: 1, periodMonths: 84, notes: 'Once per 7 years typically' },
  { cdtCode: 'D8080', description: 'Comprehensive ortho', maxPerPeriod: 1, periodMonths: 999, notes: 'Lifetime maximum typically $1,500-$2,500' },
];

// ─── MISSING TOOTH CLAUSE CHECK ──────────────────────────────────────────────

interface MissingToothClause {
  applicableCodes: string[];
  description: string;
  howToCheck: string;
  appealStrategy: string;
}

const MISSING_TOOTH_CLAUSE: MissingToothClause = {
  applicableCodes: ['D5110', 'D5120', 'D5211', 'D5212', 'D5221', 'D5222', 'D6010', 'D6240', 'D6241', 'D6242', 'D6750', 'D6751', 'D6752', 'D2750', 'D2751', 'D2752', 'D2780', 'D2781', 'D2782', 'D2790', 'D2791', 'D2792', 'D2793', 'D2794'],
  description: 'Missing tooth clause excludes coverage for any tooth that was missing before the patient\'s insurance effective date. This applies to crowns, bridges, implants, and dentures replacing that tooth.',
  howToCheck: '1. Request the patient\'s enrollment date from the payer\n2. Check for prior radiographs showing the tooth was present\n3. Obtain a statement from the referring dentist about tooth extraction date\n4. If tooth was present at enrollment, the clause does not apply',
  appealStrategy: '1. Provide evidence the tooth was present at enrollment\n2. Submit radiographs showing the tooth before extraction\n3. Include extraction date and reason (if extracted due to disease, not congenitally missing)\n4. If tooth was extracted while covered under this plan, the clause does not apply\n5. Submit a narrative explaining the clinical circumstances',
};

// ─── MAIN EXPORTED FUNCTIONS ─────────────────────────────────────────────────

export interface DentalDenialAnalysis {
  cdtCode: string;
  cdtDescription: string;
  category: CDTCategory;
  denialReason: string;
  frequencyCheck: FrequencyLimit | null;
  isFrequencyIssue: boolean;
  missingToothClauseApplies: boolean;
  crossCodingOption: CDTtoCPTCrosscode | null;
  commonFixes: string[];
  appealStrategy: string[];
  estimatedSuccessRate: number;
}

/**
 * Analyze a dental denial and provide specialized intelligence
 */
export function analyzeDentalDenial(denial: Denial): DentalDenialAnalysis {
  const cdtCode = denial.cdtCode || denial.cptCode;
  const cdtInfo = CDT_CODE_DATABASE.find(c => c.code === cdtCode);
  const freqLimit = FREQUENCY_LIMITS.find(f => f.cdtCode === cdtCode);
  const crossCode = CDT_CPT_CROSSCODES.find(c => c.cdtCode === cdtCode);
  const missingToothApplies = MISSING_TOOTH_CLAUSE.applicableCodes.includes(cdtCode);

  // Determine denial reason patterns
  const denialReason = identifyDentalDenialReason(denial);
  const isFrequencyIssue = isFrequencyRelatedDenial(denial, cdtCode);

  // Generate fixes
  const commonFixes = generateDentalFixes(denial, cdtCode, isFrequencyIssue, missingToothApplies, crossCode);
  const appealStrategy = generateDentalAppealStrategy(denial, cdtCode, isFrequencyIssue, missingToothApplies);

  // Estimate success rate
  let estimatedSuccessRate = 50;
  if (isFrequencyIssue && freqLimit) estimatedSuccessRate = 35;
  if (missingToothApplies) estimatedSuccessRate = 25;
  if (crossCode) estimatedSuccessRate = Math.min(estimatedSuccessRate + 20, 85);
  if (denial.carcCode === 'CO-16') estimatedSuccessRate = 90;
  if (denial.carcCode === 'CO-4') estimatedSuccessRate = 85;

  return {
    cdtCode,
    cdtDescription: cdtInfo?.description || 'Unknown CDT code',
    category: cdtInfo?.category || 'diagnostic',
    denialReason,
    frequencyCheck: freqLimit,
    isFrequencyIssue,
    missingToothClauseApplies: missingToothApplies,
    crossCodingOption: crossCode || null,
    commonFixes,
    appealStrategy,
    estimatedSuccessRate,
  };
}

/**
 * Get CDT code information
 */
export function getCDTCodeInfo(code: string): CDTCodeInfo | undefined {
  return CDT_CODE_DATABASE.find(c => c.code === code);
}

/**
 * Get frequency limit for a CDT code
 */
export function getFrequencyLimit(code: string): FrequencyLimit | undefined {
  return FREQUENCY_LIMITS.find(f => f.cdtCode === code);
}

/**
 * Check if a CDT code can be cross-coded to CPT for medical insurance
 */
export function getCrossCodingOption(cdtCode: string): CDTtoCPTCrosscode | undefined {
  return CDT_CPT_CROSSCODES.find(c => c.cdtCode === cdtCode);
}

/**
 * Get all CDT codes in a category
 */
export function getCDTCodesByCategory(category: CDTCategory): CDTCodeInfo[] {
  return CDT_CODE_DATABASE.filter(c => c.category === category);
}

/**
 * Validate a CDT code format
 */
export function isValidCDTCode(code: string): boolean {
  return /^D\d{4}$/.test(code);
}

/**
 * Get the category for a CDT code based on its number range
 */
export function getCDTCategoryByCode(code: string): CDTCategory | null {
  const num = parseInt(code.substring(1));
  if (num >= 100 && num <= 1999) return 'diagnostic';
  if (num >= 1000 && num <= 1999) return 'preventive';
  if (num >= 2000 && num <= 2999) return 'restorative';
  if (num >= 3000 && num <= 3999) return 'endodontics';
  if (num >= 4000 && num <= 4999) return 'periodontics';
  if (num >= 5000 && num <= 6999) return 'prosthodontics';
  if (num >= 7000 && num <= 7999) return 'oral_surgery';
  if (num >= 8000 && num <= 8999) return 'orthodontics';
  if (num >= 9000 && num <= 9999) return 'adjunctive';
  return null;
}

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

function identifyDentalDenialReason(denial: Denial): string {
  const carcCode = denial.carcCode;
  const rarcCode = denial.rarcCode;

  const dentalDenialMap: Record<string, string> = {
    'CO-4': 'Missing or invalid modifier/procedure code issue',
    'CO-11': 'Diagnosis does not support the level of service billed',
    'CO-16': 'Missing information or documentation',
    'CO-22': 'Procedure bundled with another service (coordination of benefits possible)',
    'CO-23': 'Impact of prior payer adjudication',
    'CO-27': 'Expense incurred after coverage terminated',
    'CO-29': 'Timely filing limit has expired',
    'CO-50': 'Prior authorization was required but not obtained',
    'CO-96': 'Non-covered charge - plan limitation',
    'CO-97': 'Payment adjusted because this benefit is included in another service',
    'CO-197': 'Prior authorization or precertification was not obtained',
    'PR-1': 'Deductible amount',
    'PR-2': 'Coinsurance amount',
    'PR-96': 'Patient responsibility - non-covered service',
    'PR-204': 'Service not payable per patient plan',
    'OA-23': 'Impact of prior payer adjudication (includes PR and CO amounts)',
  };

  return dentalDenialMap[carcCode] || `Denial reason: ${carcCode}${rarcCode ? ` / ${rarcCode}` : ''}`;
}

function isFrequencyRelatedDenial(denial: Denial, cdtCode: string): boolean {
  const freqLimit = FREQUENCY_LIMITS.find(f => f.cdtCode === cdtCode);
  if (!freqLimit) return false;

  const frequencyRarcs = ['N20', 'N115', 'N130', 'N190', 'N211', 'N220', 'N230', 'N365', 'N386', 'N432'];
  const frequencyCarcs = ['CO-96', 'CO-97', 'PR-96'];

  return (
    frequencyCarcs.includes(denial.carcCode) ||
    (denial.rarcCode && frequencyRarcs.some(r => denial.rarcCode?.includes(r))) ||
    denial.denialCategory.toLowerCase().includes('frequency') ||
    denial.denialCategory.toLowerCase().includes('limitation')
  );
}

function generateDentalFixes(
  denial: Denial,
  cdtCode: string,
  isFrequencyIssue: boolean,
  missingToothApplies: boolean,
  crossCode: CDTtoCPTCrosscode | null
): string[] {
  const fixes: string[] = [];
  const cdtInfo = CDT_CODE_DATABASE.find(c => c.code === cdtCode);

  // Frequency-related fixes
  if (isFrequencyIssue) {
    fixes.push('Verify date of last service - frequency may have reset');
    fixes.push('Check if this is a different tooth/site than the prior service');
    fixes.push('Submit clinical justification for early repeat (e.g., new symptoms, emergency)');
    fixes.push('Request exception based on clinical necessity');
  }

  // Missing tooth clause fixes
  if (missingToothApplies) {
    fixes.push('Provide evidence tooth was present at insurance enrollment date');
    fixes.push('Submit prior radiographs showing the tooth before extraction');
    fixes.push('Include extraction date and clinical reason for extraction');
    fixes.push('Submit narrative explaining tooth was extracted while covered under this plan');
  }

  // Code-specific fixes from database
  if (cdtInfo) {
    for (const reason of cdtInfo.commonDenialReasons) {
      if (reason.toLowerCase().includes('downcode')) {
        fixes.push('Appeal the downcode with clinical documentation supporting the higher-level service');
      }
      if (reason.toLowerCase().includes('prior authorization') || reason.toLowerCase().includes('pre-auth')) {
        fixes.push('Obtain retrospective authorization if payer allows');
        fixes.push('Verify authorization was for the correct codes and dates');
      }
      if (reason.toLowerCase().includes('bundled')) {
        fixes.push('Unbundle if services were performed in separate visits or are truly distinct');
      }
    }

    // Add documentation requirements
    for (const doc of cdtInfo.requiredDocumentation) {
      fixes.push(`Ensure documentation includes: ${doc}`);
    }
  }

  // Cross-coding option
  if (crossCode) {
    fixes.push(`Consider cross-coding to CPT ${crossCode.cptCode} and billing medical insurance`);
    fixes.push(`Use diagnosis codes: ${crossCode.diagnosis.join(', ')} for medical billing`);
  }

  // CARC-specific fixes
  if (denial.carcCode === 'CO-16') {
    fixes.push('Identify and provide all missing information requested');
    fixes.push('Resubmit with complete documentation attached');
  }
  if (denial.carcCode === 'CO-50' || denial.carcCode === 'CO-197') {
    fixes.push('Obtain retrospective prior authorization if available');
    fixes.push('Appeal with documentation of emergent circumstances');
  }

  return [...new Set(fixes)]; // Remove duplicates
}

function generateDentalAppealStrategy(
  denial: Denial,
  cdtCode: string,
  isFrequencyIssue: boolean,
  missingToothApplies: boolean
): string[] {
  const strategy: string[] = [];

  if (isFrequencyIssue) {
    strategy.push('First-level appeal: Submit clinical narrative explaining why repeat service was medically necessary');
    strategy.push('Include documentation of clinical change since last service');
    strategy.push('Reference any peer-reviewed guidelines supporting repeat service intervals');
    strategy.push('If denied again, request peer-to-peer review with dental consultant');
  }

  if (missingToothApplies) {
    strategy.push('Gather all evidence of tooth existence at enrollment: radiographs, treatment records, referral letters');
    strategy.push('Write a detailed narrative explaining the timeline and clinical circumstances');
    strategy.push('If the tooth was extracted while covered, cite plan language that supports coverage');
    strategy.push('Request review by a dental consultant who can evaluate the clinical evidence');
  }

  // General dental appeal strategies
  strategy.push('Include comprehensive clinical documentation: radiographs, periodontal charting, clinical photographs');
  strategy.push('Reference ADA Clinical Practice Guidelines and CDT coding guidelines');
  strategy.push('If applicable, cite the payer\'s own clinical policies that support the service');
  strategy.push('Request dental consultant review rather than administrative review');
  strategy.push('For second-level appeals, consider independent dental review or external review');

  const crossCode = CDT_CPT_CROSSCODES.find(c => c.cdtCode === cdtCode);
  if (crossCode) {
    strategy.push(`Alternative: Cross-code to CPT ${crossCode.cptCode} and submit to medical insurance with supporting diagnosis codes`);
  }

  return strategy;
}
