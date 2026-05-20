/**
 * CSV Normalizer Layer — Unifies Different Billing Software Formats
 *
 * ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
 * │ Billing A   │───▶│              │    │                 │
 * │ (Eclinicals) │    │  Normalizer  │───▶│  Unified Data   │
 * ├─────────────┤    │    Layer     │    │     Model       │
 * │ Billing B   │───▶│              │    │                 │
 * │ (Epic)      │    └──────────────┘    └─────────────────┘
 * ├─────────────┤           │                     │
 * │ Billing C   │──────────▶│                     │
 * │ (Generic)   │           │                     ▼
 * └─────────────┘           │           ┌─────────────────┐
 *                           │           │  Single UI/DB   │
 *                           └──────────▶│                 │
 *                                       └─────────────────┘
 *
 * Handles:
 * 1. Auto-detection of billing software format from CSV headers
 * 2. Field mapping from proprietary names to unified Denial model
 * 3. Date format normalization (MM/DD/YYYY, DD-MM-YYYY, etc. → YYYY-MM-DD)
 * 4. Amount parsing ($1,234.56 → 1234.56)
 * 5. Code extraction (CARC/RARC, CPT/CDT, ICD-10)
 * 6. Graceful degradation for missing fields
 * 7. Validation and error reporting per row
 */

import { Denial, PracticeType } from './types';

// ─── BILLING SOFTWARE PROFILES ──────────────────────────────────────────────

export type BillingFormat =
  | 'denials_doctor'     // Our standard format
  | 'eclinicals'         // eClinicalWorks
  | 'epic'               // Epic Systems
  | 'athenahealth'       // Athenahealth
  | 'cerner'             // Cerner / Oracle Health
  | 'advanced_md'        // AdvancedMD
  | 'kareo'              // Kareo / Tebra
  | 'drchrono'           // DrChrono
  | 'waystar'            // Waystar (RCM platform)
  | 'availity'           // Availity ERA/835 export
  | 'generic_835'        // Generic ERA 835 CSV export
  | 'unknown';           // Fallback: best-effort mapping

interface BillingProfile {
  id: BillingFormat;
  name: string;
  /** Header keywords that identify this format (case-insensitive) */
  detectionHeaders: string[];
  /** Mapping from CSV column name → normalized field name */
  fieldMap: Record<string, string>;
  /** Date formats used in this system */
  dateFormats: string[];
  /** Whether amounts include $ signs and commas */
  amountsHaveCurrencyFormat: boolean;
}

