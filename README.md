# EduFlow — Backend REST API

<p align="left">
  <a href="https://eduflowe.vercel.app"><img src="https://img.shields.io/badge/Live%20Platform-eduflowe.vercel.app-bef264?style=for-the-badge&logo=vercel&logoColor=000" alt="Live Demo" /></a>
  <a href="https://github.com/YeasarArefin/EduFlow_frontend"><img src="https://img.shields.io/badge/Frontend%20Repo-EduFlow_frontend-black?style=for-the-badge&logo=github" alt="Frontend Repo" /></a>
</p>

<p align="left">
  <img src="https://img.shields.io/badge/Node.js%2020-LTS-339933?style=flat-square&logo=nodedotjs" alt="Node.js" />
  <img src="https://img.shields.io/badge/Express-v5-000000?style=flat-square&logo=express" alt="Express" />
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/ORM-Drizzle%20ORM-C5F74F?style=flat-square" alt="Drizzle ORM" />
  <img src="https://img.shields.io/badge/Database-PostgreSQL%20%2B%20RLS-336791?style=flat-square&logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Auth-Better%20Auth-orange?style=flat-square" alt="Better Auth" />
  <img src="https://img.shields.io/badge/Queue-RabbitMQ-FF6600?style=flat-square&logo=rabbitmq" alt="RabbitMQ" />
  <img src="https://img.shields.io/badge/Tests-Vitest%20%2B%20Supertest-6E9F18?style=flat-square&logo=vitest" alt="Vitest" />
  <img src="https://img.shields.io/badge/API%20Spec-OpenAPI%203.0-85EA2D?style=flat-square&logo=openapiinitiative&logoColor=000" alt="OpenAPI" />
</p>

This repository powers **EduFlow** — a multi-tenant coaching center management SaaS designed as a resilient, modular monolith. It provides high-throughput, strictly audited REST endpoints for academic routines, fee collections, payroll, SMS gateways, and subscription management.

