/**
 * Prisma Database Seed Script
 * Run with: npx prisma db seed
 * Or: bun run prisma/seed.ts
 *
 * Seeds the database with:
 * - Default users (admin, manager, biller, coder, client)
 * - Sample denial data from sample-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Users ──────────────────────────────────────────────────────────────
  const users = [
    { email: 'admin@denialmanagement.com', name: 'System Admin', passwordHash: 'admin123', role: 'admin', department: 'Administration' },
    { email: 'manager@denialmanagement.com', name: 'Sarah Johnson', passwordHash: 'manager123', role: 'manager', department: 'Revenue Cycle' },
    { email: 'biller@denialmanagement.com', name: 'Mike Chen', passwordHash: 'biller123', role: 'biller', department: 'Billing' },
    { email: 'coder@denialmanagement.com', name: 'Jessica Williams', passwordHash: 'coder123', role: 'coder', department: 'Coding' },
    { email: 'client@example.com', name: 'Dr. Robert Smith', passwordHash: 'client123', role: 'client', department: 'Orthopedics' },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: user,
    });
  }
  console.log(`  ✓ ${users.length} users seeded`);

  // ── Sample Denials ─────────────────────────────────────────────────────
  const sampleDenials = [
    { claimNumber: 'CLM-2024-00451', patientName: 'Margaret Thompson', patientDOB: '1958-03-15', payerName: 'UnitedHealthcare', payerId: 'UHC-87726', providerNPI: '1234567890', dateOfService: '2024-11-15', denialDate: '2024-12-01', cptCode: '99213', modifier: '25', diagnosisCode: 'M54.5', billedAmount: 250, deniedAmount: 250, carcCode: 'CO-16', rarcCode: 'N286', adjustmentGroupCode: 'CO', denialCategory: 'missing_information', status: 'New', priority: 'high' },
    { claimNumber: 'CLM-2024-00452', patientName: 'Robert Chen', patientDOB: '1972-07-22', payerName: 'Aetna', payerId: 'AET-60054', providerNPI: '1234567890', dateOfService: '2024-11-10', denialDate: '2024-11-28', cptCode: '99214', modifier: '', diagnosisCode: 'J06.9', billedAmount: 350, deniedAmount: 350, carcCode: 'CO-27', rarcCode: 'N386', adjustmentGroupCode: 'CO', denialCategory: 'medical_necessity', status: 'Analyzed', priority: 'normal' },
    { claimNumber: 'CLM-2024-00453', patientName: 'Sarah Williams', patientDOB: '1990-01-30', payerName: 'Blue Cross Blue Shield', payerId: 'BCBS-00060', providerNPI: '1234567890', dateOfService: '2024-10-20', denialDate: '2024-11-15', cptCode: '29881', modifier: '', diagnosisCode: 'M23.21', billedAmount: 4500, deniedAmount: 4500, carcCode: 'CO-22', rarcCode: 'N519', adjustmentGroupCode: 'CO', denialCategory: 'bundling', status: 'New', priority: 'critical' },
    { claimNumber: 'CLM-2024-00454', patientName: 'James Wilson', patientDOB: '1965-11-08', payerName: 'Cigna', payerId: 'CIG-62308', providerNPI: '1234567890', dateOfService: '2024-11-01', denialDate: '2024-11-20', cptCode: '70553', modifier: '', diagnosisCode: 'R51.9', billedAmount: 1800, deniedAmount: 1800, carcCode: 'CO-50', rarcCode: 'N590', adjustmentGroupCode: 'CO', denialCategory: 'authorization', status: 'New', priority: 'high' },
    { claimNumber: 'CLM-2024-00455', patientName: 'Linda Martinez', patientDOB: '1948-05-12', payerName: 'Medicare', payerId: 'CMS-00001', providerNPI: '1234567890', dateOfService: '2024-09-15', denialDate: '2024-10-01', cptCode: '99215', modifier: '', diagnosisCode: 'E11.9', billedAmount: 450, deniedAmount: 450, carcCode: 'CO-11', rarcCode: 'MA130', adjustmentGroupCode: 'CO', denialCategory: 'coding_error', status: 'Corrected', priority: 'normal' },
    { claimNumber: 'CLM-2024-00456', patientName: 'David Brown', patientDOB: '1980-09-25', payerName: 'UnitedHealthcare', payerId: 'UHC-87726', providerNPI: '1234567890', dateOfService: '2024-08-10', denialDate: '2024-12-05', cptCode: '43239', modifier: '', diagnosisCode: 'K21.0', billedAmount: 2200, deniedAmount: 2200, carcCode: 'CO-29', rarcCode: 'N522', adjustmentGroupCode: 'CO', denialCategory: 'timely_filing', status: 'New', priority: 'low' },
    { claimNumber: 'CLM-2024-00457', patientName: 'Emily Davis', patientDOB: '1995-12-03', payerName: 'Aetna', payerId: 'AET-60054', providerNPI: '1234567890', dateOfService: '2024-11-20', denialDate: '2024-12-10', cptCode: '99213', modifier: '', diagnosisCode: 'J02.9', billedAmount: 180, deniedAmount: 180, carcCode: 'CO-18', rarcCode: '', adjustmentGroupCode: 'CO', denialCategory: 'duplicate', status: 'New', priority: 'low' },
    { claimNumber: 'CLM-2024-00458', patientName: 'Michael Johnson', patientDOB: '1955-04-18', payerName: 'Humana', payerId: 'HUM-61101', providerNPI: '1234567890', dateOfService: '2024-11-05', denialDate: '2024-11-25', cptCode: '27447', modifier: '', diagnosisCode: 'M17.11', billedAmount: 18000, deniedAmount: 18000, carcCode: 'CO-27', rarcCode: 'N386', adjustmentGroupCode: 'CO', denialCategory: 'medical_necessity', status: 'New', priority: 'critical' },
    { claimNumber: 'CLM-2024-00459', patientName: 'Patricia Anderson', patientDOB: '1978-08-14', payerName: 'Blue Cross Blue Shield', payerId: 'BCBS-00060', providerNPI: '1234567890', dateOfService: '2024-11-12', denialDate: '2024-12-02', cptCode: '99214', modifier: '25', diagnosisCode: 'M79.3', billedAmount: 350, deniedAmount: 350, carcCode: 'CO-4', rarcCode: 'N95', adjustmentGroupCode: 'CO', denialCategory: 'coding_error', status: 'New', priority: 'high' },
    { claimNumber: 'CLM-2024-00460', patientName: 'Thomas Garcia', patientDOB: '1962-02-28', payerName: 'Medicare', payerId: 'CMS-00001', providerNPI: '1234567890', dateOfService: '2024-10-30', denialDate: '2024-11-20', cptCode: '63030', modifier: '', diagnosisCode: 'M54.5', billedAmount: 8500, deniedAmount: 8500, carcCode: 'CO-27', rarcCode: 'N386', adjustmentGroupCode: 'CO', denialCategory: 'medical_necessity', status: 'Resubmitted', priority: 'critical' },
  ];

  for (const denial of sampleDenials) {
    await prisma.denial.upsert({
      where: { claimNumber: denial.claimNumber },
      update: {},
      create: denial,
    });
  }
  console.log(`  ✓ ${sampleDenials.length} sample denials seeded`);

  // ── Payer Rules ────────────────────────────────────────────────────────
  const payerRules = [
    { payerName: 'Medicare', payerId: 'CMS', ruleType: 'filing_deadline', ruleName: 'Medicare Timely Filing', filingDeadlineDays: 365, appealDeadlineDays: 120, requiresAuth: false, isActive: true },
    { payerName: 'UnitedHealthcare', payerId: '87726', ruleType: 'filing_deadline', ruleName: 'UHC Timely Filing', filingDeadlineDays: 180, appealDeadlineDays: 90, requiresAuth: false, isActive: true },
    { payerName: 'Aetna', payerId: '60054', ruleType: 'filing_deadline', ruleName: 'Aetna Timely Filing', filingDeadlineDays: 180, appealDeadlineDays: 60, requiresAuth: false, isActive: true },
    { payerName: 'Blue Cross Blue Shield', payerId: '00060', ruleType: 'filing_deadline', ruleName: 'BCBS Timely Filing', filingDeadlineDays: 365, appealDeadlineDays: 90, requiresAuth: false, isActive: true },
    { payerName: 'Cigna', payerId: '62308', ruleType: 'filing_deadline', ruleName: 'Cigna Timely Filing', filingDeadlineDays: 180, appealDeadlineDays: 90, requiresAuth: false, isActive: true },
    { payerName: 'Humana', payerId: '61101', ruleType: 'filing_deadline', ruleName: 'Humana Timely Filing', filingDeadlineDays: 365, appealDeadlineDays: 60, requiresAuth: false, isActive: true },
  ];

  for (const rule of payerRules) {
    await prisma.payerRule.create({ data: rule });
  }
  console.log(`  ✓ ${payerRules.length} payer rules seeded`);

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
