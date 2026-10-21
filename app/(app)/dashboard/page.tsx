"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { myTasks, getSummary } from "@/lib/api/tasks";
import { ApiError } from "@/lib/api/client";
import { useCompany } from "@/components/CompanyProvider";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { BossSummaryStrip, EmployeeSummaryStrip } from "@/components/tasks/SummaryStrip";import { PriorityBadge, PresentationBadge } from "@/components/tasks/StatusBadges";import { dueLabel, formatInstant, relativeFromNow } from "@/lib/format";
import type { MyAssignment, SummaryResponse } from "@/lib/api/types";

/**
 * The home surface after sign-in. Employees get their server-ranked work list
 * with the Next-task winner called out (the ranking itself is the server's —
 * plan §4.3 — the UI never re-sorts). Bosses additionally get a jump-off card
 * for the management screens. An account without a company is routed to
 * onboarding.
 */

function AssignmentRow({
  row,
  timezone,
  detailId,
}: {
  row: MyAssignment;
  timezone: string;
  detailId: string;
}) {
  return (
    <li>
      <Link
        href={`/tasks/${detailId}`}
        className="flex flex-wrap items-center gap-3 rounded-md px-3 py-3 transition-colors hover:bg-canvas"
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-sm font-medium text-ink">
            {row.next && (
              <span className="shrink-0 rounded bg-primary-soft px-1.5 py-0.5 text-xs font-semibold text-primary-soft-ink">
                Next
              </span>
            )}
            {row.task.title}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            Due {formatInstant(row.effectiveDueAt, timezone)} · {relativeFromNow(row.effectiveDueAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PriorityBadge priority={row.task.priority} />
          <PresentationBadge state={row.presentationState} workflowState={row.state} />
        </div>
      </Link>
    </li>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { company, isBoss, status: companyStatus } = useCompany();

  const [rows, setRows] = useState<MyAssignment[] | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (companyStatus === "none") router.replace("/onboarding");
  }, [companyStatus, router]);

  useEffect(() => {
    if (companyStatus !== "ready") return;
    let cancelled = false;
    void (async () => {
      try {
        // The list and the summary are independent reads; the summary is
        // best-effort so a summary hiccup never blanks the work list.
        const [result, summaryResult] = await Promise.all([
          myTasks(),
          getSummary().catch(() => null),
        ]);
        if (cancelled) return;
        setRows(result.assignments);
        setNextId(result.nextAssignmentId);
        setSummary(summaryResult);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : "Could not load your tasks.");
        setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyStatus]);

  if (companyStatus === "loading" || companyStatus === "none" || rows === null) {
    return <Loading label="Loading your workspace…" />;
  }

  const nextRow = rows.find((row) => row.id === nextId) ?? null;
  const others = rows.filter((row) => row.id !== nextId);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-muted">{company?.name}</p>
      </header>

      {error && (
        <Alert tone="danger" title="Could not load tasks" role="alert">
          {error}
        </Alert>
      )}

      {isBoss && (
        <Card>
          <CardTitle>Boss tools</CardTitle>
          <CardDescription>
            Assign work with clear deadlines, watch releases, and manage the team.
          </CardDescription>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/tasks/new">
              <Button>Create a task</Button>
            </Link>
            <Link href="/review">
              <Button variant="secondary">Review queue</Button>
            </Link>
            <Link href="/tasks">
              <Button variant="secondary">All tasks</Button>
            </Link>
            <Link href="/company">
              <Button variant="secondary">Company &amp; team</Button>
            </Link>
          </div>
        </Card>
      )}

      {isBoss && summary?.boss && <BossSummaryStrip summary={summary.boss} />}
      {summary?.employee && <EmployeeSummaryStrip summary={summary.employee} />}

      <section aria-labelledby="my-work-heading" className="flex flex-col gap-3">
        <h2 id="my-work-heading" className="text-base font-semibold text-ink">
          {isBoss ? "Your own work" : "My work"}
        </h2>

        {rows.length === 0 ? (
          <EmptyState
            title={isBoss ? "Nothing assigned to you." : "Nothing is waiting for you."}
            hint={
              isBoss
                ? "Tasks you assign to yourself appear here once released."
                : "Released tasks from your boss appear here automatically."
            }
          />
        ) : (
          <>
            {nextRow && (
              <Card className="border-primary/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      Next task
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-ink">{nextRow.task.title}</h3>
                    {nextRow.task.instructions && (
                      <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-ink-muted">
                        {nextRow.task.instructions}
                      </p>
                    )}
                    <p className="mt-2 text-sm text-ink-muted">
                      Due {formatInstant(nextRow.effectiveDueAt, company?.timezone)} ·{" "}
                      {dueLabel(nextRow.effectiveDueAt, company?.timezone)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <PresentationBadge state={nextRow.presentationState} workflowState={nextRow.state} />
                    <Link href={`/tasks/${isBoss ? nextRow.taskId : nextRow.id}`}>
                      <Button>Open task</Button>
                    </Link>
                  </div>
                </div>
              </Card>
            )}

            {others.length > 0 && (
              <Card>
                <ul className="divide-y divide-line">
                  {others.map((row) => (
                    <AssignmentRow
                      key={row.id}
                      row={row}
                      timezone={company?.timezone ?? "Asia/Dhaka"}
                      // the detail page resolves by role: bosses open the
                      // task id, employees their own assignment id (their
                      // read endpoint is /assignments/:id — plan §8.1)
                      detailId={isBoss ? row.taskId : row.id}
                    />
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </section>
    </div>
  );
}
