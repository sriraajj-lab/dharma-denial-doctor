import { NextRequest, NextResponse } from 'next/server';
import { initializeAgents, orchestrator } from '@/lib/agents';
import { db } from '@/lib/db';

// Initialize agents on first request
let agentsInitialized = false;

function ensureAgents() {
  if (!agentsInitialized) {
    initializeAgents();
    agentsInitialized = true;
  }
}

/**
 * GET /api/agent — Get agent system status, tasks, and agent inventory
 */
export async function GET(request: NextRequest) {
  ensureAgents();

  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view') || 'status';

  try {
    switch (view) {
      case 'status': {
        const status = await orchestrator.getSystemStatus();
        return NextResponse.json(status);
      }

      case 'tasks': {
        const status = searchParams.get('status') || 'pending';
        const tasks = await db.agentTask.findMany({
          where: { status },
          orderBy: [
            { priority: 'desc' },
            { createdAt: 'desc' },
          ],
          take: 50,
        });
        return NextResponse.json({ tasks });
      }

      case 'messages': {
        const agentName = searchParams.get('agent');
        const messages = await db.agentMessage.findMany({
          where: agentName ? { toAgent: agentName } : {},
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
        return NextResponse.json({ messages });
      }

      case 'memory': {
        const agentName = searchParams.get('agent');
        const memories = await db.agentMemory.findMany({
          where: agentName ? { agentName } : {},
          orderBy: { confidence: 'desc' },
          take: 100,
        });
        return NextResponse.json({ memories });
      }

      case 'approvals': {
        const approvals = await db.humanApproval.findMany({
          where: { status: 'pending' },
          orderBy: [
            { urgency: 'desc' },
            { createdAt: 'asc' },
          ],
          take: 50,
        });
        return NextResponse.json({ approvals });
      }

      case 'compliance': {
        const checks = await db.complianceCheck.findMany({
          orderBy: { checkedAt: 'desc' },
          take: 20,
        });
        return NextResponse.json({ checks });
      }

      case 'underpayments': {
        const alerts = await db.underpaymentAlert.findMany({
          where: { status: 'open' },
          orderBy: { underpaidAmount: 'desc' },
          take: 50,
        });
        return NextResponse.json({ alerts });
      }

      case 'prevention': {
        const rules = await db.preventionRule.findMany({
          where: { isActive: true },
          orderBy: { timesTriggered: 'desc' },
        });
        return NextResponse.json({ rules });
      }

      case 'payer_profiles': {
        const profiles = await db.payerBehaviorProfile.findMany({
          orderBy: { totalSubmissions: 'desc' },
        });
        return NextResponse.json({ profiles });
      }

      default:
        return NextResponse.json({ error: 'Unknown view' }, { status: 400 });
    }
  } catch (error) {
    console.error('[AgentAPI] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch agent data' }, { status: 500 });
  }
}

/**
 * POST /api/agent — Submit tasks, approve/reject, and trigger agent actions
 */
export async function POST(request: NextRequest) {
  ensureAgents();

  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // Submit a new task to the orchestrator
      case 'submit_task': {
        const { taskType, input, targetAgent, denialId, priority } = body;
        const taskId = await orchestrator.submitTask(
          taskType,
          input || {},
          { targetAgent, denialId, priority }
        );
        return NextResponse.json({ taskId, status: 'submitted' });
      }

      // Process a specific task
      case 'process_task': {
        const { taskId } = body;
        const result = await orchestrator.processTask(taskId);
        return NextResponse.json({ result });
      }

      // Run the full denial workflow
      case 'process_denial': {
        const { denialId } = body;
        const result = await orchestrator.processDenial(denialId);
        return NextResponse.json({ result });
      }

      // Approve a human approval request
      case 'approve': {
        const { approvalId, reviewedBy, reviewNotes } = body;
        const approval = await db.humanApproval.update({
          where: { id: approvalId },
          data: {
            status: 'approved',
            reviewedBy,
            reviewNotes,
            reviewedAt: new Date(),
          }
        });
        return NextResponse.json({ approval });
      }

      // Reject a human approval request
      case 'reject': {
        const { approvalId, reviewedBy, reviewNotes } = body;
        const approval = await db.humanApproval.update({
          where: { id: approvalId },
          data: {
            status: 'denied',
            reviewedBy,
            reviewNotes,
            reviewedAt: new Date(),
          }
        });
        return NextResponse.json({ approval });
      }

      // Run compliance check
      case 'run_compliance': {
        const taskId = await orchestrator.submitTask('hipaa_check', {}, { targetAgent: 'compliance-audit' });
        const result = await orchestrator.processTask(taskId);
        return NextResponse.json({ result });
      }

      // Run timely filing watchdog scan
      case 'watchdog_scan': {
        const taskId = await orchestrator.submitTask('timely_filing_check', {}, { targetAgent: 'timely-filing-watchdog' });
        const result = await orchestrator.processTask(taskId);
        return NextResponse.json({ result });
      }

      // Run underpayment detection scan
      case 'underpayment_scan': {
        const taskId = await orchestrator.submitTask('underpayment_check', {}, { targetAgent: 'underpayment-detector' });
        const result = await orchestrator.processTask(taskId);
        return NextResponse.json({ result });
      }

      // Rebuild payer behavior profiles
      case 'rebuild_profiles': {
        const taskId = await orchestrator.submitTask('payer_behavior_learn', {}, { targetAgent: 'payer-behavior-learner' });
        const result = await orchestrator.processTask(taskId);
        return NextResponse.json({ result });
      }

      // Run prevention scan
      case 'prevention_scan': {
        const taskId = await orchestrator.submitTask('root_cause_prevention', {}, { targetAgent: 'root-cause-prevention' });
        const result = await orchestrator.processTask(taskId);
        return NextResponse.json({ result });
      }

      // Seed resubmission records from the old in-memory data
      case 'seed_intelligence': {
        const seeded = await seedResubmissionRecords();
        return NextResponse.json({ seeded });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[AgentAPI] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process agent action' },
      { status: 500 }
    );
  }
}

