import { NextRequest, NextResponse } from 'next/server';
import { bulkCreateDenials } from '@/lib/data';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split('\n').filter((line) => line.trim() !== '');

    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV file must contain at least a header row and one data row' }, { status: 400 });
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));

    const requiredHeaders = [
      'ClaimNumber', 'PatientName', 'PatientDOB', 'PayerName', 'PayerID',
      'ProviderNPI', 'DateOfService', 'DenialDate', 'CPTCode', 'Modifier',
      'DiagnosisCode', 'BilledAmount', 'DeniedAmount', 'CARCCode', 'RARCCode',
      'AdjustmentGroupCode',
    ];

    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
    if (missingHeaders.length > 0) {
      return NextResponse.json(
        { error: `Missing required columns: ${missingHeaders.join(', ')}` },
        { status: 400 }
      );
    }

    const denials = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx]?.trim().replace(/"/g, '') || '';
      });

      try {
        const denial = {
          claimNumber: row.ClaimNumber,
          patientName: row.PatientName,
          patientDOB: row.PatientDOB,
          payerName: row.PayerName,
          payerId: row.PayerID,
          providerNPI: row.ProviderNPI,
          dateOfService: row.DateOfService,
          denialDate: row.DenialDate,
          cptCode: row.CPTCode,
          modifier: row.Modifier,
          diagnosisCode: row.DiagnosisCode,
          billedAmount: parseFloat(row.BilledAmount) || 0,
          deniedAmount: parseFloat(row.DeniedAmount) || 0,
          carcCode: row.CARCCode,
          rarcCode: row.RARCCode,
          adjustmentGroupCode: row.AdjustmentGroupCode,
          denialCategory: mapCARCToCategory(row.CARCCode),
          status: 'New' as const,
          priority: determinePriority(row.CARCCode, parseFloat(row.DeniedAmount) || 0),
        };
        denials.push(denial);
      } catch (e) {
        errors.push({ row: i + 1, error: String(e) });
      }
    }

    if (denials.length === 0) {
      return NextResponse.json({ error: 'No valid denial records found in CSV', errors }, { status: 400 });
    }

    const created = bulkCreateDenials(denials);

    return NextResponse.json({
      imported: created.length,
      errors: errors.length,
      errorDetails: errors,
      denials: created,
    });
  } catch (error) {
    console.error('Error uploading CSV:', error);
    return NextResponse.json({ error: 'Failed to process CSV file' }, { status: 500 });
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function mapCARCToCategory(carcCode: string): string {
  const categoryMap: Record<string, string> = {
    'CO-16': 'missing_information',
    'CO-18': 'duplicate',
    'CO-22': 'bundling',
    'CO-27': 'medical_necessity',
    'CO-29': 'timely_filing',
    'CO-50': 'authorization',
    'CO-197': 'authorization',
    'PR-1': 'eligibility',
    'CO-4': 'coding_error',
    'CO-11': 'coding_error',
    'CO-15': 'missing_information',
    'OA-23': 'other',
    'CO-109': 'eligibility',
  };
  return categoryMap[carcCode] || 'other';
}

function determinePriority(carcCode: string, deniedAmount: number): string {
  if (deniedAmount > 5000) return 'critical';
  if (deniedAmount > 1000) return 'high';
  if (['CO-50', 'CO-197'].includes(carcCode)) return 'high';
  if (deniedAmount > 200) return 'normal';
  return 'low';
}
