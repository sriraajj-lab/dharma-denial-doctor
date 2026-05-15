# Denial Management AI Agent — Complete Product Scope

## Product Overview

An AI-powered Revenue Cycle Management (RCM) denial management platform that automates the entire denial lifecycle from upload through recovery. The system uses artificial intelligence to analyze, correct, and resolve denied medical claims while providing proactive prevention, staff productivity tracking, and comprehensive client reporting.

**Technology Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Prisma (SQLite), Azure OpenAI (GPT-5.5), Zustand, shadcn/ui

---

## Table of Contents

1. [Core Workflow](#1-core-workflow)
2. [AI Intelligence Engines](#2-ai-intelligence-engines)
3. [Smart Coding Correction](#3-smart-coding-correction)
4. [Eligibility Resolution](#4-eligibility-resolution)
5. [Appeal Management](#5-appeal-management)
6. [Client Health Scan](#6-client-health-scan)
7. [AI-Ranked Worklist](#7-ai-ranked-worklist)
8. [Denial Prevention](#8-denial-prevention)
9. [Follow-up Tracking](#9-follow-up-tracking)
10. [Appeal Deadline Countdown](#10-appeal-deadline-countdown)
11. [Financial Tracking](#11-financial-tracking)
12. [Claim Scrubbing](#12-claim-scrubbing)
13. [Payer Rules Engine](#13-payer-rules-engine)
14. [Staff Performance Metrics](#14-staff-performance-metrics)
15. [Natural Language Search](#15-natural-language-search)
16. [Authentication & RBAC](#16-authentication--rbac)
17. [Audit Trail](#17-audit-trail)
18. [Export & Reporting](#18-export--reporting)
19. [ERA/835 File Support](#19-era835-file-support)
20. [Batch Processing](#20-batch-processing)
21. [Notes & Collaboration](#21-notes--collaboration)
22. [Resubmission Intelligence](#22-resubmission-intelligence)
23. [API Reference](#23-api-reference)
24. [Data Model](#24-data-model)

---

## 1. Core Workflow

### Denial Lifecycle

```
Upload CSV/ERA → AI Analysis → Smart Correction → Quality Check → Resubmission → Follow-up → Payment/Close
```

### Status Flow
`New` → `Analyzed` → `Corrected` → `Reviewed` → `Resubmitted` → `Appealed` → `Closed`

### Upload Methods
- **CSV Upload**: Standard denial report format (16 required columns)
- **ERA/835 Upload**: ANSI X12 835 electronic remittance advice parsing
- **Overview Scan**: Batch analysis with AI-generated executive report + rating

### Required CSV Columns
ClaimNumber, PatientName, PatientDOB, PayerName, PayerID, ProviderNPI, DateOfService, DenialDate, CPTCode, Modifier, DiagnosisCode, BilledAmount, DeniedAmount, CARCCode, RARCCode, AdjustmentGroupCode

---

## 2. AI Intelligence Engines

### Denial Analysis Agent
- Root cause identification using CARC/RARC codes
- Denial category classification (coding_error, missing_information, authorization, eligibility, medical_necessity, timely_filing, duplicate, bundling, other)
- Correctability assessment (boolean)
- Appeal recommendation with confidence score
- Required information identification
- Compliance notes

### Correction Suggestion Agent
- Proposes specific field changes with risk levels (low/medium/high)
- Lists required supporting documents
- Provides resubmission instructions (frequency code, method)
- Enhanced with NCCI edit data, modifier rules, and LCD/NCD coverage criteria
- Feeds historical success predictions into AI context

### Quality Checker Agent
- Validates corrections before resubmission
- Pass/Fail/Warning result with blocking issues
- Validates coding changes are supported by documentation
- Checks for compliance risks

### AI Models Used
- Azure OpenAI GPT-5.5 (configurable endpoint)
- Fallback logic for all agents (works without API key using rule-based analysis)

---

## 3. Smart Coding Correction

### NCCI Edit Pair Database
- 30+ common bundled procedure pairs
- Modifier-allowed flag per pair
- Specific unbundling recommendations
- E/M, surgical, imaging, lab, injection, and PT bundling rules

### Modifier Validation
- 11 modifier rules (25, 59, XE, XS, XP, XU, 26, TC, 50, LT, RT)
- Valid CPT ranges per modifier
- Documentation requirements
- Common misuse warnings

### CPT-ICD Crosswalk (Medical Necessity)
- Coverage rules for: TKR (27447), Arthroscopy (29881), Spine (63030), Imaging (70553), GI (43239), E/M (99213-99215)
- Covered vs uncovered diagnosis codes
- LCD/NCD references
- Required documentation elements

### Correction Output
- Overall assessment: correctable / partially_correctable / requires_appeal / not_correctable
- Specific corrections with field, current value, suggested value, rationale
- Resubmission strategy (corrected claim vs appeal vs void-and-replace)
- Estimated success rate
- Step-by-step resubmission instructions

---

## 4. Eligibility Resolution

### Resolution Types Detected
| Type | Detection Method |
|------|-----------------|
| COB Primary Identified | Medicare MSP rules, employer coverage check |
| Retroactive Eligibility | Coverage within reinstatement window |
| Coverage Gap Fixable | COBRA 60-day window, Medicaid 90-day retro |
| Wrong Subscriber Info | Full charge denial pattern detection |
| Workers Comp/Auto | Injury diagnosis codes (S/T ICD-10) |
| Patient Responsibility | PR-1/PR-2/PR-3 validation |
| Medicaid Eligible | Uninsured within 90 days of DOS |
| Financial Assistance | High-dollar uninsured screening |

### COB Analysis
- Medicare Secondary Payer detection
- Employer group health plan verification steps
- Spouse/dependent coverage identification
- Birthday rule and gender rule awareness

### Coverage Gap Analysis
- COBRA eligibility window (60 days)
- Plan reinstatement windows (90 days)
- Medicaid retroactive coverage (3 months)
- Reinstatement deadline calculation

### Patient Responsibility Assessment
- Deductible/copay/coinsurance classification
- Payment plan recommendations (>$500)
- Financial assistance screening (>$2000)
- Collection workflow steps

### Payer-Specific Patterns
Pre-loaded for: Medicare, Medicaid, UnitedHealthcare, Blue Cross Blue Shield, Aetna, Cigna
- Member ID format validation
- Common issues per payer
- Eligibility portal URLs
- Provider services phone numbers

---

## 5. Appeal Management

### Appeal Letter Generation
- AI-powered appeal letters using denial analysis context
- Fallback template for each CARC code
- Supports: First Level, Second Level, External Review
- Professional markdown format with all required elements

### Appeal Workflow
`Draft` → `Pending Review` → `Sent` → `Accepted/Denied/Expired`

### Letter Contents
- Proper payer addressing
- Claim and denial reference
- Clinical justification
- Policy/LCD/NCD citations
- Specific action request
- Supporting documentation checklist

---

## 6. Client Health Scan

### Overall Score (0-100 with A+ to F grade)

### 5 Scoring Dimensions
| Dimension | Weight | Benchmarks |
|-----------|--------|------------|
| Denial Rate | 25% | Excellent ≤5%, Good ≤8%, Average ≤12%, Poor ≤18% |
| Recovery Potential | 25% | Excellent ≥85%, Good ≥70%, Average ≥55% |
| Coding Accuracy | 20% | Excellent ≥95%, Good ≥90%, Average ≥85% |
| Timely Filing Compliance | 15% | Excellent ≥98%, Good ≥95%, Average ≥90% |
| Payer Mix Health | 15% | Diversification analysis |

### Payer Report Card
- Each payer graded A-F independently
- Denial rate, recovery rate, avg resolution days
- Top denial reason per payer
- Specific recommendation per payer

### Preventable Denial Analysis
- Percentage of denials that were preventable
- Root cause breakdown with amounts
- Prevention recommendations
- Estimated savings if prevented

### Improvement Plan
- Prioritized actions (numbered 1-N)
- Expected impact per action
- Estimated dollar recovery
- Timeframe and difficulty rating
- Category (Coding, Prevention, Payer Management, Recovery, Monitoring)

### Executive Summary
- Client-ready paragraph for presentations
- Automatically generated based on score and findings

---

## 7. AI-Ranked Worklist

### Scoring Formula
```
WorkScore = (Urgency × 35%) + (Value × 25%) + (Success × 25%) + (PayerSpeed × 15%)
```

### Scoring Components
- **Urgency**: Days until filing deadline (0d=100, 7d=95, 14d=85, 30d=70, 60d=50)
- **Value**: Dollar amount ($10k+=100, $5k=85, $2k=70, $1k=55, $500=40)
- **Success**: Predicted correction success rate per category
- **Payer Speed**: Average days to payment (Medicare=14d, UHC=21d, Aetna=25d)

### Features
- Filters by category, payer, amount
- Color-coded risk levels (critical/high/medium/low)
- Recommended next action per claim
- Click to navigate directly to denial detail

---

## 8. Denial Prevention

### Alert Types
| Alert | Trigger | Severity |
|-------|---------|----------|
| Auth Required | CPT in payer auth range | High |
| Filing Deadline | ≤14 days remaining | Critical/High |
| Coding Warning | Scrub rule violation | High |
| Duplicate Risk | Same patient+DOS+CPT | High |
| Payer Pattern | Historical high denial rate for payer+category | Medium |
| Missing Info | Surgical code without modifier | Medium |

### Prevention Metrics
- Total claims at risk
- Total $ at risk
- Preventable rate (% of denials that could have been avoided)
- Estimated savings

---

## 9. Follow-up Tracking

### Automated Cadence
| Step | Days After Resubmission | Action |
|------|------------------------|--------|
| 14-day | 14 | Verify payer receipt. Check portal. |
| 30-day | 30 | Payment expected. Call payer. Document ref#. |
| 45-day | 45 | ESCALATE to supervisor. File formal inquiry. |
| 60-day | 60 | FINAL: Write-off decision. Contact payer management. |

### Auto-Escalation
- Overdue >7 days → Escalated status
- Tracks per-payer response times
- Shows total pending $ amount

---

## 10. Appeal Deadline Countdown

### Urgency Levels
| Level | Days Remaining | Auto-Escalation |
|-------|---------------|-----------------|
| Expired | 0 | Director review |
| Critical | ≤3 | Manager approval required |
| Urgent | ≤7 | Supervisor notification |
| Warning | ≤14 | Staff alert |
| Normal | ≤30 | Monitor |
| Safe | >30 | No action |

### Features
- Per-payer appeal deadlines (Medicare 120d, UHC 90d, Aetna 60d, etc.)
- Red countdown timers
- Escalation messages with responsible party
- Tracks appeals filed vs not filed

---

## 11. Financial Tracking

### Event Types
- Resubmission
- Partial Payment
- Full Payment
- Write-off
- Adjustment
- Refund

### Metrics
- Total recovered (actual payments)
- Recovery rate (recovered / resubmitted)
- Total write-offs
- Monthly breakdown (last 6 months)
- Per-event-type summary

---

## 12. Claim Scrubbing

### Built-in Rules (8)
1. Missing Modifier for Bilateral Procedures
2. E/M Level vs Diagnosis Mismatch
3. CCI Bundling Check (common pairs)
4. Missing Diagnosis for Procedure
5. Authorization Required (high-cost imaging)
6. Duplicate Claim Check
7. NCD/LCD Coverage Check
8. Patient Demographics Completeness

### Severity Levels
- Critical: Block submission
- High: Strong warning
- Medium: Advisory
- Low: Informational

### Batch Scrubbing
- Run all rules against all active claims
- Summary with counts per severity
- Individual finding resolution tracking

---

## 13. Payer Rules Engine

### Pre-loaded Payers (6)
| Payer | Filing Deadline | Appeal Deadline | Auth Rules |
|-------|----------------|-----------------|------------|
| Medicare | 365 days | 120 days | Imaging 70000-79999 |
| UnitedHealthcare | 180 days | 90 days | Imaging, Surgery |
| Aetna | 180 days | 60 days | Outpatient Surgery |
| Blue Cross Blue Shield | 365 days | 90 days | Varies by state |
| Cigna | 180 days | 90 days | — |
| Humana | 365 days | 60 days | — |

### Rule Types
- Filing Deadline
- Auth Required (with CPT code ranges)
- Modifier Rules
- Bundling Rules
- Documentation Requirements

### Contact Information
- Provider services phone
- Fax numbers
- Portal URLs
- Mailing addresses

---

## 14. Staff Performance Metrics

### Per-User Tracking
- Claims worked (total, this week, today)
- $ recovered (total, this month)
- Average days to resolve
- Quality check pass rate
- Success rate (claims paid after correction)
- Productivity score (0-100 composite)

### Gamification
- Leaderboard ranking
- Badges: Speed Demon ⚡, Money Maker 💰, Quality King 👑, Century Club 💯, High Roller 🎯, Streak Master 🔥
- Working streak tracking
- Trend indicators (up/down/stable)

### Team Metrics
- Total claims worked
- Total recovered
- Average productivity score
- Monthly recovery goal with progress bar
- Top performer highlight

---

## 15. Natural Language Search

### Supported Filters
| Filter Type | Example Query |
|-------------|--------------|
| Payer | "Aetna denials", "UHC claims" |
| Amount | "over $1000", "under $500", "between $100 and $5000" |
| Date | "last month", "past 30 days", "this week", "today" |
| Category | "coding errors", "authorization", "bundling" |
| Status | "new denials", "corrected", "closed" |
| Priority | "critical priority" |
| Correctability | "correctable", "not correctable" |
| Appeal | "needing appeal" |
| CARC Code | "CO-16", "PR-1" |
| Sorting | "highest value", "newest", "oldest" |
| Limit | "top 10", "first 5" |

### Features
- Pre-built suggestion chips
- Real-time filter interpretation display
- Click any result to navigate to denial detail
- Shows total count and amount

---

## 16. Authentication & RBAC

### Roles
| Role | Permissions |
|------|-------------|
| Admin | All permissions |
| Manager | View, analyze, correct, appeal, assign, export, manage rules, batch process |
| Biller | View, analyze, correct, appeal, notes, export, financials, scrub |
| Coder | View, analyze, correct, quality check, notes, scrub |
| Client | View denials, view reports, export, view financials |

### Default Users
- admin@denialmanagement.com (Admin)
- manager@denialmanagement.com (Manager - Sarah Johnson)
- biller@denialmanagement.com (Biller - Mike Chen)
- coder@denialmanagement.com (Coder - Jessica Williams)
- client@example.com (Client - Dr. Robert Smith)

---

## 17. Audit Trail

### Tracked Actions
create, update, delete, view, analyze, correct, quality_check, appeal_create, appeal_send, appeal_update, note_add, assign, export, login, logout, batch_start, batch_complete, payment_record, scrub_run

### Audit Fields
- Timestamp, User, Action, Entity Type, Entity ID
- Old values / New values (for updates)
- IP Address, User Agent
- Additional metadata (JSON)

### HIPAA Compliance
- Every action logged
- Immutable audit trail
- Filterable by user, action, entity, date range

---

## 18. Export & Reporting

### Export Formats
- **CSV**: Full denial data with all fields
- **JSON**: Structured export with metadata
- **Summary Text**: Human-readable report with category/payer breakdowns

### Export Filters
- By status
- By category
- By specific denial IDs
- By date range

---

## 19. ERA/835 File Support

### Parsing Capabilities
- ANSI X12 835 segment parsing (ISA, BPR, TRN, CLP, SVC, CAS, etc.)
- Auto-detection of segment/element delimiters
- Transaction-level grouping
- Service-line level adjustment extraction
- RARC remark code extraction

### Auto-Import
- Denied claims automatically imported as denial records
- CARC code extraction from CAS segments
- Payer name/ID from N1 segments
- Patient name from NM1 segments
- Paid vs denied amount calculation

---

## 20. Batch Processing

### Supported Job Types
- Batch Analyze (run AI analysis on multiple denials)
- Batch Correct (generate corrections for multiple denials)
- Batch Quality Check (validate multiple corrections)

### Features
- Progress tracking (processed/total/failed)
- Cancel in-progress jobs
- Error logging per item
- Audit trail integration

---

## 21. Notes & Collaboration

### Note Types
- General
- Internal
- Escalation
- Payer Contact
- Resolution

### Features
- Pin important notes
- Author tracking with timestamp
- Delete capability
- Per-denial organization

---

## 22. Resubmission Intelligence

### Learning Engine
- 18 pre-seeded historical outcome records
- Records new outcomes for continuous learning
- Tracks: payer + CARC + correction type → outcome

### Predictions
- Predicted success rate for proposed corrections
- Confidence level based on data volume
- Positive/negative/neutral factors explained
- Alternative strategy suggestions

### Payer Profiles
- Success rate per payer
- Best correction types per payer
- Worst correction types per payer
- Trend analysis (improving/declining)

### Insights Generation
- Effective strategies identification
- Ineffective strategies flagging
- Payer difficulty warnings
- Value-based recommendations
- Timely filing recovery analysis

---

## 23. API Reference

### Core APIs
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/denials` | GET/POST | List/create denials |
| `/api/denials/[id]` | GET/PATCH | Get/update single denial |
| `/api/denials/[id]/analyze` | POST | Run AI analysis |
| `/api/denials/[id]/correct` | POST | Generate corrections |
| `/api/denials/[id]/smart-correct` | POST | Smart coding correction |
| `/api/denials/[id]/resolve-eligibility` | POST | Eligibility resolution |
| `/api/denials/[id]/quality-check` | POST | Quality validation |
| `/api/upload` | POST | CSV upload |
| `/api/upload/era` | POST | ERA/835 upload |
| `/api/upload/overview` | POST/PATCH | Overview scan |

### Management APIs
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/appeals` | GET/POST/PATCH | Appeal management |
| `/api/notes` | GET/POST/PATCH/DELETE | Notes CRUD |
| `/api/batch` | GET/POST/DELETE | Batch job management |
| `/api/financials` | GET/POST/DELETE | Financial events |
| `/api/payer-rules` | GET/POST/PATCH/DELETE | Payer rules CRUD |
| `/api/scrub` | GET/POST/PATCH | Claim scrubbing |
| `/api/export` | GET | Data export (CSV/JSON/TXT) |
| `/api/intelligence` | GET/POST | Resubmission intelligence |
| `/api/health-scan` | GET/POST | Client health report |

### Dashboard APIs
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/dashboard` | GET | Dashboard stats |
| `/api/dashboard?view=worklist` | GET | AI-ranked worklist |
| `/api/dashboard?view=prevention` | GET | Prevention alerts |
| `/api/dashboard?view=followup` | GET | Follow-up tasks |
| `/api/dashboard?view=appeal-deadlines` | GET | Appeal deadlines |
| `/api/dashboard?view=staff-metrics` | GET | Staff performance |
| `/api/dashboard?view=nl-query&q=...` | GET | Natural language search |

### System APIs
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth` | GET/POST | Authentication |
| `/api/audit` | GET | Audit trail |

---

## 24. Data Model

### Primary Entities (Prisma Schema)
- **User** (id, email, name, role, department, sessions)
- **Denial** (id, claimNumber, patient, payer, provider, codes, amounts, status, priority, deadlines)
- **DenialAnalysis** (1:1 with Denial - AI analysis results)
- **CorrectionSuggestion** (1:1 with Denial - correction details)
- **QualityCheck** (1:1 with Denial - validation results)
- **AppealLetter** (many per Denial - generated letters)
- **DenialNote** (many per Denial - staff notes)
- **AuditLog** (system-wide activity log)
- **PayerRule** (payer-specific configurations)
- **FinancialTracking** (payment/write-off events)
- **DenialAssignment** (worklist assignments)
- **ClaimScrubRule** (prevention rules)
- **ClaimScrubResult** (scrub findings)
- **OverviewReport** (batch scan reports)
- **BatchJob** (async processing jobs)

### Supported CARC Codes
CO-4, CO-11, CO-15, CO-16, CO-18, CO-22, CO-27, CO-29, CO-50, CO-109, CO-197, PR-1, PR-2, PR-3, OA-23

---

## Navigation Structure

### Main (7 items)
Upload & Scan → Dashboard → Denial Queue → AI Worklist → AI Agents → Search → Health Scan

### Management (6 items)
Appeals → Follow-ups → Deadlines → Prevention → Claim Scrub → Financials

### System (3 items)
Payer Rules → Staff Metrics → Audit Log

### Denial Detail (7 tabs)
Analysis → Correction → Smart Correct → Eligibility → Quality → Appeal → Notes

---

## Environment Variables Required

```env
DATABASE_URL=file:./dev.db
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_ENDPOINT=your-endpoint
AZURE_OPENAI_MODEL=gpt-5.5
```

---

*Document generated: May 12, 2026*
*Version: 2.0 (Phase 2 + Phase 3)*
*Repository: github.com/sriraajj-lab/denial-management*
*Branch: feature/phase2-full-rcm-features*
