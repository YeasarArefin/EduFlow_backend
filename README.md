<p align="center">
  <img src="../frontend/public/logo.png" alt="EduFlow Logo" width="120" />
</p>

<h1 align="center">EduFlow — Backend API</h1>

<p align="center">
  <strong>Production-ready Express + TypeScript REST API powering EduFlow — a multi-tenant coaching-center management SaaS.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Runtime-Node.js%2020-339933?logo=nodedotjs" alt="Node.js" />
  <img src="https://img.shields.io/badge/Framework-Express-000000?logo=express" alt="Express" />
  <img src="https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/ORM-Drizzle-C5F74F" alt="Drizzle ORM" />
  <img src="https://img.shields.io/badge/Database-PostgreSQL%20%2B%20Supabase-336791?logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Auth-Better%20Auth-orange" alt="Better Auth" />
  <img src="https://img.shields.io/badge/Queue-RabbitMQ-FF6600?logo=rabbitmq" alt="RabbitMQ" />
  <img src="https://img.shields.io/badge/Tests-Vitest%20%2B%20Supertest-6E9F18?logo=vitest" alt="Vitest" />
  <img src="https://img.shields.io/badge/Deploy-Render-46E3B7" alt="Render" />
</p>

---

> **This is the backend repository.** The frontend lives at [EduFlow_frontend](https://github.com/YeasarArefin/EduFlow_frontend).

---

## Table of Contents

- [What is EduFlow?](#what-is-eduflow)
- [API Overview](#api-overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Request Pipeline](#request-pipeline)
- [Multi-Tenancy & Security](#multi-tenancy--security)
- [Authorization Model](#authorization-model)
- [Domain Modules](#domain-modules)
- [Database Design](#database-design)
- [Async Processing](#async-processing)
- [Backend Structure](#backend-structure)
- [Getting Started (Local Dev)](#getting-started-local-dev)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [API Documentation](#api-documentation)
- [Key Engineering Decisions](#key-engineering-decisions)

---

## What is EduFlow?

EduFlow is a **multi-tenant SaaS** for individual tutors and small-to-medium coaching centers in Bangladesh. This repository is the backend — a Node.js + Express REST API that handles:

- Authentication & session management (Better Auth)
- Multi-tenant workspace isolation (PostgreSQL RLS + application-level scoping)
- Two-layer authorization: **entitlements** (platform plan limits) + **permissions** (workspace role access)
- All business domain operations: students, batches, teachers, fees, salaries, attendance, communication, SMS wallet
- Platform Owner administration: plans, payment review, subscription lifecycle, workspace management
- Async email & SMS delivery via RabbitMQ workers

---

## API Overview

- All application endpoints live under `/api/v1/`
- Health check at `/health`
- Full OpenAPI 3.0 specification in [`openapi.yaml`](./openapi.yaml)
- Every protected endpoint requires: **auth cookie → workspace resolution → entitlement check → permission check**

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 20 |
| **Framework** | Express 5 + TypeScript |
| **ORM** | Drizzle ORM (type-safe, SQL-like, zero magic) |
| **Database** | PostgreSQL (Supabase-hosted) with Row-Level Security |
| **Auth** | Better Auth (sessions, email+password, password reset, email verification) |
| **Validation** | Zod (request schemas, all external input) |
| **Queue** | RabbitMQ (async email, SMS, absence notifications, reminders) |
| **Email** | Nodemailer + Gmail / Brevo |
| **SMS** | Abstracted provider contract (swappable) |
| **Logging** | Pino (structured JSON logs) |
| **Error Tracking** | Sentry |
| **Security** | Helmet, CORS, rate limiting, secure cookies |
| **Testing** | Vitest + Supertest + Testcontainers |
| **Migrations** | Drizzle Kit (generated, ordered, never hand-edited) |
| **Deploy** | Render (API server + worker + cron) |

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Next.js Frontend (Vercel)                               │
└─────────────────────────┬────────────────────────────────┘
                          │ HTTPS /api/v1/*
┌─────────────────────────▼────────────────────────────────┐
│  Express API (Render)                                    │
│                                                          │
│  Routes → Middleware → Controllers → Services → Drizzle  │
│                                                          │
│  Auth → Workspace → Entitlement → Permission → Handler   │
└───────┬─────────────────┬────────────────────────────────┘
        │                 │
   Supabase          RabbitMQ
   PostgreSQL  ──▶   Worker (Render)
   + RLS            ├─▶ Nodemailer / Gmail (email)
   + Storage        └─▶ SMS Provider

Render Cron ──▶ Discovers pending work ──▶ Enqueues to RabbitMQ
```

---

## Request Pipeline

Every API request flows through this exact chain — no shortcuts:

```
Route
  └─▶ requireAuth           (validates Better Auth session cookie)
       └─▶ resolveWorkspace      (resolves workspace_id from session, never client)
            └─▶ checkEntitlement     (validates plan limits / feature flags)
                 └─▶ checkPermission      (validates workspace role permissions)
                      └─▶ validate(schema)     (Zod request body/query validation)
                           └─▶ Controller          (reads validated input, calls service)
                                └─▶ Service             (domain logic, Drizzle queries)
                                     └─▶ PostgreSQL          (RLS enforced)
```

The client is **never trusted** for `workspaceId` — it is always resolved from the authenticated session on the server.

---

## Multi-Tenancy & Security

Tenant isolation is enforced at **three independent layers**:

### 1. Application Layer
- `workspaceId` resolved exclusively from the authenticated server session
- Every service function receives and filters by `workspaceId` as a required parameter

### 2. Drizzle ORM Layer
- Every workspace-owned table query includes `.where(eq(table.workspaceId, workspaceId))`
- No cross-tenant queries are possible without explicitly passing a different `workspaceId`

### 3. PostgreSQL Row-Level Security
- All tenant tables have `ENABLE ROW LEVEL SECURITY`
- Policies enforce `workspace_id = current_setting('app.workspace_id')::uuid`
- Even a compromised query cannot read another tenant's data at the DB level

### Additional Security Measures
- Better Auth session cookies (httpOnly, secure, sameSite)
- Helmet (security headers), CORS (origin whitelist), rate limiting
- Zod validation on all external input
- Audit logging for business-significant actions (payment edits, permission changes, suspension, etc.)
- Session limit: max 2 active sessions per user, enforced by Better Auth hook + DB trigger

---

## Authorization Model

EduFlow has **two completely separate authorization systems** that must not be conflated:

### Entitlements (Platform → Workspace)
Controlled by the Platform Owner. Defines what a workspace *can do* based on their subscription plan:
- Student/teacher/batch/SMS quotas
- Feature flags (e.g. CSV import, bulk SMS)
- Per-workspace overrides: `effective_limit = max(plan_limit, workspace_override)`

### Permissions (Workspace Owner → Members)
Controlled by the Workspace Owner. Defines what a workspace member *is allowed to do*:

| Role | Code | Authority |
|---|---|---|
| Platform Owner | system | Full platform access, unconditional |
| Workspace Owner | 101 | Full workspace access, always allowed |
| Admin | 201 | Custom permission set, no defaults |
| Teacher | 301 | Limited academic access |
| Staff | 401 | Admin/payment/communication access |

**8 permission modules:** `students`, `teachers`, `batches`, `attendance`, `fees`, `salaries`, `members`, `settings`

Each module has granular actions (e.g. `students.view`, `students.create`, `students.import`). Members can have per-permission overrides on top of their role defaults. The Owner role (`101`) is always protected — it can never be downgraded, suspended, or removed.

---

## Domain Modules

| Module | Key Capabilities |
|---|---|
| **Auth** | Email+password registration, email verification, login/logout, password reset (30-min tokens), session management (2-device limit, individual + bulk revocation) |
| **Workspace Onboarding** | Create workspace, select plan, complete setup — one-time provisioning flow |
| **Students** | CRUD + archive, bulk CSV import (parse → validate → preview → quota check → import), profile, guardian info, enrollment/fee/attendance history |
| **Batches** | CRUD + archive, recurring schedules (weekday selection, Quick Presets), teacher assignment, student enrollment with fee overrides/discounts, enrollment history |
| **Teachers** | CRUD + archive, batch assignments, salary info, NID, specialties |
| **Student Fees** | Monthly ledger generation, partial/full payment recording (cash/bKash/Nagad/Rocket), auto-generated receipts, immutable payment history, BDT `NUMERIC(19,2)` |
| **Teacher Salaries** | Monthly ledger, partial payment, yearly totals, history |
| **Attendance** | Draft/finalize sessions, bulk status save, class-day-aware validation, finalized-session immutability, absence notification queue |
| **Notices** | Workspace-wide / batch-specific / targeted, idempotent recipient queue, email delivery via Brevo, retry with cap |
| **SMS Wallet** | Per-workspace credit balance, immutable ledger (purchase / usage / bonus / refund / admin_adjustment), atomic debit reservation, GSM-7/Unicode segment calculation |
| **SMS** | Bulk compose, template rendering (Bangla/English, safe variable substitution), delivery logs, provider abstraction |
| **Communication** | Email + SMS sends, scheduling, automation triggers, delivery tracking |
| **Expenses** | Categorized expense records, reversal/audit history, financial aggregates |
| **Platform Owner** | Plan CRUD, payment review queue, workspace activation/suspension/deletion, entitlement overrides, revenue overview, audit activity |
| **Sessions** | Active device listing, individual revocation, bulk logout, credential-based takeover |
| **Settings** | Workspace profile, academic setup (classes/mediums/groups/subjects), fee config, communication settings, notification preferences |

---

## Database Design

- **49 applied migrations** (Drizzle Kit, never hand-edited)
- **UUIDs** for all EduFlow domain PKs
- **BDT money** stored as `NUMERIC(19,2)` in taka (no float, no currency column — BDT is implicit)
- **Timestamps** as `TIMESTAMPTZ` (UTC), displayed in `Asia/Dhaka` by the application
- **Every FK column has an index** (Postgres doesn't auto-index FKs)
- **Financial/audit records are never deleted** — archived, voided, or soft-deleted
- **RLS on all tenant tables** — policies enforced at the DB level

Key tables: `workspaces`, `workspace_members`, `workspace_roles`, `workspace_role_permissions`, `plans`, `subscriptions`, `payment_requests`, `students`, `batches`, `batch_students`, `batch_teachers`, `student_fees`, `student_payments`, `teacher_salaries`, `attendance_sessions`, `attendance_records`, `notices`, `notice_recipients`, `sms_wallets`, `sms_transactions`, `sms_messages`, `expenses`, `audit_logs`

---

## Async Processing

Long-running or external operations never block the API. They are handed to RabbitMQ:

| Task | Trigger |
|---|---|
| Absence notifications (email/SMS to guardians) | Attendance finalized |
| Notice email delivery | Notice queued |
| Fee/subscription reminders | Render Cron → RabbitMQ |
| Bulk SMS sends | SMS compose confirmed |
| Provider retries | Failed delivery detected |

Workers must be **idempotent** — duplicate processing must not double-send or double-charge.

Render Cron handles time-based triggers (subscription expiry checks, renewal reminders, workspace deletion scheduling, fee due reminders) — discovers work and enqueues to RabbitMQ rather than doing it inline.

---

## Backend Structure

```
backend/
├── src/
│   ├── app.ts                    # Express app setup
│   ├── server.ts                 # Entry point
│   ├── auth.ts                   # Better Auth configuration + hooks
│   ├── config/                   # Environment-backed config
│   ├── controllers/              # HTTP input/output — no business logic
│   ├── database/
│   │   ├── client.ts             # Drizzle client
│   │   ├── schema/               # Table definitions (Drizzle)
│   │   ├── relations/            # Drizzle relations
│   │   └── seed/                 # Authorization seed data
│   ├── lib/                      # Shared infrastructure (Pino logger, etc.)
│   ├── middleware/               # Auth, workspace, entitlement, permission, error
│   ├── routes/
│   │   ├── health.routes.ts
│   │   └── v1/                   # All application routes under /api/v1
│   ├── services/                 # Domain business logic, Drizzle queries, mappers
│   ├── types/                    # Central backend TypeScript types
│   └── validation/               # Zod schemas for all request input
├── drizzle/                      # Generated SQL migrations + snapshots
├── test/                         # Integration tests (Vitest + Supertest)
│   ├── session-management.test.mjs
│   ├── auth.test.mjs
│   ├── student-api.test.mjs
│   └── ...                       # 36+ test files
├── openapi.yaml                  # Full OpenAPI 3.0 specification
└── drizzle.config.ts
```

---

## Getting Started (Local Dev)

### Prerequisites

- Node.js 20+
- PostgreSQL running locally (or Docker)
- RabbitMQ (optional — only needed for async features like absence notifications)

### Setup

```bash
# Clone
git clone https://github.com/YeasarArefin/EduFlow_backend.git
cd EduFlow_backend

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env — see Environment Variables below

# Run database migrations
npm run db:migrate

# Seed platform owner + permissions
npm run db:seed

# Start dev server (port 4000)
npm run dev
```

### Docker (PostgreSQL only)

```bash
docker compose up -d postgres
```

---

## Environment Variables

```env
# Server
PORT=4000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/eduflow

# Better Auth
BETTER_AUTH_SECRET=your-secret-here
BETTER_AUTH_URL=http://localhost:4000

# Frontend (CORS)
FRONTEND_URL=http://localhost:3000

# Email (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password

# Brevo (Notice emails)
BREVO_API_KEY=your-brevo-key
BREVO_FROM_EMAIL=noreply@yourdomain.com

# RabbitMQ (optional for local)
RABBITMQ_URL=amqp://localhost:5672

# Sentry (optional)
SENTRY_DSN=https://...
```

See [`.env.example`](./.env.example) for the full list with descriptions.

---

## Testing

```bash
# Build first (tests import from dist/)
npm run build

# Run all tests
npm test

# Run a specific test file
npm run test:session-management
npm run test:auth
```

**Test coverage highlights:**

| Test File | What it covers |
|---|---|
| `session-management.test.mjs` | 11 tests — device limit (1st/2nd OK, 3rd blocked), takeover, invalid credentials, individual revoke, expired sessions |
| `auth.test.mjs` | Sign-in, email verification, password reset |
| `student-api.test.mjs` | Student CRUD, quota checks, tenant isolation |
| `student-fee-api.test.mjs` | Fee generation, payment recording, receipt auto-generation |
| `attendance-api.test.mjs` | Session create, bulk mark, finalize, immutability |
| `rls-isolation.test.mjs` | Cross-tenant data leak prevention |
| `subscription-lifecycle-e2e.test.mjs` | Full subscription lifecycle (signup → payment → approve → access → expiry) |
| `teacher-api.test.mjs` | Teacher CRUD, salary records |
| `sms-wallet-api.test.mjs` | Wallet credits, immutable ledger, atomic debit |
| `saas-funnel-e2e.test.mjs` | End-to-end SaaS funnel from registration to workspace access |
| ...and 26 more | Comprehensive domain + security coverage |

---

## API Documentation

The full OpenAPI 3.0 spec is in [`openapi.yaml`](./openapi.yaml). It covers every frontend-facing endpoint with:
- HTTP method + path
- Authentication requirements
- Required permission
- Request body / query params (Zod-aligned schemas)
- Response shapes
- Error codes

Every new API endpoint **must** update `openapi.yaml` in the same commit.

---

## Key Engineering Decisions

### Modular Monolith, Not Microservices
Single deployable API (+ separate worker). Postgres is the source of truth. No service mesh, no Kafka, no inter-service HTTP calls. Simple, debuggable, deployable on a single Render instance.

### Drizzle ORM Over Prisma / TypeORM
Drizzle is SQL-first and type-safe with zero magic. Queries look like SQL, compile to SQL, and are inspectable at a glance. No hidden N+1, no lazy-loading footguns, no runtime schema reflection.

### Better Auth Over Rolling Your Own
Better Auth handles session cookies, CSRF protection, password hashing (bcrypt), email verification tokens, password reset tokens, and cookie rotation. The backend extends it with `databaseHooks` for the session device limit.

### Zod Everywhere
All external input — request body, query params, environment variables — is validated with Zod before touching business logic. Invalid input is rejected at the middleware layer with structured error responses.

### Financial Integrity
- All money in `NUMERIC(19,2)` — no float arithmetic
- Payment records are **immutable** — no `UPDATE` on historical payments
- Fee status recalculated transactionally on each payment
- SMS wallet uses atomic reservation → debit → ledger pattern — no bare balance mutation
- Audit log records every business-significant action with actor, timestamp, and before/after state

### Session Security
- Max 2 active sessions per user — enforced by Better Auth `databaseHooks.session.create.before` (throws `SESSION_LIMIT_REACHED` 403)
- Also enforced by PostgreSQL trigger `enforce_session_limit()` as a second independent safety net
- Credential-based takeover: `verifyPassword` → `revokeAllSessions` → `signInEmail({ asResponse: true })` → forward `Set-Cookie`
- Session tokens never appear in response bodies — only in `Set-Cookie` headers

### Never Trust the Client for Workspace Identity
`workspaceId` is always resolved server-side from the authenticated session. Any client-provided `workspaceId` in the request body or query string is ignored. This makes cross-tenant attacks structurally impossible at the application layer — not just a policy.

---

## Related Repositories

| Repository | Description |
|---|---|
| [EduFlow_frontend](https://github.com/YeasarArefin/EduFlow_frontend) | Next.js 15 frontend — App Router, TanStack Query, shadcn/ui, ORBIT design system |

---

<p align="center">Built with ❤️ by <a href="https://github.com/YeasarArefin">Yeasar Arefin</a></p>