/**
 * Seed the ResubmissionRecord table with historical data for persistent intelligence
 */
async function seedResubmissionRecords(): Promise<number> {
  const existing = await db.resubmissionRecord.count();
  if (existing > 0) return 0; // Already seeded

  const records = [
    { denialId: 'HIST-001', claimNumber: 'CLM-H001', payerName: 'UnitedHealthcare', carcCode: 'CO-16', denialCategory: 'missing_information', cptCode: '99213', deniedAmount: 250, correctionType: 'information_addition', correctionDetails: 'Added referring physician NPI', resubmittedAt: new Date('2025-01-15'), outcome: 'paid', paidAmount: 250, daysToResolution: 17 },
    { denialId: 'HIST-002', claimNumber: 'CLM-H002', payerName: 'UnitedHealthcare', carcCode: 'CO-16', denialCategory: 'missing_information', cptCode: '99214', deniedAmount: 350, correctionType: 'information_addition', correctionDetails: 'Added authorization number', resubmittedAt: new Date('2025-01-20'), outcome: 'paid', paidAmount: 350, daysToResolution: 16 },
    { denialId: 'HIST-003', claimNumber: 'CLM-H003', payerName: 'UnitedHealthcare', carcCode: 'CO-22', denialCategory: 'bundling', cptCode: '99213', deniedAmount: 180, correctionType: 'modifier_addition', correctionDetails: 'Added modifier 25', resubmittedAt: new Date('2025-02-01'), outcome: 'paid', paidAmount: 180, daysToResolution: 19 },
    { denialId: 'HIST-004', claimNumber: 'CLM-H004', payerName: 'UnitedHealthcare', carcCode: 'CO-22', denialCategory: 'bundling', cptCode: '36415', deniedAmount: 45, correctionType: 'modifier_addition', correctionDetails: 'Added modifier 59', resubmittedAt: new Date('2025-02-10'), outcome: 'denied_again', deniedAgainReason: 'CO-22 - modifier does not override this edit', daysToResolution: 14 },
    { denialId: 'HIST-005', claimNumber: 'CLM-H005', payerName: 'UnitedHealthcare', carcCode: 'CO-4', denialCategory: 'coding_error', cptCode: '29881', deniedAmount: 2800, correctionType: 'modifier_addition', correctionDetails: 'Added laterality modifier RT', resubmittedAt: new Date('2025-02-15'), outcome: 'paid', paidAmount: 2800, daysToResolution: 23 },
    { denialId: 'HIST-006', claimNumber: 'CLM-H006', payerName: 'Aetna', carcCode: 'CO-27', denialCategory: 'medical_necessity', cptCode: '70553', deniedAmount: 1500, correctionType: 'diagnosis_change', correctionDetails: 'Changed from R51.9 to G43.909', resubmittedAt: new Date('2025-01-25'), outcome: 'paid', paidAmount: 1500, daysToResolution: 34 },
    { denialId: 'HIST-007', claimNumber: 'CLM-H007', payerName: 'Aetna', carcCode: 'CO-27', denialCategory: 'medical_necessity', cptCode: '27447', deniedAmount: 18000, correctionType: 'appeal_with_documentation', correctionDetails: 'Clinical appeal with 6 months conservative tx records', resubmittedAt: new Date('2025-02-01'), outcome: 'paid', paidAmount: 18000, daysToResolution: 47 },
    { denialId: 'HIST-008', claimNumber: 'CLM-H008', payerName: 'Aetna', carcCode: 'CO-50', denialCategory: 'authorization', cptCode: '43239', deniedAmount: 2200, correctionType: 'retro_authorization', correctionDetails: 'Obtained retro auth via peer-to-peer', resubmittedAt: new Date('2025-03-01'), outcome: 'paid', paidAmount: 2200, daysToResolution: 24 },
    { denialId: 'HIST-009', claimNumber: 'CLM-H009', payerName: 'Aetna', carcCode: 'CO-29', denialCategory: 'timely_filing', cptCode: '99214', deniedAmount: 350, correctionType: 'appeal_with_proof', correctionDetails: 'Submitted clearinghouse acceptance report', resubmittedAt: new Date('2025-02-20'), outcome: 'denied_again', deniedAgainReason: 'CO-29 - appeal denied, filing deadline exceeded', daysToResolution: 30 },
    { denialId: 'HIST-010', claimNumber: 'CLM-H010', payerName: 'Blue Cross Blue Shield', carcCode: 'CO-16', denialCategory: 'missing_information', cptCode: '99215', deniedAmount: 450, correctionType: 'information_addition', correctionDetails: 'Added patient DOB and subscriber ID', resubmittedAt: new Date('2025-01-10'), outcome: 'paid', paidAmount: 450, daysToResolution: 18 },
    { denialId: 'HIST-011', claimNumber: 'CLM-H011', payerName: 'Blue Cross Blue Shield', carcCode: 'CO-11', denialCategory: 'coding_error', cptCode: '99215', deniedAmount: 450, correctionType: 'code_downgrade', correctionDetails: 'Downcoded from 99215 to 99214', resubmittedAt: new Date('2025-02-05'), outcome: 'partially_paid', paidAmount: 320, daysToResolution: 20 },
    { denialId: 'HIST-012', claimNumber: 'CLM-H012', payerName: 'Blue Cross Blue Shield', carcCode: 'CO-4', denialCategory: 'coding_error', cptCode: '27447', deniedAmount: 15000, correctionType: 'modifier_addition', correctionDetails: 'Added modifier 50 for bilateral', resubmittedAt: new Date('2025-03-01'), outcome: 'paid', paidAmount: 15000, daysToResolution: 27 },
    { denialId: 'HIST-013', claimNumber: 'CLM-H013', payerName: 'Medicare', carcCode: 'CO-16', denialCategory: 'missing_information', cptCode: '99213', deniedAmount: 120, correctionType: 'information_addition', correctionDetails: 'Added ordering physician NPI', resubmittedAt: new Date('2025-01-05'), outcome: 'paid', paidAmount: 120, daysToResolution: 14 },
    { denialId: 'HIST-014', claimNumber: 'CLM-H014', payerName: 'Medicare', carcCode: 'CO-27', denialCategory: 'medical_necessity', cptCode: '63030', deniedAmount: 8500, correctionType: 'appeal_with_documentation', correctionDetails: 'ABN on file, submitted MRI and conservative tx records', resubmittedAt: new Date('2025-02-10'), outcome: 'paid', paidAmount: 8500, daysToResolution: 50 },
    { denialId: 'HIST-015', claimNumber: 'CLM-H015', payerName: 'Medicare', carcCode: 'CO-27', denialCategory: 'medical_necessity', cptCode: '29881', deniedAmount: 3200, correctionType: 'appeal_with_documentation', correctionDetails: 'Submitted MRI report and functional limitation documentation', resubmittedAt: new Date('2025-03-01'), outcome: 'denied_again', deniedAgainReason: 'CO-27 - does not meet LCD L34982 criteria', daysToResolution: 45 },
    { denialId: 'HIST-016', claimNumber: 'CLM-H016', payerName: 'Cigna', carcCode: 'CO-50', denialCategory: 'authorization', cptCode: '70553', deniedAmount: 1800, correctionType: 'retro_authorization', correctionDetails: 'Retro auth approved via eviCore', resubmittedAt: new Date('2025-02-15'), outcome: 'paid', paidAmount: 1800, daysToResolution: 18 },
    { denialId: 'HIST-017', claimNumber: 'CLM-H017', payerName: 'Cigna', carcCode: 'CO-22', denialCategory: 'bundling', cptCode: '93000', deniedAmount: 85, correctionType: 'modifier_addition', correctionDetails: 'Added modifier 59 - separate encounter documented', resubmittedAt: new Date('2025-03-10'), outcome: 'paid', paidAmount: 85, daysToResolution: 18 },
    { denialId: 'HIST-018', claimNumber: 'CLM-H018', payerName: 'Cigna', carcCode: 'CO-18', denialCategory: 'duplicate', cptCode: '99213', deniedAmount: 200, correctionType: 'appeal_with_proof', correctionDetails: 'Provided documentation of separate DOS', resubmittedAt: new Date('2025-01-28'), outcome: 'paid', paidAmount: 200, daysToResolution: 18 },
  ];

  for (const record of records) {
    await db.resubmissionRecord.create({ data: record });
  }

  return records.length;
}
