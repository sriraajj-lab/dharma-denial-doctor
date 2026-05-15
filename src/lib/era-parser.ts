import { ERA835Transaction, ERA835Claim, ERA835Adjustment, ERA835ServiceLine } from './types';

/**
 * Parse ERA/835 Electronic Remittance Advice files
 * Supports standard ANSI X12 835 format
 */
export function parseERA835(content: string): ERA835Transaction[] {
  const transactions: ERA835Transaction[] = [];

  // Detect delimiter (usually ~ for segment, * for element)
  const segmentDelimiter = detectSegmentDelimiter(content);
  const elementDelimiter = detectElementDelimiter(content);
  const subElementDelimiter = ':';

  const segments = content.split(segmentDelimiter).map((s) => s.trim()).filter(Boolean);

  let currentTransaction: ERA835Transaction | null = null;
  let currentClaim: ERA835Claim | null = null;
  let currentServiceLine: ERA835ServiceLine | null = null;

  for (const segment of segments) {
    const elements = segment.split(elementDelimiter);
    const segmentId = elements[0];

    switch (segmentId) {
      case 'BPR': // Beginning of Payment/Remittance
        currentTransaction = {
          traceNumber: '',
          checkDate: '',
          checkAmount: parseFloat(elements[2]) || 0,
          payerName: '',
          payerId: '',
          claims: [],
        };
        // Payment date is in element 16 (YYYYMMDD)
        if (elements[16]) {
          currentTransaction.checkDate = formatDate(elements[16]);
        }
        break;

      case 'TRN': // Trace Number
        if (currentTransaction) {
          currentTransaction.traceNumber = elements[2] || '';
        }
        break;

      case 'N1': // Payer/Payee Name
        if (elements[1] === 'PR' && currentTransaction) {
          // PR = Payer
          currentTransaction.payerName = elements[2] || '';
          if (elements[4]) currentTransaction.payerId = elements[4];
        }
        break;

      case 'CLP': // Claim Level Payment
        if (currentTransaction) {
          // Save previous claim
          if (currentClaim) {
            currentTransaction.claims.push(currentClaim);
          }
          currentClaim = {
            claimNumber: elements[1] || '',
            patientName: '',
            dateOfService: '',
            billedAmount: parseFloat(elements[3]) || 0,
            paidAmount: parseFloat(elements[4]) || 0,
            adjustments: [],
            serviceLines: [],
          };
          currentServiceLine = null;
        }
        break;

      case 'NM1': // Patient Name (within claim)
        if (elements[1] === 'QC' && currentClaim) {
          // QC = Patient
          const lastName = elements[3] || '';
          const firstName = elements[4] || '';
          currentClaim.patientName = `${firstName} ${lastName}`.trim();
          if (elements[9]) currentClaim.patientId = elements[9];
        }
        break;

      case 'DTM': // Date/Time Reference
        if (elements[1] === '232' && currentClaim) {
          // 232 = Statement from date (Date of Service)
          currentClaim.dateOfService = formatDate(elements[2] || '');
        } else if (elements[1] === '233' && currentClaim) {
          // 233 = Statement to date
          // Use if no from date yet
          if (!currentClaim.dateOfService) {
            currentClaim.dateOfService = formatDate(elements[2] || '');
          }
        }
        break;

      case 'SVC': // Service Line
        if (currentClaim) {
          // Save previous service line
          if (currentServiceLine) {
            currentClaim.serviceLines.push(currentServiceLine);
          }

          // Parse composite element (e.g., HC:99213:25)
          const svcId = elements[1] || '';
          const svcParts = svcId.split(subElementDelimiter);
          const cptCode = svcParts[1] || '';
          const modifier = svcParts[2] || undefined;

          currentServiceLine = {
            cptCode,
            modifier,
            billedAmount: parseFloat(elements[2]) || 0,
            paidAmount: parseFloat(elements[3]) || 0,
            adjustments: [],
            remarkCodes: [],
          };
        }
        break;

      case 'CAS': // Claim Adjustment Segment
        const groupCode = elements[1] || ''; // CO, PR, OA, etc.

        // CAS can have up to 6 adjustment groups (elements 2-4, 5-7, 8-10, etc.)
        for (let i = 2; i < elements.length; i += 3) {
          const reasonCode = elements[i];
          const amount = parseFloat(elements[i + 1]) || 0;
          const quantity = elements[i + 2] ? parseInt(elements[i + 2]) : undefined;

          if (reasonCode) {
            const adjustment: ERA835Adjustment = {
              groupCode,
              reasonCode,
              amount,
              quantity,
            };

            if (currentServiceLine) {
              currentServiceLine.adjustments.push(adjustment);
            } else if (currentClaim) {
              currentClaim.adjustments.push(adjustment);
            }
          }
        }
        break;

      case 'LQ': // Remark Codes
        if (elements[1] === 'HE' && currentServiceLine && elements[2]) {
          // HE = Claim Payment Remark Code
          currentServiceLine.remarkCodes.push(elements[2]);
        }
        break;

      case 'SE': // Transaction Set Trailer
        // Finalize current claim and transaction
        if (currentServiceLine && currentClaim) {
          currentClaim.serviceLines.push(currentServiceLine);
          currentServiceLine = null;
        }
        if (currentClaim && currentTransaction) {
          currentTransaction.claims.push(currentClaim);
          currentClaim = null;
        }
        if (currentTransaction) {
          transactions.push(currentTransaction);
          currentTransaction = null;
        }
        break;
    }
  }

  // Handle case where file doesn't end with SE
  if (currentServiceLine && currentClaim) {
    currentClaim.serviceLines.push(currentServiceLine);
  }
  if (currentClaim && currentTransaction) {
    currentTransaction.claims.push(currentClaim);
  }
  if (currentTransaction) {
    transactions.push(currentTransaction);
  }

  return transactions;
}

