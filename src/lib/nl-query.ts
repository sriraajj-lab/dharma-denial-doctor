/**
 * Natural Language Claim Query Parser
 */
import { Denial } from './types';
import { getDenials } from './data';

const PAYER_ALIASES: Record<string, string> = { uhc: 'UnitedHealthcare', united: 'UnitedHealthcare', bcbs: 'Blue Cross', 'blue cross': 'Blue Cross', aetna: 'Aetna', cigna: 'Cigna', humana: 'Humana', medicare: 'Medicare', medicaid: 'Medicaid' };
const CATEGORY_ALIASES: Record<string, string> = { coding: 'coding_error', 'missing info': 'missing_information', auth: 'authorization', eligibility: 'eligibility', 'medical necessity': 'medical_necessity', timely: 'timely_filing', duplicate: 'duplicate', bundling: 'bundling' };

export function executeNLQuery(query: string) {
  const q = query.toLowerCase().trim();
  const filtersApplied: string[] = [];
  let denials = getDenials();

  // Payer
  let payerName: string | undefined;
  for (const [alias, payer] of Object.entries(PAYER_ALIASES)) { if (q.includes(alias)) { payerName = payer; filtersApplied.push(`Payer: ${payer}`); break; } }
  if (payerName) denials = denials.filter(d => d.payerName.toLowerCase().includes(payerName!.toLowerCase()));

  // Amount
  const overMatch = q.match(/(?:over|above|more than|>)\s*\$?([\d,]+)/);
  if (overMatch) { const min = parseInt(overMatch[1].replace(/,/g, '')); denials = denials.filter(d => d.deniedAmount >= min); filtersApplied.push(`Amount > $${min.toLocaleString()}`); }
  const underMatch = q.match(/(?:under|below|less than|<)\s*\$?([\d,]+)/);
  if (underMatch) { const max = parseInt(underMatch[1].replace(/,/g, '')); denials = denials.filter(d => d.deniedAmount <= max); filtersApplied.push(`Amount < $${max.toLocaleString()}`); }

  // Category
  for (const [alias, cat] of Object.entries(CATEGORY_ALIASES)) { if (q.includes(alias)) { denials = denials.filter(d => d.denialCategory === cat); filtersApplied.push(`Category: ${cat.replace('_', ' ')}`); break; } }

  // Correctable
  if (q.includes('correctable')) { denials = denials.filter(d => d.analysis?.correctable); filtersApplied.push('Correctable: Yes'); }
  if (q.includes('appeal')) { denials = denials.filter(d => d.analysis?.appealRecommended); filtersApplied.push('Appeal recommended'); }

  // Status
  if (q.includes('new')) { denials = denials.filter(d => d.status === 'New'); filtersApplied.push('Status: New'); }
  if (q.includes('critical')) { denials = denials.filter(d => d.priority === 'critical'); filtersApplied.push('Priority: Critical'); }

  // Date
  const now = new Date();
  if (q.includes('last month') || q.includes('past month')) { const start = new Date(now); start.setMonth(start.getMonth() - 1); denials = denials.filter(d => new Date(d.denialDate) >= start); filtersApplied.push('Date: Last month'); }
  else if (q.match(/last (\d+) days/)) { const days = parseInt(q.match(/last (\d+) days/)![1]); const start = new Date(now); start.setDate(start.getDate() - days); denials = denials.filter(d => new Date(d.denialDate) >= start); filtersApplied.push(`Date: Last ${days} days`); }

  // Sort by amount desc
  denials.sort((a, b) => b.deniedAmount - a.deniedAmount);

  // Limit
  const limitMatch = q.match(/(?:top|first|show)\s+(\d+)/);
  const limit = limitMatch ? parseInt(limitMatch[1]) : 50;

  const results = denials.slice(0, limit);
  const totalAmount = results.reduce((s, d) => s + d.deniedAmount, 0);
  const interpretation = filtersApplied.length > 0 ? `Searching for denials with: ${filtersApplied.join(' + ')}` : 'Showing all denials (no specific filters detected)';
  const summary = results.length === 0 ? `No denials found matching: "${query}"` : `Found ${results.length} denial${results.length === 1 ? '' : 's'} totaling $${totalAmount.toLocaleString()}`;

  return { query: { interpretation, filtersApplied, rawQuery: query }, results, totalCount: denials.length, totalAmount, summary };
}