const BILLING_PROFILES: BillingProfile[] = [
  // ─── Denials Doctor Standard ───────────────────────────────────────────────
  {
    id: 'denials_doctor',
    name: 'Denials Doctor',
    detectionHeaders: ['claimnumber', 'carccode', 'rarccode', 'adjustmentgroupcode'],
    fieldMap: {
      claimnumber: 'claimNumber',
      patientname: 'patientName',
      patientdob: 'patientDOB',
      payername: 'payerName',
      payerid: 'payerId',
      providernpi: 'providerNPI',
      dateofservice: 'dateOfService',
      denialdate: 'denialDate',
      cptcode: 'cptCode',
      cdtcode: 'cdtCode',
      modifier: 'modifier',
      diagnosiscode: 'diagnosisCode',
      billedamount: 'billedAmount',
      deniedamount: 'deniedAmount',
      carccode: 'carcCode',
      rarccode: 'rarcCode',
      adjustmentgroupcode: 'adjustmentGroupCode',
    },
    dateFormats: ['YYYY-MM-DD'],
    amountsHaveCurrencyFormat: false,
  },

  // ─── eClinicalWorks ────────────────────────────────────────────────────────
  {
    id: 'eclinicals',
    name: 'eClinicalWorks',
    detectionHeaders: ['claim_id', 'patient_name', 'insurance_name', 'cpt', 'denial_reason'],
    fieldMap: {
      claim_id: 'claimNumber',
      'claim id': 'claimNumber',
      patient_name: 'patientName',
      'patient name': 'patientName',
      dob: 'patientDOB',
      date_of_birth: 'patientDOB',
      insurance_name: 'payerName',
      'insurance name': 'payerName',
      payer: 'payerName',
      insurance_id: 'payerId',
      'insurance id': 'payerId',
      npi: 'providerNPI',
      rendering_npi: 'providerNPI',
      'rendering npi': 'providerNPI',
      dos: 'dateOfService',
      date_of_service: 'dateOfService',
      'date of service': 'dateOfService',
      denial_date: 'denialDate',
      'denial date': 'denialDate',
      cpt: 'cptCode',
      cpt_code: 'cptCode',
      'cpt code': 'cptCode',
      modifiers: 'modifier',
      modifier: 'modifier',
      icd10: 'diagnosisCode',
      icd_10: 'diagnosisCode',
      'icd-10': 'diagnosisCode',
      diagnosis: 'diagnosisCode',
      diagnosis_code: 'diagnosisCode',
      billed: 'billedAmount',
      billed_amount: 'billedAmount',
      'billed amount': 'billedAmount',
      charge: 'billedAmount',
      denied: 'deniedAmount',
      denied_amount: 'deniedAmount',
      'denied amount': 'deniedAmount',
      adjustment: 'deniedAmount',
      denial_reason: 'denialReasonRaw',
      'denial reason': 'denialReasonRaw',
      reason_code: 'carcCode',
      'reason code': 'carcCode',
      remark_code: 'rarcCode',
      'remark code': 'rarcCode',
      group_code: 'adjustmentGroupCode',
      'group code': 'adjustmentGroupCode',
      status: 'statusRaw',
      patient_id: 'patientMemberId',
      'patient id': 'patientMemberId',
      rendering_provider: 'providerName',
      facility: 'facilityName',
    },
    dateFormats: ['MM/DD/YYYY', 'YYYY-MM-DD'],
    amountsHaveCurrencyFormat: true,
  },

  // ─── Epic Systems ──────────────────────────────────────────────────────────
  {
    id: 'epic',
    name: 'Epic Systems',
    detectionHeaders: ['hsp_account_id', 'pat_name', 'ins_name', 'svc_dept_id', 'clm_status'],
    fieldMap: {
      hsp_account_id: 'claimNumber',
      'hsp account id': 'claimNumber',
      claim_id: 'claimNumber',
      pat_name: 'patientName',
      'pat name': 'patientName',
      patient_name: 'patientName',
      pat_dob: 'patientDOB',
      'pat dob': 'patientDOB',
      date_of_birth: 'patientDOB',
      ins_name: 'payerName',
      'ins name': 'payerName',
      ins_id: 'payerId',
      'ins id': 'payerId',
      rendering_npi: 'providerNPI',
      'rendering npi': 'providerNPI',
      serv_date: 'dateOfService',
      'serv date': 'dateOfService',
      service_date: 'dateOfService',
      'service date': 'dateOfService',
      denial_date: 'denialDate',
      'denial date': 'denialDate',
      proc_code: 'cptCode',
      'proc code': 'cptCode',
      procedure_code: 'cptCode',
      'procedure code': 'cptCode',
      proc_mod: 'modifier',
      'proc mod': 'modifier',
      dx_code: 'diagnosisCode',
      'dx code': 'diagnosisCode',
      diagnosis_code: 'diagnosisCode',
      'diagnosis code': 'diagnosisCode',
      total_charges: 'billedAmount',
      'total charges': 'billedAmount',
      charge_amount: 'billedAmount',
      'charge amount': 'billedAmount',
      denied_amount: 'deniedAmount',
      'denied amount': 'deniedAmount',
      adjustment_amount: 'deniedAmount',
      'adjustment amount': 'deniedAmount',
      adj_reason: 'carcCode',
      'adj reason': 'carcCode',
      carc: 'carcCode',
      rarc: 'rarcCode',
      adj_group: 'adjustmentGroupCode',
      'adj group': 'adjustmentGroupCode',
      clm_status: 'statusRaw',
      'clm status': 'statusRaw',
      pat_mrn: 'patientMemberId',
      'pat mrn': 'patientMemberId',
      svc_dept: 'facilityName',
    },
    dateFormats: ['MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MMM-YYYY'],
    amountsHaveCurrencyFormat: true,
  },

  // ─── Athenahealth ──────────────────────────────────────────────────────────
  {
    id: 'athenahealth',
    name: 'Athenahealth',
    detectionHeaders: ['athena_claim_id', 'patient_display_name', 'insurance_package_name'],
    fieldMap: {
      athena_claim_id: 'claimNumber',
      'athena claim id': 'claimNumber',
      patient_display_name: 'patientName',
      'patient display name': 'patientName',
      patient_name: 'patientName',
      dob: 'patientDOB',
      date_of_birth: 'patientDOB',
      insurance_package_name: 'payerName',
      'insurance package name': 'payerName',
      insurance_id: 'payerId',
      'insurance id': 'payerId',
      rendering_provider_npi: 'providerNPI',
      'rendering provider npi': 'providerNPI',
      service_date: 'dateOfService',
      'service date': 'dateOfService',
      date_of_service: 'dateOfService',
      denial_date: 'denialDate',
      'denial date': 'denialDate',
      procedure_code: 'cptCode',
      'procedure code': 'cptCode',
      cpt_code: 'cptCode',
      modifier_1: 'modifier',
      'modifier 1': 'modifier',
      icd10_code: 'diagnosisCode',
      'icd10 code': 'diagnosisCode',
      billed_amount: 'billedAmount',
      'billed amount': 'billedAmount',
      allowed_amount: 'allowedAmount',
      'allowed amount': 'allowedAmount',
      paid_amount: 'paidAmount',
      'paid amount': 'paidAmount',
      adjustment_amount: 'deniedAmount',
      'adjustment amount': 'deniedAmount',
      denial_reason_code: 'carcCode',
      'denial reason code': 'carcCode',
      remark_code: 'rarcCode',
      'remark code': 'rarcCode',
      adjustment_group_code: 'adjustmentGroupCode',
      'adjustment group code': 'adjustmentGroupCode',
    },
    dateFormats: ['YYYY-MM-DD', 'MM/DD/YYYY'],
    amountsHaveCurrencyFormat: true,
  },

  // ─── Cerner / Oracle Health ────────────────────────────────────────────────
  {
    id: 'cerner',
    name: 'Cerner / Oracle Health',
    detectionHeaders: ['encounter_id', 'fin_nbr', 'patient_fin', 'payer_plan'],
    fieldMap: {
      encounter_id: 'claimNumber',
      'encounter id': 'claimNumber',
      fin_nbr: 'claimNumber',
      'fin nbr': 'claimNumber',
      patient_fin: 'claimNumber',
      'patient fin': 'claimNumber',
      patient_name: 'patientName',
      'patient name': 'patientName',
      birth_date: 'patientDOB',
      'birth date': 'patientDOB',
      payer_plan: 'payerName',
      'payer plan': 'payerName',
      payer_name: 'payerName',
      'payer name': 'payerName',
      payer_code: 'payerId',
      'payer code': 'payerId',
      prov_npi: 'providerNPI',
      'prov npi': 'providerNPI',
      service_date: 'dateOfService',
      'service date': 'dateOfService',
      from_date: 'dateOfService',
      'from date': 'dateOfService',
      denial_date: 'denialDate',
      'denial date': 'denialDate',
      procedure: 'cptCode',
      procedure_code: 'cptCode',
      'procedure code': 'cptCode',
      mod: 'modifier',
      modifier: 'modifier',
      diag_code: 'diagnosisCode',
      'diag code': 'diagnosisCode',
      diagnosis: 'diagnosisCode',
      charges: 'billedAmount',
      total_charges: 'billedAmount',
      'total charges': 'billedAmount',
      denied_amt: 'deniedAmount',
      'denied amt': 'deniedAmount',
      adjustment: 'deniedAmount',
      reason_code: 'carcCode',
      'reason code': 'carcCode',
      remark: 'rarcCode',
      group_code: 'adjustmentGroupCode',
      'group code': 'adjustmentGroupCode',
    },
    dateFormats: ['DD-MMM-YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
    amountsHaveCurrencyFormat: true,
  },

  // ─── AdvancedMD ────────────────────────────────────────────────────────────
  {
    id: 'advanced_md',
    name: 'AdvancedMD',
    detectionHeaders: ['claim#', 'patient', 'carrier', 'procedure_code'],
    fieldMap: {
      'claim#': 'claimNumber',
      'claim #': 'claimNumber',
      claim_no: 'claimNumber',
      'claim no': 'claimNumber',
      patient: 'patientName',
      patient_name: 'patientName',
      'patient name': 'patientName',
      dob: 'patientDOB',
      date_of_birth: 'patientDOB',
      carrier: 'payerName',
      carrier_name: 'payerName',
      'carrier name': 'payerName',
      carrier_id: 'payerId',
      'carrier id': 'payerId',
      npi: 'providerNPI',
      rendering_npi: 'providerNPI',
      'rendering npi': 'providerNPI',
      dos: 'dateOfService',
      date_of_service: 'dateOfService',
      'date of service': 'dateOfService',
      denial_date: 'denialDate',
      'denial date': 'denialDate',
      procedure_code: 'cptCode',
      'procedure code': 'cptCode',
      cpt: 'cptCode',
      modifier: 'modifier',
      mod: 'modifier',
      icd10: 'diagnosisCode',
      icd_10: 'diagnosisCode',
      'icd-10': 'diagnosisCode',
      diagnosis: 'diagnosisCode',
      billed: 'billedAmount',
      billed_amount: 'billedAmount',
      'billed amount': 'billedAmount',
      charges: 'billedAmount',
      denied: 'deniedAmount',
      denied_amount: 'deniedAmount',
      'denied amount': 'deniedAmount',
      reason_code: 'carcCode',
      'reason code': 'carcCode',
      remark_code: 'rarcCode',
      'remark code': 'rarcCode',
      group_code: 'adjustmentGroupCode',
      'group code': 'adjustmentGroupCode',
    },
    dateFormats: ['MM/DD/YYYY', 'YYYY-MM-DD'],
    amountsHaveCurrencyFormat: true,
  },

  // ─── Kareo / Tebra ─────────────────────────────────────────────────────────
  {
    id: 'kareo',
    name: 'Kareo / Tebra',
    detectionHeaders: ['claim #', 'patient name', 'insurance', 'procedure'],
    fieldMap: {
      'claim #': 'claimNumber',
      'claim#': 'claimNumber',
      claim_id: 'claimNumber',
      'claim id': 'claimNumber',
      'patient name': 'patientName',
      patient_name: 'patientName',
      dob: 'patientDOB',
      date_of_birth: 'patientDOB',
      insurance: 'payerName',
      insurance_name: 'payerName',
      'insurance name': 'payerName',
      insurance_id: 'payerId',
      'insurance id': 'payerId',
      rendering_npi: 'providerNPI',
      'rendering npi': 'providerNPI',
      dos: 'dateOfService',
      date_of_service: 'dateOfService',
      'date of service': 'dateOfService',
      denial_date: 'denialDate',
      'denial date': 'denialDate',
      procedure: 'cptCode',
      procedure_code: 'cptCode',
      'procedure code': 'cptCode',
      mod: 'modifier',
      modifier: 'modifier',
      diagnosis: 'diagnosisCode',
      diagnosis_code: 'diagnosisCode',
      'diagnosis code': 'diagnosisCode',
      billed: 'billedAmount',
      billed_amount: 'billedAmount',
      'billed amount': 'billedAmount',
      charges: 'billedAmount',
      denied: 'deniedAmount',
      denied_amount: 'deniedAmount',
      'denied amount': 'deniedAmount',
      reason: 'carcCode',
      reason_code: 'carcCode',
      'reason code': 'carcCode',
      remark: 'rarcCode',
      remark_code: 'rarcCode',
      'remark code': 'rarcCode',
      group_code: 'adjustmentGroupCode',
      'group code': 'adjustmentGroupCode',
    },
    dateFormats: ['MM/DD/YYYY', 'YYYY-MM-DD'],
    amountsHaveCurrencyFormat: true,
  },

  // ─── Waystar ───────────────────────────────────────────────────────────────
  {
    id: 'waystar',
    name: 'Waystar',
    detectionHeaders: ['claimcontrolnumber', 'billingprovider_npi', 'remittance_code'],
    fieldMap: {
      claimcontrolnumber: 'claimNumber',
      'claim control number': 'claimNumber',
      patientname: 'patientName',
      'patient name': 'patientName',
      patientdob: 'patientDOB',
      'patient dob': 'patientDOB',
      payername: 'payerName',
      'payer name': 'payerName',
      payerid: 'payerId',
      'payer id': 'payerId',
      billingprovider_npi: 'providerNPI',
      'billing provider npi': 'providerNPI',
      renderingprovider_npi: 'providerNPI',
      'rendering provider npi': 'providerNPI',
      servicedate: 'dateOfService',
      'service date': 'dateOfService',
      fromdate: 'dateOfService',
      'from date': 'dateOfService',
      denialdate: 'denialDate',
      'denial date': 'denialDate',
      procedurecode: 'cptCode',
      'procedure code': 'cptCode',
      procedurcode: 'cptCode',
      modifier: 'modifier',
      diagnosiscode: 'diagnosisCode',
      'diagnosis code': 'diagnosisCode',
      billedcharge: 'billedAmount',
      'billed charge': 'billedAmount',
      chargedamount: 'billedAmount',
      'charged amount': 'billedAmount',
      paidamount: 'paidAmount',
      'paid amount': 'paidAmount',
      adjustmentamount: 'deniedAmount',
      'adjustment amount': 'deniedAmount',
      remittance_code: 'carcCode',
      'remittance code': 'carcCode',
      carc_code: 'carcCode',
      'carc code': 'carcCode',
      rarc_code: 'rarcCode',
      'rarc code': 'rarcCode',
      adjustmentgroup: 'adjustmentGroupCode',
      'adjustment group': 'adjustmentGroupCode',
    },
    dateFormats: ['YYYY-MM-DD', 'MM/DD/YYYY'],
    amountsHaveCurrencyFormat: false,
  },

  // ─── Generic ERA 835 ───────────────────────────────────────────────────────
  {
    id: 'generic_835',
    name: 'Generic ERA 835 Export',
    detectionHeaders: ['trace_number', 'payer_id', 'claim_status_code', 'patient_control_number'],
    fieldMap: {
      patient_control_number: 'claimNumber',
      'patient control number': 'claimNumber',
      patient_name: 'patientName',
      'patient name': 'patientName',
      patient_dob: 'patientDOB',
      'patient dob': 'patientDOB',
      payer_name: 'payerName',
      'payer name': 'payerName',
      payer_id: 'payerId',
      'payer id': 'payerId',
      provider_npi: 'providerNPI',
      'provider npi': 'providerNPI',
      service_date_from: 'dateOfService',
      'service date from': 'dateOfService',
      service_date: 'dateOfService',
      'service date': 'dateOfService',
      claim_status_code: 'statusRaw',
      'claim status code': 'statusRaw',
      procedure_code: 'cptCode',
      'procedure code': 'cptCode',
      modifier: 'modifier',
      diagnosis_code: 'diagnosisCode',
      'diagnosis code': 'diagnosisCode',
      billed_amount: 'billedAmount',
      'billed amount': 'billedAmount',
      allowed_amount: 'allowedAmount',
      'allowed amount': 'allowedAmount',
      paid_amount: 'paidAmount',
      'paid amount': 'paidAmount',
      adjustment_amount: 'deniedAmount',
      'adjustment amount': 'deniedAmount',
      adjustment_reason_code: 'carcCode',
      'adjustment reason code': 'carcCode',
      remark_code: 'rarcCode',
      'remark code': 'rarcCode',
      adjustment_group_code: 'adjustmentGroupCode',
      'adjustment group code': 'adjustmentGroupCode',
    },
    dateFormats: ['YYYY-MM-DD', 'MM/DD/YYYY'],
    amountsHaveCurrencyFormat: false,
  },
];

// ─── UNIFIED FIELD ALIASES ──────────────────────────────────────────────────
// For 'unknown' format detection — try common column name variations

const UNIVERSAL_ALIASES: Record<string, string> = {
  // Claim number
  claimnumber: 'claimNumber', 'claim_number': 'claimNumber', 'claim #': 'claimNumber',
  'claim#': 'claimNumber', 'claim_no': 'claimNumber', 'claim no': 'claimNumber',
  'claim id': 'claimNumber', claim_id: 'claimNumber', 'claim-id': 'claimNumber',
  'control number': 'claimNumber', control_number: 'claimNumber',
  'encounter_id': 'claimNumber', 'encounter id': 'claimNumber',

  // Patient name
  patientname: 'patientName', 'patient_name': 'patientName', 'patient name': 'patientName',
  patient: 'patientName', pat_name: 'patientName', 'pat name': 'patientName',
  member_name: 'patientName', 'member name': 'patientName',
  guarantor_name: 'patientName', 'guarantor name': 'patientName',

  // Patient DOB
  patientdob: 'patientDOB', 'patient_dob': 'patientDOB', 'patient dob': 'patientDOB',
  dob: 'patientDOB', date_of_birth: 'patientDOB', 'date of birth': 'patientDOB',
  birth_date: 'patientDOB', 'birth date': 'patientDOB', pat_dob: 'patientDOB',
  'pat dob': 'patientDOB',

  // Payer
  payername: 'payerName', 'payer_name': 'payerName', 'payer name': 'payerName',
  insurance: 'payerName', carrier: 'payerName', ins_name: 'payerName',
  'ins name': 'payerName', insurance_name: 'payerName', 'insurance name': 'payerName',
  'insurance company': 'payerName', insurance_company: 'payerName',
  carrier_name: 'payerName', 'carrier name': 'payerName',

  // Payer ID
  payerid: 'payerId', 'payer_id': 'payerId', 'payer id': 'payerId',
  insurance_id: 'payerId', 'insurance id': 'payerId',
  payer_code: 'payerId', 'payer code': 'payerId',
  carrier_id: 'payerId', 'carrier id': 'payerId',
  ins_id: 'payerId', 'ins id': 'payerId',

  // Provider NPI
  providernpi: 'providerNPI', 'provider_npi': 'providerNPI', 'provider npi': 'providerNPI',
  npi: 'providerNPI', rendering_npi: 'providerNPI', 'rendering npi': 'providerNPI',
  billing_npi: 'providerNPI', 'billing npi': 'providerNPI',
  rendering_provider_npi: 'providerNPI', 'rendering provider npi': 'providerNPI',
  prov_npi: 'providerNPI', 'prov npi': 'providerNPI',

  // Date of service
  dateofservice: 'dateOfService', 'date_of_service': 'dateOfService',
  'date of service': 'dateOfService', dos: 'dateOfService', serv_date: 'dateOfService',
  'serv date': 'dateOfService', service_date: 'dateOfService',
  'service date': 'dateOfService', from_date: 'dateOfService', 'from date': 'dateOfService',

  // Denial date
  denialdate: 'denialDate', 'denial_date': 'denialDate', 'denial date': 'denialDate',
  processed_date: 'denialDate', 'processed date': 'denialDate',
  receipt_date: 'denialDate', 'receipt date': 'denialDate',

  // CPT Code
  cptcode: 'cptCode', 'cpt_code': 'cptCode', 'cpt code': 'cptCode',
  cpt: 'cptCode', procedure_code: 'cptCode', 'procedure code': 'cptCode',
  procedurecode: 'cptCode', proc_code: 'cptCode',
  'proc code': 'cptCode', procedure: 'cptCode',

  // CDT Code (Dental)
  cdtcode: 'cdtCode', 'cdt_code': 'cdtCode', 'cdt code': 'cdtCode',
  cdt: 'cdtCode', dental_code: 'cdtCode', 'dental code': 'cdtCode',

  // Modifier
  modifier: 'modifier', mod: 'modifier', modifiers: 'modifier',
  modifier_1: 'modifier', 'modifier 1': 'modifier', proc_mod: 'modifier',
  'proc mod': 'modifier', modifier1: 'modifier',

  // Diagnosis
  diagnosiscode: 'diagnosisCode', 'diagnosis_code': 'diagnosisCode',
  'diagnosis code': 'diagnosisCode', icd10: 'diagnosisCode', icd_10: 'diagnosisCode',
  'icd-10': 'diagnosisCode', icd10_code: 'diagnosisCode', 'icd10 code': 'diagnosisCode',
  diagnosis: 'diagnosisCode', dx_code: 'diagnosisCode', 'dx code': 'diagnosisCode',
  diag_code: 'diagnosisCode', 'diag code': 'diagnosisCode',
  reason_code_icd10: 'diagnosisCode',

  // Billed Amount
  billedamount: 'billedAmount', 'billed_amount': 'billedAmount',
  'billed amount': 'billedAmount', billed: 'billedAmount', charges: 'billedAmount',
  total_charges: 'billedAmount', 'total charges': 'billedAmount',
  charge: 'billedAmount', charge_amount: 'billedAmount', 'charge amount': 'billedAmount',
  claim_amount: 'billedAmount', 'claim amount': 'billedAmount',
  submitted_amount: 'billedAmount', 'submitted amount': 'billedAmount',
  submitted_charges: 'billedAmount', 'submitted charges': 'billedAmount',

  // Denied Amount
  deniedamount: 'deniedAmount', 'denied_amount': 'deniedAmount',
  'denied amount': 'deniedAmount', denied: 'deniedAmount',
  adjustment: 'deniedAmount', adjustment_amount: 'deniedAmount',
  'adjustment amount': 'deniedAmount', adj_amount: 'deniedAmount',
  'adj amount': 'deniedAmount', write_off: 'deniedAmount', 'write off': 'deniedAmount',
  contractual_adjustment: 'deniedAmount',

  // Allowed Amount
  allowedamount: 'allowedAmount', 'allowed_amount': 'allowedAmount',
  'allowed amount': 'allowedAmount', allowed: 'allowedAmount',

  // Paid Amount
  paidamount: 'paidAmount', 'paid_amount': 'paidAmount', 'paid amount': 'paidAmount',
  paid: 'paidAmount', payment: 'paidAmount', payment_amount: 'paidAmount',
  'payment amount': 'paidAmount',

  // CARC Code
  carccode: 'carcCode', 'carc_code': 'carcCode', 'carc code': 'carcCode',
  carc: 'carcCode', reason_code: 'carcCode', 'reason code': 'carcCode',
  adj_reason: 'carcCode', 'adj reason': 'carcCode',
  denial_reason_code: 'carcCode', 'denial reason code': 'carcCode',
  adjustment_reason_code: 'carcCode', 'adjustment reason code': 'carcCode',
  remittance_code: 'carcCode', 'remittance code': 'carcCode',
  claim_adjustment_reason_code: 'carcCode',

  // RARC Code
  rarccode: 'rarcCode', 'rarc_code': 'rarcCode', 'rarc code': 'rarcCode',
  rarc: 'rarcCode', remark_code: 'rarcCode', 'remark code': 'rarcCode',
  remark: 'rarcCode',

  // Adjustment Group Code
  adjustmentgroupcode: 'adjustmentGroupCode', 'adjustment_group_code': 'adjustmentGroupCode',
  'adjustment group code': 'adjustmentGroupCode', group_code: 'adjustmentGroupCode',
  'group code': 'adjustmentGroupCode', adj_group: 'adjustmentGroupCode',
  'adj group': 'adjustmentGroupCode', adjustmentgroup: 'adjustmentGroupCode',
  'adjustment group': 'adjustmentGroupCode',

  // Provider name
  rendering_provider: 'providerName', 'rendering provider': 'providerName',
  provider_name: 'providerName', 'provider name': 'providerName',
  physician_name: 'providerName', 'physician name': 'providerName',

  // Facility
  facility: 'facilityName', facility_name: 'facilityName', 'facility name': 'facilityName',
  facility_id: 'facilityName',

  // Member ID
  patient_member_id: 'patientMemberId', 'patient member id': 'patientMemberId',
  member_id: 'patientMemberId', 'member id': 'patientMemberId',
  subscriber_id: 'patientMemberId', 'subscriber id': 'patientMemberId',
  patient_id: 'patientMemberId', 'patient id': 'patientMemberId',
  pat_mrn: 'patientMemberId', 'pat mrn': 'patientMemberId',

  // Denial reason raw text
  denial_reason: 'denialReasonRaw', 'denial reason': 'denialReasonRaw',
  denial_desc: 'denialReasonRaw', denial_description: 'denialReasonRaw',
  'denial description': 'denialReasonRaw', reason_description: 'denialReasonRaw',
  'reason description': 'denialReasonRaw',

  // Tooth number (dental)
  tooth_number: 'toothNumber', 'tooth number': 'toothNumber',
  tooth: 'toothNumber', tooth_no: 'toothNumber', 'tooth no': 'toothNumber',
};

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface NormalizationResult {
  success: boolean;
  denials: Denial[];
  errors: NormalizationError[];
  warnings: NormalizationWarning[];
  stats: NormalizationStats;
  detectedFormat: BillingFormat;
  detectedFormatName: string;
  columnMapping: Record<string, string>; // What was mapped
  unmappedColumns: string[];             // Columns we couldn't map
}

export interface NormalizationError {
  row: number;
  column: string;
  value: string;
  error: string;
}

export interface NormalizationWarning {
  row: number;
  column: string;
  value: string;
  warning: string;
}

export interface NormalizationStats {
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  skippedRows: number;  // Empty rows or headers
  duplicateRows: number;
  fieldsMapped: number;
  fieldsUnmapped: number;
}

// ─── FORMAT DETECTION ───────────────────────────────────────────────────────

export function detectBillingFormat(csvHeaders: string[]): { format: BillingFormat; profile: BillingProfile | null; confidence: number } {
  const normalizedHeaders = csvHeaders.map(h => h.toLowerCase().trim().replace(/[^a-z0-9\s_#-]/g, ''));

  let bestMatch: BillingFormat = 'unknown';
  let bestProfile: BillingProfile | null = null;
  let bestScore = 0;

  for (const profile of BILLING_PROFILES) {
    let matchCount = 0;
    for (const detectionKey of profile.detectionHeaders) {
      if (normalizedHeaders.some(h => h.includes(detectionKey))) {
        matchCount++;
      }
    }
    const score = matchCount / profile.detectionHeaders.length;
    if (score > bestScore && matchCount >= 2) {  // At least 2 header matches
      bestScore = score;
      bestMatch = profile.id;
      bestProfile = profile;
    }
  }

  return { format: bestMatch, profile: bestProfile, confidence: bestScore };
}

// ─── COLUMN MAPPING ─────────────────────────────────────────────────────────

function buildColumnMapping(csvHeaders: string[], profile: BillingProfile | null): { mapping: Record<string, string>; unmapped: string[] } {
  const mapping: Record<string, string> = {};
  const unmapped: string[] = [];

  for (const header of csvHeaders) {
    const normalizedHeader = header.toLowerCase().trim().replace(/[^a-z0-9\s_#-]/g, '');

    // 1. Try the detected profile's field map first
    if (profile) {
      const profileMatch = profile.fieldMap[normalizedHeader];
      if (profileMatch) {
        mapping[header] = profileMatch;
        continue;
      }
      // Also try with original case header
      const origMatch = profile.fieldMap[header];
      if (origMatch) {
        mapping[header] = origMatch;
        continue;
      }
    }

    // 2. Try universal aliases
    const universalMatch = UNIVERSAL_ALIASES[normalizedHeader];
    if (universalMatch) {
      mapping[header] = universalMatch;
      continue;
    }

    // 3. Fuzzy match - try to find partial matches
    let fuzzyMatched = false;
    for (const [alias, field] of Object.entries(UNIVERSAL_ALIASES)) {
      if (normalizedHeader.includes(alias) || alias.includes(normalizedHeader)) {
        // Only use fuzzy match if it's a reasonable match (not too short)
        if (normalizedHeader.length >= 3 && alias.length >= 3) {
          mapping[header] = field;
          fuzzyMatched = true;
          break;
        }
      }
    }

    if (!fuzzyMatched) {
      unmapped.push(header);
    }
  }

  return { mapping, unmapped };
}

// ─── VALUE PARSING ──────────────────────────────────────────────────────────

function parseDate(value: string, formats: string[]): string {
  if (!value || value.trim() === '') return '';

  const v = value.trim();

  // Already in ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  // Try MM/DD/YYYY
  const mmddyyyy = v.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (mmddyyyy) {
    const [, m, d, y] = mmddyyyy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Try DD/MM/YYYY (assume if first number > 12 it's a day)
  const ddmmyyyy = v.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (ddmmyyyy) {
    const [, n1, n2, y] = ddmmyyyy;
    if (parseInt(n1) > 12) {
      // Must be DD/MM/YYYY
      return `${y}-${n2.padStart(2, '0')}-${n1.padStart(2, '0')}`;
    }
    // Ambiguous — default to MM/DD/YYYY (US convention)
    return `${y}-${n1.padStart(2, '0')}-${n2.padStart(2, '0')}`;
  }

  // Try DD-MMM-YYYY (e.g., 15-Jan-2025)
  const ddmmmyyyy = v.match(/^(\d{1,2})[-\s](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-\s](\d{4})$/i);
  if (ddmmmyyyy) {
    const months: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const [, d, m, y] = ddmmmyyyy;
    return `${y}-${months[m.toLowerCase()]}-${d.padStart(2, '0')}`;
  }

  // Try YYYYMMDD (Epic sometimes uses this)
  if (/^\d{8}$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  }

  // Last resort: try Date parsing
  try {
    const parsed = new Date(v);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  } catch {}

  return v; // Return as-is if can't parse
}

function parseAmount(value: string, hasCurrencyFormat: boolean): number {
  if (!value || value.trim() === '') return 0;

  let v = value.trim();

  // Remove currency symbols and whitespace
  v = v.replace(/[$€£¥\s]/g, '');

  // Remove comma separators
  v = v.replace(/,/g, '');

  // Handle parentheses for negative amounts (accounting format: (1234.56))
  if (v.startsWith('(') && v.endsWith(')')) {
    v = '-' + v.slice(1, -1);
  }

  // Handle trailing minus (1234.56-)
  if (v.endsWith('-')) {
    v = '-' + v.slice(0, -1);
  }

  const num = parseFloat(v);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100; // Round to 2 decimal places
}

function extractCARCCode(value: string): string {
  if (!value) return '';
  // Already in proper format (e.g., "CO-16", "PR-96")
  if (/^[A-Z]{2}-\d{1,4}$/i.test(value.trim())) return value.trim().toUpperCase();
  // Just a number (e.g., "16", "96")
  if (/^\d{1,4}$/.test(value.trim())) return `CO-${value.trim()}`;
  // Contains a CARC pattern
  const match = value.match(/([A-Z]{2})-?(\d{1,4})/i);
  if (match) return `${match[1].toUpperCase()}-${match[2]}`;
  return value.trim();
}

function extractRARCCode(value: string): string {
  if (!value) return '';
  // RARC codes are typically alphanumeric (e.g., N286, N365)
  const match = value.match(/([A-Z]\d{1,5})/i);
  if (match) return match[1].toUpperCase();
  return value.trim();
}

function determineDenialCategory(carcCode: string, rarcCode: string, denialReason: string): string {
  const code = carcCode.toUpperCase();
  const reason = (denialReason || '').toLowerCase();

  // CARC code-based classification
  if (code.startsWith('CO-16') || code.startsWith('CO-18')) return 'coding_error';
  if (code.startsWith('CO-22') || code.startsWith('CO-19')) return 'bundling';
  if (code.startsWith('CO-50') || code.startsWith('CO-197')) return 'non_covered';
  if (code.startsWith('CO-96') || code.startsWith('CO-97')) return 'non_covered';
  if (code.startsWith('CO-29')) return 'timely_filing';
  if (code.startsWith('PR-1') || code.startsWith('CO-197')) return 'authorization';
  if (code.startsWith('CO-4') || code.startsWith('CO-31')) return 'eligibility';
  if (code.startsWith('CO-27')) return 'eligibility';
  if (code.startsWith('CO-5')) return 'coding_error';
  if (code.startsWith('CO-11')) return 'coding_error';

  // Text-based fallback
  if (reason.includes('coding') || reason.includes('code error')) return 'coding_error';
  if (reason.includes('bundl') || reason.includes('ncci')) return 'bundling';
  if (reason.includes('auth') || reason.includes('pre-cert')) return 'authorization';
  if (reason.includes('eligib') || reason.includes('not covered')) return 'eligibility';
  if (reason.includes('timely') || reason.includes('filing deadline')) return 'timely_filing';
  if (reason.includes('duplicate')) return 'duplicate';
  if (reason.includes('missing') || reason.includes('incomplete')) return 'missing_info';

  return 'other';
}

function detectCodeType(cptOrCdt: string): { code: string; type: 'CPT' | 'CDT' } {
  if (!cptOrCdt) return { code: '', type: 'CPT' };
  const v = cptOrCdt.trim().toUpperCase();
  // CDT codes start with D followed by 4 digits
  if (/^D\d{4}/i.test(v)) return { code: v, type: 'CDT' };
  // CPT codes are 5-digit numeric (possibly with modifier)
  return { code: v, type: 'CPT' };
}

function determinePracticeType(row: Record<string, string>, mapping: Record<string, string>): PracticeType {
  // Check if any column maps to CDT code
  for (const [, field] of Object.entries(mapping)) {
    if (field === 'cdtCode') {
      return 'dental';
    }
  }
  // Check the actual code value
  for (const [header, value] of Object.entries(row)) {
    if (mapping[header] === 'cptCode' && value && /^D\d{4}/i.test(value.trim())) {
      return 'dental';
    }
  }
  return 'medical';
}

// ─── MAIN NORMALIZATION FUNCTION ────────────────────────────────────────────

export function normalizeCSV(
  csvText: string,
  forcedFormat?: BillingFormat
): NormalizationResult {
  const errors: NormalizationError[] = [];
  const warnings: NormalizationWarning[] = [];
  const denials: Denial[] = [];
  const seenClaimNumbers = new Set<string>();

  // Parse CSV
  const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) {
    return {
      success: false,
      denials: [],
      errors: [{ row: 0, column: '', value: '', error: 'CSV file is empty or has no data rows' }],
      warnings: [],
      stats: { totalRows: 0, successfulRows: 0, failedRows: 0, skippedRows: 0, duplicateRows: 0, fieldsMapped: 0, fieldsUnmapped: 0 },
      detectedFormat: 'unknown',
      detectedFormatName: 'Unknown',
      columnMapping: {},
      unmappedColumns: [],
    };
  }

  // Parse headers (handle both quoted and unquoted CSV)
  const headers = parseCSVLine(lines[0]);

  // Detect format
  const { format, profile, confidence } = forcedFormat
    ? { format: forcedFormat, profile: BILLING_PROFILES.find(p => p.id === forcedFormat) || null, confidence: 1 }
    : detectBillingFormat(headers);

  // Build column mapping
  const { mapping, unmapped } = buildColumnMapping(headers, profile);

  // If we have very few mapped fields, add extra warnings
  const criticalFields = ['claimNumber', 'patientName', 'billedAmount', 'deniedAmount'];
  const mappedFields = new Set(Object.values(mapping));
  const missingCritical = criticalFields.filter(f => !mappedFields.has(f));

  if (missingCritical.length > 0) {
    warnings.push({
      row: 0, column: '', value: '',
      warning: `Could not map critical fields: ${missingCritical.join(', ')}. Upload may produce incomplete results. Please check your CSV column names match one of the supported billing formats.`,
    });
  }

  // Determine if we need to try harder with unknown format
  const effectiveProfile = profile || (format === 'unknown' ? null : null);

  // Process each data row
  let successfulRows = 0;
  let failedRows = 0;
  let skippedRows = 0;
  let duplicateRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);

    // Skip empty rows
    if (values.every(v => v.trim() === '')) {
      skippedRows++;
      continue;
    }

    // Build row object from CSV
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = j < values.length ? values[j] : '';
    }

    try {
      // Map row to unified fields
      const mapped: Record<string, string> = {};
      for (const [header, value] of Object.entries(row)) {
        const field = mapping[header];
        if (field) {
          mapped[field] = value;
        }
      }

      // Skip if no claim number at all
      if (!mapped.claimNumber && !mapped.patientName) {
        skippedRows++;
        continue;
      }

      // Generate a claim number if missing
      const claimNumber = mapped.claimNumber || `UPLOADED-${i.toString().padStart(5, '0')}`;

      // Check for duplicates
      if (seenClaimNumbers.has(claimNumber)) {
        duplicateRows++;
        continue;
      }
      seenClaimNumbers.add(claimNumber);

      // Parse dates
      const dateFormats = effectiveProfile?.dateFormats || ['MM/DD/YYYY', 'YYYY-MM-DD'];
      const dateOfService = parseDate(mapped.dateOfService || '', dateFormats);
      const denialDate = parseDate(mapped.denialDate || '', dateFormats);
      const patientDOB = parseDate(mapped.patientDOB || '', dateFormats);

      // Parse amounts
      const hasCurrency = effectiveProfile?.amountsHaveCurrencyFormat ?? true;
      const billedAmount = parseAmount(mapped.billedAmount || '0', hasCurrency);
      const deniedAmount = parseAmount(mapped.deniedAmount || billedAmount.toString(), hasCurrency);

      // Parse codes
      const rawCptCode = mapped.cptCode || mapped.cdtCode || '';
      const { code: codeValue, type: codeType } = detectCodeType(rawCptCode);
      const practiceType = determinePracticeType(row, mapping);

      // Parse CARC/RARC
      const carcCode = extractCARCCode(mapped.carcCode || '');
      const rarcCode = extractRARCCode(mapped.rarcCode || '');
      const denialReasonRaw = mapped.denialReasonRaw || '';

      // Determine denial category
      const denialCategory = determineDenialCategory(carcCode, rarcCode, denialReasonRaw);

      // Determine adjustment group code
      let adjustmentGroupCode = (mapped.adjustmentGroupCode || '').trim().toUpperCase();
      if (!adjustmentGroupCode && carcCode) {
        const prefix = carcCode.split('-')[0];
        if (['CO', 'PR', 'OA', 'PI'].includes(prefix)) {
          adjustmentGroupCode = prefix;
        }
      }
      if (!['CO', 'PR', 'OA', 'PI'].includes(adjustmentGroupCode)) {
        adjustmentGroupCode = 'CO'; // Default to Contractual Obligation
      }

      // Determine status
      const status: Denial['status'] = 'New';
      const priority: Denial['priority'] = deniedAmount > 5000 ? 'critical' : deniedAmount > 1000 ? 'high' : deniedAmount > 200 ? 'normal' : 'low';

      // Build the unified Denial object
      const denial: Denial = {
        id: `DEN-${Date.now()}-${i.toString().padStart(5, '0')}`,
        claimNumber,
        patientName: mapped.patientName || 'Unknown Patient',
        patientDOB: patientDOB || '1900-01-01',
        patientMemberId: mapped.patientMemberId || undefined,
        payerName: mapped.payerName || 'Unknown Payer',
        payerId: mapped.payerId || 'UNK',
        providerNPI: mapped.providerNPI || '0000000000',
        providerName: mapped.providerName || undefined,
        facilityName: mapped.facilityName || undefined,
        dateOfService: dateOfService || denialDate || new Date().toISOString().split('T')[0],
        denialDate: denialDate || dateOfService || new Date().toISOString().split('T')[0],
        cptCode: codeType === 'CPT' ? codeValue : '',
        cdtCode: codeType === 'CDT' ? codeValue : undefined,
        codeType,
        modifier: mapped.modifier || undefined,
        diagnosisCode: mapped.diagnosisCode || '',
        billedAmount,
        deniedAmount,
        allowedAmount: mapped.allowedAmount ? parseAmount(mapped.allowedAmount, hasCurrency) : undefined,
        paidAmount: mapped.paidAmount ? parseAmount(mapped.paidAmount, hasCurrency) : undefined,
        carcCode: carcCode || 'CO-16',
        rarcCode: rarcCode || undefined,
        adjustmentGroupCode,
        denialCategory,
        status,
        priority,
        practiceType,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      denials.push(denial);
      successfulRows++;

      // Add warnings for missing important fields
      if (!mapped.payerName) warnings.push({ row: i + 1, column: 'Payer Name', value: '', warning: 'No payer name found — defaulting to "Unknown Payer"' });
      if (!mapped.providerNPI) warnings.push({ row: i + 1, column: 'Provider NPI', value: '', warning: 'No NPI found — some analysis features may be limited' });
      if (!dateOfService) warnings.push({ row: i + 1, column: 'Date of Service', value: mapped.dateOfService || '', warning: 'Could not parse date of service' });

    } catch (err) {
      failedRows++;
      errors.push({
        row: i + 1,
        column: '',
        value: '',
        error: `Failed to process row: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }
  }

  return {
    success: successfulRows > 0,
    denials,
    errors,
    warnings,
    stats: {
      totalRows: lines.length - 1,
      successfulRows,
      failedRows,
      skippedRows,
      duplicateRows,
      fieldsMapped: Object.keys(mapping).length,
      fieldsUnmapped: unmapped.length,
    },
    detectedFormat: format,
    detectedFormatName: profile?.name || 'Unknown (Auto-detected)',
    columnMapping: mapping,
    unmappedColumns: unmapped,
  };
}

// ─── CSV LINE PARSER ────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ""
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // Skip the next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }

  result.push(current);
  return result;
}