/**
 * Convert ERA/835 transactions into denial records for import
 */
export function convertERATodenials(transactions: ERA835Transaction[]): Array<{
  claimNumber: string;
  patientName: string;
  patientDOB: string;
  payerName: string;
  payerId: string;
  providerNPI: string;
  dateOfService: string;
  denialDate: string;
  cptCode: string;
  modifier: string;
  diagnosisCode: string;
  billedAmount: number;
  deniedAmount: number;
  carcCode: string;
  rarcCode: string;
  adjustmentGroupCode: string;
}> {
  const denials: Array<{
    claimNumber: string;
    patientName: string;
    patientDOB: string;
    payerName: string;
    payerId: string;
    providerNPI: string;
    dateOfService: string;
    denialDate: string;
    cptCode: string;
    modifier: string;
    diagnosisCode: string;
    billedAmount: number;
    deniedAmount: number;
    carcCode: string;
    rarcCode: string;
    adjustmentGroupCode: string;
  }> = [];

  for (const transaction of transactions) {
    for (const claim of transaction.claims) {
      // Check if there are denials (CO adjustments > 0)
      const allAdjustments = [
        ...claim.adjustments,
        ...claim.serviceLines.flatMap((sl) => sl.adjustments),
      ];

      // Only create denial records for claims with contractual obligation (CO) or other denials
      const denialAdjustments = allAdjustments.filter(
        (adj) => adj.groupCode === 'CO' || adj.groupCode === 'OA'
      );

      if (denialAdjustments.length === 0 && claim.paidAmount >= claim.billedAmount) {
        continue; // Skip fully paid claims
      }

      // Group by service line for more detailed denial records
      if (claim.serviceLines.length > 0) {
        for (const svc of claim.serviceLines) {
          const svcDenialAdj = svc.adjustments.filter(
            (adj) => adj.groupCode === 'CO' || adj.groupCode === 'OA'
          );

          if (svcDenialAdj.length > 0) {
            const primaryAdj = svcDenialAdj[0];
            const totalDenied = svcDenialAdj.reduce((sum, a) => sum + a.amount, 0);

            denials.push({
              claimNumber: claim.claimNumber,
              patientName: claim.patientName,
              patientDOB: '',
              payerName: transaction.payerName,
              payerId: transaction.payerId,
              providerNPI: '',
              dateOfService: claim.dateOfService,
              denialDate: transaction.checkDate,
              cptCode: svc.cptCode,
              modifier: svc.modifier || '',
              diagnosisCode: '',
              billedAmount: svc.billedAmount,
              deniedAmount: totalDenied,
              carcCode: `${primaryAdj.groupCode}-${primaryAdj.reasonCode}`,
              rarcCode: svc.remarkCodes.join(','),
              adjustmentGroupCode: primaryAdj.groupCode,
            });
          }
        }
      } else if (denialAdjustments.length > 0) {
        // Claim-level denial
        const primaryAdj = denialAdjustments[0];
        const totalDenied = denialAdjustments.reduce((sum, a) => sum + a.amount, 0);

        denials.push({
          claimNumber: claim.claimNumber,
          patientName: claim.patientName,
          patientDOB: '',
          payerName: transaction.payerName,
          payerId: transaction.payerId,
          providerNPI: '',
          dateOfService: claim.dateOfService,
          denialDate: transaction.checkDate,
          cptCode: '',
          modifier: '',
          diagnosisCode: '',
          billedAmount: claim.billedAmount,
          deniedAmount: totalDenied,
          carcCode: `${primaryAdj.groupCode}-${primaryAdj.reasonCode}`,
          rarcCode: '',
          adjustmentGroupCode: primaryAdj.groupCode,
        });
      }
    }
  }

  return denials;
}

// ─── HELPERS ────────────────────────────────────────────────────────────────────

function detectSegmentDelimiter(content: string): string {
  // Standard 835 uses ~ as segment delimiter
  if (content.includes('~')) return '~';
  // Some files use newlines
  if (content.includes('\n')) return '\n';
  return '~';
}

function detectElementDelimiter(content: string): string {
  // Standard 835 uses * as element delimiter
  if (content.includes('*')) return '*';
  return '*';
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 8) return dateStr;
  // YYYYMMDD → YYYY-MM-DD
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}