> [!NOTE]
> **Looking for the Web Application?** The Next.js 15 App Router frontend, TanStack Query server-state management, and ORBIT design system UI for EduFlow are located in the companion repository: **[EduFlow_frontend](https://github.com/YeasarArefin/EduFlow_frontend)**.

---

## 🚀 Live Demo & API Consumer Credentials

Test the live application connected to this backend service:

🔗 **Production Web App:** [https://eduflowe.vercel.app](https://eduflowe.vercel.app)

| Account Type | Email | Password | Scope |
|---|---|---|---|
| **Platform Admin** | `admin@eduflow.app` | `12345678` | Global SaaS control plane: plan configuration, manual payment reviews, tenant lifecycle & revenue metrics. |
| **Workspace Owner** | `yeasararefin007@gmail.com` | `12345678` | Coaching Center Owner view: student rosters, batch schedules, fee collections, attendance, SMS wallet & staff roles. |

---

## 🏛️ System Architecture

EduFlow adopts a **Modular Monolith** pattern: single deployable Express API process, separate asynchronous worker process, and PostgreSQL as the single source of truth.

```text
┌──────────────────────────────────────────────────────────┐
│  Next.js Frontend (Vercel)                               │
└─────────────────────────┬────────────────────────────────┘
                          │ HTTPS /api/v1/* (Cookies)
┌─────────────────────────▼────────────────────────────────┐
│  Express API Application (Render)                        │
│                                                          │
│  Routes → Middleware → Controllers → Services → Drizzle  │
│                                                          │
│  Auth → Workspace → Entitlement → Permission → Handler   │
└───────┬─────────────────┬────────────────────────────────┘
        │                 │
   Supabase          RabbitMQ
   PostgreSQL  ──▶   Worker Process (Render)
   + RLS            ├─▶ Nodemailer / Brevo (Email Delivery)
   + Storage        └─▶ External SMS Gateway

Render Cron ──▶ Discovers due tasks ──▶ Enqueues to RabbitMQ
```

---

## 🛡️ Core Security & Engineering Highlights

### 1. Three-Layer Multi-Tenant Isolation
Tenant isolation is non-negotiable. Data cross-contamination is eliminated through three redundant defenses:
1. **Server-Side Session Resolution:** The client is **never trusted** for `workspaceId`. It is always extracted directly from the verified session identity on the server.
2. **Drizzle Scoping:** All tenant domain queries mandate `.where(eq(table.workspaceId, workspaceId))`.
3. **PostgreSQL Row-Level Security (RLS):** Database-level security policies enforce tenant constraints via `app.workspace_id`, ensuring queries cannot leak records even in the event of an application logic bug.

### 2. Dual Authorization Engine: Entitlements vs Permissions
EduFlow cleanly decouples two distinct access control systems:
- **Entitlements (Platform Owner → Workspace):** Defines subscription capabilities (student quotas, teacher limits, feature flags). Calculated via `effective_limit = max(plan_limit, workspace_override)`.
- **Permissions (Workspace Owner → Staff Members):** Granular role-based access matrix across 8 functional modules (`students`, `teachers`, `batches`, `attendance`, `fees`, `salaries`, `members`, `settings`). Supports member-level overrides while protecting the Workspace Owner (`101`) from privilege degradation.

### 3. Session Security & Active Device Limit
- **2 Concurrent Devices Maximum:** Enforced at both the Better Auth hook layer (`databaseHooks.session.create.before`) and via a PostgreSQL advisory lock trigger (`enforce_session_limit()`).
- **Graceful Takeover Flow:** When the limit is reached, the API rejects login with a 403 `SESSION_LIMIT_REACHED` payload containing active device labels and IPs. A public `/api/v1/sessions/takeover` endpoint verifies credentials, revokes older sessions, and issues a valid session cookie.
- **Security Tokens Concealment:** Sensitive session tokens are transmitted solely through secure HTTP-only cookies and never serialized into JSON response bodies.

### 4. Financial Integrity (Zero Floating-Point Math)
- All currency operations use **BDT** with exact database storage (`NUMERIC(19,2)`).
- Student payment transactions are **immutable** — historical payment rows are never modified or deleted.
- Auto-generated receipt numbers enforce workspace-prefixed sequencing: `${workspace_prefix}-${YYYYMM}-${seq}`.

---

## 🔄 Request Pipeline

Every incoming request passes through a strictly typed, sequential middleware pipeline:

```text
Request
  │
  ├── 1. requireAuth           -> Validates Better Auth session cookie
  ├── 2. resolveWorkspace      -> Resolves active tenant context from session
  ├── 3. checkEntitlement      -> Enforces subscription quota & feature flags
  ├── 4. checkPermission       -> Validates caller role & explicit action permissions
  ├── 5. validate(zodSchema)   -> Validates and sanitizes request parameters & body
  │
  └── Controller Execution     -> Coordinates service layer calls and formats HTTP response
        │
        └── Service Layer      -> Houses domain rules, transactions, and Drizzle queries
```

---

## 📦 Domain Modules Overview

| Domain | Key Responsibilities |
|---|---|
| **Auth & Security** | Better Auth integration, password reset token lifecycles, 2-device concurrency limits, session revocation. |
| **Workspace & Onboarding** | Tenant creation, plan selection, initial workspace settings provisioning, time-zone alignment. |
| **Students** | Comprehensive student records, guardian profiles, tag indexing, status transitions, batch enrollment histories. |
| **Batches & Schedules** | Academic batch creation, teacher assignments, weekly schedule definitions, student enrollment adjustments. |
| **Teachers** | Staff records, compensation schedules, batch allocations, NID verification. |
| **Student Fees** | Monthly fee generation, multi-channel payment records (Cash, bKash, Nagad), auto-generated printable receipts. |
| **Teacher Salaries** | Monthly compensation ledgers, partial disbursements, expense ledger sync. |
| **Attendance Engine** | Class-day validation, session drafts, immutable finalization lock, asynchronous guardian notifications. |
| **Notices & Bulletins** | Workspace-wide and batch-targeted announcements with React Email templating. |
| **SMS Wallet & Messaging** | Per-tenant prepaid ledger, transactional debit reservations, Unicode/Bangla segmentation logic. |
| **Expenses** | Categorized overhead records, financial reversals, net profit aggregation. |
| **Platform Administration** | SaaS plan CRUD, manual payment verification queue, workspace suspension and deletion queues. |

---

## 🗄️ Database Architecture & Migrations

- **ORM:** Drizzle ORM — explicit SQL-like syntax with zero hidden runtime overhead.
- **Migration History:** 49 ordered, non-destructive SQL migrations located in `drizzle/`.
- **Primary Keys:** UUIDv4 generated at database layer (`gen_random_uuid()`).
- **Composite Indexes:** Every foreign key column is indexed to maintain sub-millisecond query planning under multi-tenant joins.

---

## 🧪 Testing & Reliability

The test suite runs against a live PostgreSQL database instance using Vitest and Supertest:

```bash
# Build TypeScript prior to test execution
npm run build

# Run all test suites
npm test

# Run specific functional suites
npm run test:session-management
npm run test:auth
```

### Coverage Highlights
- **`session-management.test.mjs` (11/11 Passing):** Verifies 1st/2nd session authorization, 3rd session lockout, credential takeover, device revocation, and automatic expired-session exclusions.
- **`rls-isolation.test.mjs`:** Asserts strict boundary enforcement preventing tenant data leaks.
- **`student-fee-api.test.mjs`:** Validates transactional fee recalculations and receipt sequence integrity.
- **`subscription-lifecycle-e2e.test.mjs`:** Tests tenant checkout, admin approval, and quota adjustments.

---

## 📖 API Documentation

The complete API contract is documented under **OpenAPI 3.0** in [`openapi.yaml`](./openapi.yaml):
- Comprehensive parameter schemas matching backend Zod definitions.
- Required session authentication and permission codes for each route.
- Structured response formats and error response schemas (`{ error: { code, message } }`).

---

## 🛠️ Local Development Setup

### Prerequisites
- Node.js 20+
- PostgreSQL instance running on port `5432` or `5433` (Docker Compose supported)
- RabbitMQ instance (optional for local non-async testing)

### Installation & Startup

```bash
# 1. Clone repository
git clone https://github.com/YeasarArefin/EduFlow_backend.git
cd EduFlow_backend

# 2. Install dependencies
npm install

# 3. Environment configuration
cp .env.example .env

# 4. Run database migrations
npm run db:migrate

# 5. Seed initial authorization roles & super-admin
npm run db:seed

# 6. Start development server (Port 4000)
npm run dev
```

---

## 🔗 Architecture Repositories

| Repository | Scope & Technologies | Link |
|---|---|---|
| **EduFlow Backend** | Express 5, TypeScript, Drizzle ORM, PostgreSQL RLS, Better Auth, RabbitMQ | *This Repository* |
| **EduFlow Frontend** | Next.js 15, React Server Components, TanStack Query, shadcn/ui, ORBIT Design System | [github.com/YeasarArefin/EduFlow_frontend](https://github.com/YeasarArefin/EduFlow_frontend) |

---

## 👨‍💻 Author & Engineering Contact

Built with dedication to clean code, robust architecture, and high-fidelity UX by **Yeasar Arefin**.

<table border="0">
  <tr>
    <td width="100" align="center" valign="middle">
      <img src="https://github.com/YeasarArefin.png" width="90" height="90" style="border-radius: 50%;" alt="Yeasar Arefin" />
    </td>
    <td>
      <strong>Yeasar Arefin</strong><br/>
      <em>Full-Stack & Systems Software Engineer</em><br/><br/>
      🌐 <strong>Portfolio:</strong> <a href="https://yeasararefin.vercel.app">yeasararefin.vercel.app</a><br/>
      📬 <strong>Direct Contact:</strong> <a href="mailto:yeasar.arefin.contact@gmail.com">yeasar.arefin.contact@gmail.com</a><br/>
      🐙 <strong>GitHub Profile:</strong> <a href="https://github.com/YeasarArefin">@YeasarArefin</a>
    </td>
  </tr>
</table>
