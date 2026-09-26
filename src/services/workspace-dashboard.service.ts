import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db, withWorkspaceContext } from '../database/client';
import { paymentRequests, plans, subscriptions } from '../database/schema/subscriptions';
import { workspaceMembers, workspaces } from '../database/schema/workspaces';
import type {
  WorkspaceDashboardMonthlyFinance,
  WorkspaceDashboardQuery,
  WorkspaceDashboardToday,
} from '../types/workspace';
import { deriveSubscriptionAccessState } from './subscription-access.service';
import { resolveWorkspaceEntitlements } from './workspace-entitlements.service';

/** A compact, member-safe view of the active workspace for the coaching home. */
function parseDashboardAggregate<T>(value: string): T {
  return JSON.parse(value) as T;
}

export async function getWorkspaceDashboardSummary(
  workspaceId: string,
  query: WorkspaceDashboardQuery
) {
  const [
    workspaceResult,
    entitlementsResult,
    memberCountResult,
    latestPaymentResult,
    operationalResult,
    trendResult,
  ] = await Promise.all([
    db
      .select({
        name: workspaces.name,
        status: workspaces.status,
        subscriptionId: subscriptions.id,
        subscriptionStatus: subscriptions.status,
        startsAt: subscriptions.startsAt,
        expiresAt: subscriptions.expiresAt,
        trialEndsAt: subscriptions.trialEndsAt,
        renewalDueAt: subscriptions.renewalDueAt,
        planName: plans.name,
      })
      .from(workspaces)
      .leftJoin(
        subscriptions,
        and(
          eq(subscriptions.workspaceId, workspaces.id),
          eq(
            subscriptions.createdAt,
            sql`(select max(s2.created_at) from subscriptions s2 where s2.workspace_id = ${workspaces.id})`
          )
        )
      )
      .leftJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(workspaces.id, workspaceId))
      .limit(1),
    resolveWorkspaceEntitlements(workspaceId),
    db
      .select({ total: count() })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId)),
    db
      .select({
        status: paymentRequests.status,
        createdAt: paymentRequests.createdAt,
        reviewedAt: paymentRequests.reviewedAt,
      })
      .from(paymentRequests)
      .where(
        and(
          eq(paymentRequests.workspaceId, workspaceId),
          eq(paymentRequests.purpose, 'subscription')
        )
      )
      .orderBy(desc(paymentRequests.createdAt))
      .limit(1),
      withWorkspaceContext(workspaceId, async (transaction) => {
      const result = await transaction.execute<{
        activeStudents: string;
        activeBatches: string;
        activeTeachers: string;
        today: string;
        monthlyFinance: string;
      }>(sql`
          with filter as (
            select
              coalesce(${query.month ?? null}::date, date_trunc('month', current_timestamp at time zone 'Asia/Dhaka')::date) as month_start,
              ${query.batchId ?? null}::uuid as batch_id,
              (current_timestamp at time zone 'Asia/Dhaka')::date as today
          ),
          scheduled_batches as (
            select b.id, b.name
            from batches b, filter f
            where b.workspace_id = ${workspaceId}::uuid
              and b.status = 'active'
              and (f.batch_id is null or b.id = f.batch_id)
          ),
          today_sessions as (
            select s.id, s.status
            from attendance_sessions s
            inner join scheduled_batches b on b.id = s.batch_id
            cross join filter f
            where s.workspace_id = ${workspaceId}::uuid and s.session_date = f.today
          ),
          attendance as (
            select
              count(distinct s.id)::text as session_count,
              count(distinct s.id) filter (where s.status = 'finalized')::text as finalized_session_count,
              count(distinct s.id) filter (where s.status = 'draft')::text as draft_session_count,
              count(r.id) filter (where r.status = 'present')::text as present_count,
              count(r.id) filter (where r.status = 'absent')::text as absent_count
            from today_sessions s
            left join attendance_records r
              on r.attendance_session_id = s.id and r.workspace_id = ${workspaceId}::uuid
          ),
          finance as (
            select
              (
                select coalesce(sum(p.amount), 0)::numeric(19, 2)::text
                from student_payments p
                cross join filter f
                left join student_fees sf
                  on sf.id = p.student_fee_id and sf.workspace_id = p.workspace_id
                left join batch_enrollments be
                  on be.id = sf.enrollment_id and be.workspace_id = sf.workspace_id
                where p.workspace_id = ${workspaceId}::uuid
                  and p.payment_date >= f.month_start
                  and p.payment_date < f.month_start + interval '1 month'
                  and (f.batch_id is null or be.batch_id = f.batch_id)
              ) as collected_fees,
              (
                select coalesce(sum(sf.due_amount), 0)::numeric(19, 2)::text
                from student_fees sf
                cross join filter f
                inner join batch_enrollments be
                  on be.id = sf.enrollment_id and be.workspace_id = sf.workspace_id
                where sf.workspace_id = ${workspaceId}::uuid
                  and sf.fee_month = f.month_start
                  and (f.batch_id is null or be.batch_id = f.batch_id)
              ) as outstanding_fees,
              (
                select coalesce(sum(p.amount), 0)::numeric(19, 2)::text
                from teacher_salary_payments p
                cross join filter f
                where p.workspace_id = ${workspaceId}::uuid
                  and p.payment_date >= f.month_start
                  and p.payment_date < f.month_start + interval '1 month'
              ) as paid_salaries,
              (
                select coalesce(sum(e.amount), 0)::numeric(19, 2)::text
                from expenses e
                cross join filter f
                where e.workspace_id = ${workspaceId}::uuid
                  and e.status = 'active'
                  and e.expense_date >= f.month_start
                  and e.expense_date < f.month_start + interval '1 month'
              ) as expenses
          )
          select
            (select count(*)::text from students where workspace_id = ${workspaceId}::uuid and status = 'active') as "activeStudents",
            (select count(*)::text from batches where workspace_id = ${workspaceId}::uuid and status = 'active') as "activeBatches",
            (select count(*)::text from teachers where workspace_id = ${workspaceId}::uuid and status = 'active') as "activeTeachers",
            json_build_object(
              'date', (select today::text from filter),
              'scheduledBatchCount', (select count(*) from scheduled_batches),
              'batches', coalesce((select json_agg(json_build_object('id', b.id, 'name', b.name, 'classDays', '[]'::json, 'status', coalesce(s.status::text, 'not_started')) order by b.name) from scheduled_batches b left join attendance_sessions s on s.batch_id = b.id and s.workspace_id = ${workspaceId}::uuid and s.session_date = (select today from filter)), '[]'::json),
              'attendance', json_build_object(
                'sessionCount', (select session_count::integer from attendance),
                'finalizedSessionCount', (select finalized_session_count::integer from attendance),
                'draftSessionCount', (select draft_session_count::integer from attendance),
                'presentCount', (select present_count::integer from attendance),
                'absentCount', (select absent_count::integer from attendance)
              ),
              'recentActivity', coalesce((select json_agg(activity order by "createdAt" desc) from (select 'payment' as type, 'Fee payment received' as title, p.amount::text as context, p.created_at as "createdAt", '/dashboard/fees' as href from student_payments p where p.workspace_id = ${workspaceId}::uuid union all select 'notice', n.subject, n.audience::text, n.created_at, '/dashboard/notices' from notices n where n.workspace_id = ${workspaceId}::uuid union all select 'student', 'Student added', s.full_name, s.created_at, '/dashboard/students' from students s where s.workspace_id = ${workspaceId}::uuid order by 4 desc limit 6) activity), '[]'::json)
            )::text as today,
            json_build_object(
              'month', (select month_start::text from filter),
              'collectedFees', collected_fees,
              'outstandingFees', outstanding_fees,
              'paidSalaries', paid_salaries,
              'expenses', expenses,
              'netCashFlow', (collected_fees::numeric - paid_salaries::numeric - expenses::numeric)::numeric(19, 2)::text
            )::text as "monthlyFinance"
          from finance
        `);
        return result.rows[0];
      }),
      withWorkspaceContext(workspaceId, async (transaction) => {
        const result = await transaction.execute<{ trend: string }>(sql`
          select coalesce(json_agg(json_build_object('month', month::text, 'collectedFees', amount::text) order by month), '[]'::json)::text as trend
          from (
            select calendar.month::date as month, coalesce(sum(p.amount), 0)::numeric(19,2) as amount
            from generate_series(
              (date_trunc('month', coalesce(${query.month ?? null}::date, (current_timestamp at time zone 'Asia/Dhaka')::date)) - interval '5 months')::date,
              date_trunc('month', coalesce(${query.month ?? null}::date, (current_timestamp at time zone 'Asia/Dhaka')::date))::date,
              interval '1 month'
            ) calendar(month)
            left join student_payments p
              on p.workspace_id = ${workspaceId}::uuid
              and p.payment_date >= calendar.month::date
              and p.payment_date < (calendar.month::date + interval '1 month')
            group by calendar.month
          ) trend`);
        return result.rows[0]?.trend ?? '[]';
      }),
  ]);

  const workspace = workspaceResult[0];
  if (!workspace) return null;

  const access = deriveSubscriptionAccessState({
    workspaceStatus: workspace.status,
    subscription: workspace.subscriptionStatus
      ? {
          status: workspace.subscriptionStatus,
          startsAt: workspace.startsAt,
          expiresAt: workspace.expiresAt,
          trialEndsAt: workspace.trialEndsAt,
        }
      : null,
  });

  const entitlementEntries = Object.entries(entitlementsResult.entitlements).map(
    ([key, entitlement]) => ({
      key,
      enabled: entitlement.enabled,
      limit: entitlement.limit?.toString() ?? null,
    })
  );

  return {
    workspace: { id: workspaceId, name: workspace.name, status: workspace.status },
    access,
    subscription: workspace.subscriptionId
      ? {
          status: workspace.subscriptionStatus,
          planName: workspace.planName,
          startsAt: workspace.startsAt,
          expiresAt: workspace.expiresAt,
          trialEndsAt: workspace.trialEndsAt,
          renewalDueAt: workspace.renewalDueAt,
        }
      : null,
    memberCount: Number(memberCountResult[0]?.total ?? 0),
    entitlements: entitlementEntries,
    latestPayment: latestPaymentResult[0] ?? null,
    operational: {
      activeStudents: Number(operationalResult?.activeStudents ?? 0),
      activeBatches: Number(operationalResult?.activeBatches ?? 0),
      activeTeachers: Number(operationalResult?.activeTeachers ?? 0),
      today: parseDashboardAggregate<WorkspaceDashboardToday>(operationalResult?.today ?? '{}'),
      monthlyFinance: parseDashboardAggregate<WorkspaceDashboardMonthlyFinance>(
        operationalResult?.monthlyFinance ?? '{}'
      ),
    },
    monthlyCollections: parseDashboardAggregate<{ month: string; collectedFees: string }[]>(trendResult),
  };
}
