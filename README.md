# Denial Doctor — AI-Powered Healthcare Denial Management

> An intelligent, agentic Revenue Cycle Management (RCM) platform that automates the entire denial lifecycle — from upload through analysis, correction, appeal, and recovery. Powered by 15 specialized AI agents with persistent memory, HIPAA-compliant PHI encryption, and rule engines agents call as tools.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [The 15 AI Agents](#the-15-ai-agents)
4. [How to Use — Step by Step](#how-to-use--step-by-step)
5. [Agent Orchestration API](#agent-orchestration-api)
6. [HIPAA Compliance Features](#hipaa-compliance-features)
7. [Environment Variables](#environment-variables)
8. [Deploying to Production (Vercel)](#deploying-to-production-vercel)
9. [Pushing to GitHub](#pushing-to-github)
10. [Database Management](#database-management)
11. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites
- **Node.js** 18+ or **Bun** runtime
- **Git** for version control
- **Azure OpenAI API key** (optional — the app works without it using rule-based fallback analysis)

### 1. Clone the Repository
```bash
git clone https://github.com/sriraajj-lab/denial-management.git
cd denial-management
```

### 2. Install Dependencies
```bash
npm install
# or with Bun (faster):
bun install
```

### 3. Set Up Environment
```bash
cp .env.example .env
```
Edit `.env` and add your API keys. At minimum, set `DATABASE_URL`:
```env
DATABASE_URL="file:./dev.db"
```

### 4. Set Up Database
```bash
npm run db:setup
```
This runs `prisma generate`, `prisma db push`, and seeds the database with sample data (5 users, 10 denials, 6 payer rules).

### 5. Start Development Server
```bash
npm run dev
```
Open **http://localhost:3000** in your browser.

### One-Line Setup (Bun)
```bash
bun install && cp .env.example .env && bun run db:setup && bun run dev
```

---

## Architecture Overview

### Critical Issues Fixed (v2.0)

| Issue | Before | After |
|-------|--------|-------|
| **Not truly agentic** | No orchestration, no tool use, no memory | 15 agents with orchestrator, tools, persistent memory, and agent-to-agent messaging |
| **HIPAA compliance absent** | No BAA, no PHI encryption, SQLite on ephemeral storage | AES-256 PHI encryption, BAA framework, PHI access guard, HIPAA audit logs, persistent DB |
| **Dual data layer** | JSON files + Prisma created data corruption risk | Single source of truth via Prisma ORM |
| **In-memory intelligence resets** | Learning system forgot everything on restart | Persistent AgentMemory + ResubmissionRecord + PayerBehaviorProfile in database |
| **Rule engines isolated** | Payer rules, scrub, coding engines were parallel systems | 7 tools agents call on demand via ToolRegistry |

### Technology Stack
- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui, Recharts
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: SQLite (development) / PostgreSQL (production/Vercel)
- **AI**: Azure OpenAI GPT-4o/5.5 with rule-based fallback
- **State Management**: Zustand
- **HIPAA**: AES-256 encryption, PHI access logging, BAA tracking

### Data Flow
```
Upload CSV/ERA → Triage Router Agent → Specialized Agents → Human Approval (if needed) → Resubmission/Appeal → Payment Tracking
                     ↓                         ↓
              Tool Registry              Agent Memory (persistent)
              (7 tools)                  (survives restarts)
```

---

## The 15 AI Agents

### New Agents (12)

| # | Agent | Purpose | Key Capability |
|---|-------|---------|---------------|
| 1 | **Triage Router** | Routes denials to the right specialist agent | Auto-classifies by CARC code, category, and urgency |
| 2 | **Evidence Retrieval** | Pulls supporting documents, LCD/NCD references, policy citations | Gathers evidence for appeals and corrections |
| 3 | **Eligibility/COB** | Resolves eligibility denials and coordination of benefits | COB analysis, retro eligibility, coverage gap detection |
| 4 | **Prior Authorization** | Handles auth-required denials | Retro-authorization strategies, peer-to-peer prep |
| 5 | **Medical Necessity** | Challenges medical necessity denials | LCD/NCD crosswalks, clinical justification builder |
| 6 | **Timely Filing Watchdog** | Monitors and alerts on filing deadlines | Auto-calculates deadlines, escalates at-risk claims |
| 7 | **Appeal Strategist** | Plans and generates appeal strategies | Level selection, argument building, success prediction |
| 8 | **Underpayment Detection** | Identifies underpaid claims | Contract vs. paid amount analysis, dispute workflows |
| 9 | **Payer Behavior Learning** | Learns payer patterns from historical data | Success rates, preferred correction types, trend analysis |
| 10 | **Root Cause Prevention** | Prevents future denials | Pattern detection, prevention rule generation |
| 11 | **Human-in-the-Loop** | Manages approval workflows for high-risk actions | Approval requests, escalation, compliance gates |
| 12 | **Compliance/Audit** | Runs HIPAA and regulatory compliance checks | PHI access audits, BAA validation, encryption verification |

### Enhanced Existing Agents (3)

| # | Agent | Enhancement |
|---|-------|-------------|
| 13 | **Denial Analyzer** | Now uses tool framework (coding intelligence, resubmission intelligence tools) |
| 14 | **Correction Engine** | Now uses tool framework (payer rules, claim scrub, eligibility tools) |
| 15 | **Quality Checker** | Now uses tool framework (claim scrub tool for pre-submission validation) |

### 7 Agent-Callable Tools

These rule engines are no longer isolated — agents call them as tools:

| Tool | Description | Used By |
|------|-------------|---------|
| `payer_rules` | Look up payer-specific filing deadlines, auth requirements, contact info | Triage Router, Correction Engine, Appeal Strategist, Timely Filing Watchdog |
| `claim_scrub` | Run claim scrubbing rules to detect issues before submission | Correction Engine, Quality Checker, Root Cause Prevention |
| `coding_intelligence` | NCCI edit pairs, modifier validation, CPT-ICD crosswalk, coverage rules | Denial Analyzer, Correction Engine, Medical Necessity |
| `resubmission_intelligence` | Historical success predictions and alternative strategies | Correction Engine, Appeal Strategist, Payer Behavior Learner |
| `eligibility_resolver` | COB analysis, coverage gap detection, patient responsibility assessment | Eligibility/COB Agent |
| `appeal_generator` | Appeal letter generation with payer-specific strategies | Appeal Strategist |
| `denial_data` | Read, update, and search denial records from the database | All agents |

---

## How to Use — Step by Step

### Step 1: Upload Denials

1. Navigate to **Upload & Scan** in the sidebar
2. Upload a CSV file with your denial data. Required columns:
   ```
   ClaimNumber, PatientName, PatientDOB, PayerName, PayerID, ProviderNPI,
   DateOfService, DenialDate, CPTCode, Modifier, DiagnosisCode,
   BilledAmount, DeniedAmount, CARCCode, RARCCode, AdjustmentGroupCode
   ```
3. The system automatically imports denials and begins the triage process

### Step 2: Review Dashboard

The **Dashboard** shows:
- Total denials, denied amount, and recovery metrics
- Category breakdown (coding errors, authorization, eligibility, etc.)
- Payer breakdown with denial rates
- Recent activity feed

### Step 3: AI Agent Processing

Navigate to **AI Agents** to:
1. **View all 15 registered agents** and their capabilities
2. **See agent tasks** — pending, running, and completed
3. **Submit manual tasks** to specific agents
4. **Run the full denial workflow** — Triage → Analysis → Correction → Quality Check → Appeal

To process a single denial through the full agent workflow:
```bash
# Via API
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"action": "process_denial", "denialId": "YOUR_DENIAL_ID"}'
```

### Step 4: Review Denial Queue

The **Denial Queue** shows all denials with:
- Status badges (New, Analyzed, Corrected, Reviewed, Resubmitted, Appealed, Closed)
- Priority levels (Critical, High, Normal, Low)
- AI analysis results with confidence scores
- Click any denial to see the full detail view

### Step 5: Denial Detail — 7 Tabs

Click any denial to see:

| Tab | What You See |
|-----|-------------|
| **Analysis** | AI root cause analysis, category, correctability, appeal recommendation |
| **Correction** | Specific field changes, risk levels, resubmission instructions |
| **Smart Correct** | NCCI edits, modifier validation, CPT-ICD crosswalk, coverage rules |
| **Eligibility** | COB analysis, coverage gap detection, patient responsibility assessment |
| **Quality** | Pre-submission validation, pass/fail/warning results |
| **Appeal** | Generated appeal letters with clinical justification |
| **Notes** | Staff notes, escalations, payer contacts, resolutions |

### Step 6: AI Worklist

The **AI Worklist** ranks denials by:
```
WorkScore = (Urgency × 35%) + (Value × 25%) + (Success × 25%) + (PayerSpeed × 15%)
```
- Color-coded by risk level
- Recommended next action per claim
- Filter by category, payer, amount range

### Step 7: Appeals Management

1. Navigate to **Appeals** in the sidebar
2. View all appeals by status (Draft, Pending Review, Sent, Accepted, Denied, Expired)
3. Generate new appeal letters with AI
4. Track appeal deadlines with countdown timers

### Step 8: Claim Scrubbing (Prevention)

Navigate to **Claim Scrub** to:
1. Run all 8 built-in scrub rules against active claims
2. Review findings by severity (Critical, High, Medium, Low)
3. Resolve or dismiss individual findings
4. Prevent denials before they happen

### Step 9: Monitor Timely Filing

The **Appeal Deadlines** view shows:
- Countdown timers per denial
- Urgency levels (Expired, Critical, Urgent, Warning, Normal, Safe)
- Auto-escalation at each threshold
- Payer-specific deadline rules (Medicare 120d, UHC 90d, Aetna 60d, etc.)

### Step 10: Financial Tracking

Track recovery with:
- Total recovered vs. resubmitted amounts
- Recovery rate by month
- Event types: Resubmission, Partial Payment, Full Payment, Write-off, Adjustment, Refund
- Per-denial financial history

---

## Agent Orchestration API

### Base URL: `/api/agent`

#### Get System Status
```
GET /api/agent?view=status
```
Returns all registered agents, their capabilities, tools, and task counts.

#### Get Agent Tasks
```
GET /api/agent?view=tasks&status=pending
```
Returns tasks filtered by status (pending, running, completed, failed, escalated).

#### Get Agent Messages
```
GET /api/agent?view=messages&agent=triage-router
```
Returns inter-agent communication messages.

#### Get Agent Memory
```
GET /api/agent?view=memory&agent=payer-behavior-learner
```
Returns persistent memory entries for a specific agent.

#### Get Human Approvals
```
GET /api/agent?view=approvals
```
Returns pending human approval requests from agents.

#### Submit a Task
```
POST /api/agent
{
  "action": "submit_task",
  "taskType": "analyze",
  "input": {"denialId": "..."},
  "targetAgent": "denial-analyzer",  // optional — auto-routed if omitted
  "priority": "high"
}
```

#### Process Full Denial Workflow
```
POST /api/agent
{
  "action": "process_denial",
  "denialId": "YOUR_DENIAL_ID"
}
```
This runs: Triage → Specialized Analysis → Correction → Quality Check → Learning

#### Approve/Reject Human Approval Requests
```
POST /api/agent
{
  "action": "approve",  // or "reject"
  "approvalId": "...",
  "reviewedBy": "admin@denialmanagement.com",
  "reviewNotes": "Approved — correction looks accurate"
}
```

#### Run Special Scans
```bash
# Compliance check
POST /api/agent  {"action": "run_compliance"}

# Timely filing watchdog
POST /api/agent  {"action": "watchdog_scan"}

# Underpayment detection
POST /api/agent  {"action": "underpayment_scan"}

# Payer behavior profile rebuild
POST /api/agent  {"action": "rebuild_profiles"}

# Prevention rule scan
POST /api/agent  {"action": "prevention_scan"}

# Seed historical intelligence data
POST /api/agent  {"action": "seed_intelligence"}
```

---

## HIPAA Compliance Features

### PHI Encryption (AES-256)
All Protected Health Information fields are encrypted at rest using AES-256-GCM:
- Patient name, DOB, member ID
- Claim numbers, diagnosis codes
- Any field marked as PHI in the `PHI_FIELDS` registry

```typescript
import { encryptPHIFields, decryptPHIFields } from '@/lib/hipaa';

// Encrypt before storing
const encrypted = encryptPHIFields({ patientName: 'John Doe', patientDOB: '1990-01-01' });

// Decrypt when reading
const decrypted = decryptPHIFields(encrypted);
```

### PHI Access Guard
Every access to PHI is logged and validated:
```typescript
import { withPHIAccess } from '@/lib/hipaa';

await withPHIAccess(
  { userId: 'admin', accessLevel: 'standard', justification: 'Processing denial' },
  async () => { /* access PHI here */ }
);
```

### BAA Framework
Track Business Associate Agreements with vendors:
```typescript
import { createBAA, validateBAA, runBAAComplianceCheck } from '@/lib/hipaa';

// Create a BAA record
await createBAA({
  vendorName: 'Cloud Provider',
  baaType: 'cloud_provider',
  phiAccessScope: ['denial_data', 'patient_demographics'],
});

// Validate all BAAs are current
const validation = await runBAAComplianceCheck();
```

### HIPAA Audit Logs
Every PHI access creates an immutable audit trail in the `HIPAAAuditLog` table:
- Who accessed, what fields, why, when, from where
- Access levels (standard, elevated, emergency)
- Success/denied tracking

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Prisma connection string. SQLite: `file:./dev.db` / PostgreSQL: `postgresql://...` |
| `AZURE_OPENAI_API_KEY` | No* | Azure OpenAI API key for AI-powered analysis |
| `AZURE_OPENAI_ENDPOINT` | No* | Azure OpenAI resource endpoint URL |
| `AZURE_OPENAI_MODEL` | No* | Model name (e.g., `gpt-4o`, `gpt-5.5`) |
| `AZURE_OPENAI_API_VERSION` | No* | API version (e.g., `2024-08-01-preview`) |
| `NEXTAUTH_URL` | For auth | Base URL for NextAuth (e.g., `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | For auth | Random secret for session encryption |
| `PHI_ENCRYPTION_KEY` | Recommended | 64-char hex key for AES-256 PHI encryption |

*The app works without Azure OpenAI — it falls back to rule-based analysis using CARC/RARC code mappings, NCCI edits, and payer rules.

**Generate a PHI encryption key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Deploying to Production (Vercel)

### Option A: One-Click Deploy Script
```bash
./deploy.sh --vercel
```

### Option B: Manual Vercel Deployment

#### 1. Switch to PostgreSQL
Vercel's serverless functions are stateless, so SQLite won't work. Use a cloud PostgreSQL database:

**Recommended providers:**
- [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres) (easiest — built-in)
- [Supabase](https://supabase.com) (free tier available)
- [Neon](https://neon.tech) (serverless PostgreSQL)
- [Railway](https://railway.app) (simple setup)

#### 2. Update Prisma Schema for PostgreSQL
Edit `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

#### 3. Deploy with Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy (follow prompts)
vercel

# Deploy to production
vercel --prod
```

#### 4. Set Environment Variables in Vercel Dashboard

Go to **Project Settings → Environment Variables** and add:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Your PostgreSQL connection string |
| `AZURE_OPENAI_API_KEY` | Your Azure OpenAI key |
| `AZURE_OPENAI_ENDPOINT` | Your Azure OpenAI endpoint |
| `AZURE_OPENAI_MODEL` | `gpt-4o` or `gpt-5.5` |
| `AZURE_OPENAI_API_VERSION` | `2024-08-01-preview` |
| `NEXTAUTH_URL` | Your Vercel deployment URL |
| `NEXTAUTH_SECRET` | Random secret string |
| `PHI_ENCRYPTION_KEY` | 64-char hex key |

#### 5. Seed the Production Database
After deployment, seed the database by running the seed script against the production database:
```bash
DATABASE_URL="postgresql://..." npx prisma db push
DATABASE_URL="postgresql://..." npx prisma db seed
```

### Option C: Deploy via Vercel Dashboard (No CLI)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository: `sriraajj-lab/denial-management`
3. Framework: **Next.js** (auto-detected)
4. Root Directory: `/` (the denial-doctor project is at the root)
5. Add environment variables (see table above)
6. Click **Deploy**

---

## Pushing to GitHub

### First-Time Setup
If you need to authenticate GitHub from the command line:

```bash
# Install GitHub CLI
# macOS: brew install gh
# Ubuntu: sudo apt install gh
# Windows: winget install GitHub.cli

# Authenticate
gh auth login

# Then push
git push origin main
```

### Or Use Personal Access Token
```bash
# Set remote with token
git remote set-url origin https://<YOUR_TOKEN>@github.com/sriraajj-lab/denial-management.git

# Push
git push origin main
```

### Or Use SSH
```bash
# Generate SSH key
ssh-keygen -t ed25519 -C "sriraajj@gmail.com"

# Add to ssh-agent
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Add public key to GitHub: Settings → SSH and GPG keys → New SSH key
cat ~/.ssh/id_ed25519.pub

# Switch remote to SSH
git remote set-url origin git@github.com:sriraajj-lab/denial-management.git

# Push
git push origin main
```

---

## Database Management

### Common Commands
```bash
# Generate Prisma client
npm run db:generate

# Push schema changes to database (no migration)
npm run db:push

# Create a proper migration
npm run db:migrate

# Reset database (deletes all data!)
npm run db:reset

# Seed with sample data
npm run db:seed

# Full setup (generate + push + seed)
npm run db:setup
```

### Default Users (Seeded)
| Email | Password | Role | Name |
|-------|----------|------|------|
| admin@denialmanagement.com | admin123 | Admin | System Admin |
| manager@denialmanagement.com | manager123 | Manager | Sarah Johnson |
| biller@denialmanagement.com | biller123 | Biller | Mike Chen |
| coder@denialmanagement.com | coder123 | Coder | Jessica Williams |
| client@example.com | client123 | Client | Dr. Robert Smith |

### Database Schema (27 Models)
- **Users & Auth**: User, Session
- **Denials**: Denial, DenialAnalysis, CorrectionSuggestion, QualityCheck
- **Appeals**: AppealLetter
- **Notes**: DenialNote
- **Audit**: AuditLog, HIPAAAuditLog, ComplianceCheck
- **Rules**: PayerRule, ClaimScrubRule, ClaimScrubResult, PreventionRule
- **Financial**: FinancialTracking, UnderpaymentAlert
- **Worklist**: DenialAssignment
- **Reports**: OverviewReport, BatchJob
- **Agent System**: AgentTask, AgentMemory, AgentMessage, HumanApproval
- **Intelligence**: ResubmissionRecord, PayerBehaviorProfile
- **HIPAA**: BAARecord

---

## Troubleshooting

### "No such table" error
Run `npm run db:setup` to create and seed the database.

### AI analysis not working
The app works without Azure OpenAI — it uses rule-based fallback. For AI features, ensure your `AZURE_OPENAI_*` environment variables are set correctly.

### Build errors on Vercel
1. Make sure `DATABASE_URL` points to a PostgreSQL database (not SQLite)
2. Make sure the `prisma/schema.prisma` datasource is set to `postgresql`
3. Ensure `postinstall` script is in `package.json` (it runs `prisma generate`)

### "PHI_ENCRYPTION_KEY" warning
Generate a key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### Port already in use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
# Or use a different port
PORT=3001 npm run dev
```

---

## Project Structure

```
denial-doctor/
├── prisma/
│   ├── schema.prisma          # 27-model database schema
│   └── seed.ts                # Sample data seeder
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── agent/         # Agent orchestration API
│   │   │   ├── denials/       # Denial CRUD + analyze/correct/quality-check
│   │   │   ├── appeals/       # Appeal management
│   │   │   ├── batch/         # Batch processing
│   │   │   ├── dashboard/     # Dashboard stats
│   │   │   └── ...            # Other API routes
│   │   ├── page.tsx           # Main app with view routing
│   │   ├── layout.tsx         # Root layout
│   │   └── globals.css        # Global styles
│   ├── components/
│   │   ├── agents-view.tsx    # AI Agents dashboard
│   │   ├── dashboard-view.tsx # Main dashboard
│   │   ├── denials-view.tsx   # Denial queue
│   │   ├── upload-view.tsx    # CSV/ERA upload
│   │   ├── worklist-view.tsx  # AI-ranked worklist
│   │   └── ...                # 30+ UI components
│   ├── lib/
│   │   ├── agents/            # 15 AI agents + orchestrator + tools
│   │   │   ├── orchestrator.ts    # Agent orchestration engine
│   │   │   ├── base-agent.ts      # Base class with memory/tools/messaging
│   │   │   ├── tool-registry.ts   # 7 agent-callable tools
│   │   │   ├── index.ts           # Agent registration
│   │   │   ├── triage-router.ts
│   │   │   ├── evidence-retrieval.ts
│   │   │   ├── eligibility-cob.ts
│   │   │   ├── prior-authorization.ts
│   │   │   ├── medical-necessity.ts
│   │   │   ├── timely-filing-watchdog.ts
│   │   │   ├── appeal-strategist.ts
│   │   │   ├── underpayment-detector.ts
│   │   │   ├── payer-behavior-learner.ts
│   │   │   ├── root-cause-prevention.ts
│   │   │   ├── human-in-the-loop.ts
│   │   │   ├── compliance-audit.ts
│   │   │   ├── denial-analyzer.ts
│   │   │   ├── correction-engine.ts
│   │   │   └── quality-checker.ts
│   │   ├── hipaa/             # HIPAA compliance modules
│   │   │   ├── encryption.ts      # AES-256 PHI encryption
│   │   │   ├── phi-guard.ts       # PHI access guard
│   │   │   ├── baa-framework.ts   # BAA tracking
│   │   │   └── index.ts
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── data.ts            # Data access layer (Prisma-backed)
│   │   ├── store.ts           # Zustand global state
│   │   └── ...                # 20+ utility modules
│   └── hooks/                 # React hooks
├── .env.example               # Environment variable template
├── deploy.sh                  # One-click deploy script
├── package.json
├── next.config.ts
└── tailwind.config.ts
```

---

*Denial Doctor v2.0 — Built with Next.js 16, Prisma, 15 AI Agents, and HIPAA Compliance*
