"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getReviewQueue } from "@/lib/api/review";
import { ApiError } from "@/lib/api/client";
import { useCompany } from "@/components/CompanyProvider";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { dueLabel, formatInstant, relativeFromNow } from "@/lib/format";
import type { ReviewQueueResponse } from "@/lib/api/types";

/**
 * The boss review queue (M7, plan §4.4, §6). Pending submissions come first,
 * strictly FIFO by submission time — the order is the server's and the UI never
 * re-sorts. A separate "out with the team" section lists assignments whose
 * latest state is `changes_requested`: those are not review items, they are
 * waiting on the employee.
 */

export default function ReviewQueuePage() {
  const router = useRouter();
  const { company, isBoss, status: companyStatus } = useCompany();

  const [queue, setQueue] = useState<ReviewQueueResponse | null>(null);
  const [error, setError] = useState("");
  const timezone = company?.timezone ?? "Asia/Dhaka";

  useEffect(() => {
    if (companyStatus === "none") router.replace("/onboarding");
  }, [companyStatus, router]);

  const load = useCallback(async () => {
    try {
      const result = await getReviewQueue();
      setError("");
      setQueue(result);
    } catch (caught) {
      setQueue(null);
      setError(caught instanceof ApiError ? caught.message : "Could not load the review queue.");
    }
  }, []);

  useEffect(() => {
    if (companyStatus !== "ready") return;
    void (async () => {
      await load();
    })();
  }, [companyStatus, load]);

  // Employees have no queue; send them home rather than showing an empty shell.
  useEffect(() => {
    if (companyStatus === "ready" && !isBoss) router.replace("/dashboard");
  }, [companyStatus, isBoss, router]);

  if (companyStatus === "loading" || companyStatus === "none" || (!queue && !error)) {
    return <Loading label="Loading the review queue…" />;
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="danger" title="Could not load the review queue" role="alert">
          {error}
        </Alert>
        <Button variant="secondary" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!queue) return null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Review queue</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {company?.name} · oldest submissions first
          </p>
        </div>
        <Badge tone={queue.items.length > 0 ? "info" : "neutral"}>
          {queue.items.length} waiting
        </Badge>
      </header>

      <Card>
        <CardTitle>Waiting for review</CardTitle>
        <CardDescription>
          {queue.items.length === 0
            ? "Nothing is waiting for you right now."
            : `${queue.items.length} submission(s), oldest first.`}
        </CardDescription>

        {queue.items.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">
            When an employee submits, it appears here for review.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {queue.items.map((item) => (
              <li key={item.submission.id} className="rounded-xl border border-line bg-surface-low p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/review/${item.assignment.id}`}
                        className="truncate text-base font-semibold text-ink hover:underline"
                      >
                        {item.task.title}
                      </Link>
                      {item.task.priority === "high" && <Badge tone="warning">High priority</Badge>}
                    </div>
                    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
                      <span className="font-medium text-ink">{item.assigneeName}</span>
                      <span aria-hidden="true">·</span>
                      <span>Attempt {item.submission.attempt}</span>
                      <span aria-hidden="true">·</span>
                      <span>submitted {relativeFromNow(item.submission.createdAt)}</span>
                      <span aria-hidden="true">·</span>
                      <Badge tone="info">
                        {item.evidence.length} item{item.evidence.length === 1 ? "" : "s"}
                      </Badge>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link href={`/tasks/${item.task.id}`}>
                      <Button variant="secondary" size="sm">
                        Quick view
                      </Button>
                    </Link>
                    <Link href={`/review/${item.assignment.id}`}>
                      <Button size="sm">Review now</Button>
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Out with the team</CardTitle>
        <CardDescription>Changes were requested; these are waiting on the employee.</CardDescription>
        {queue.awaitingEmployee.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">No revisions are in progress.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {queue.awaitingEmployee.map((row) => (
              <li key={row.assignment.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{row.task.title}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">
                    Due {formatInstant(row.assignment.effectiveDueAt, timezone)} ·{" "}
                    {dueLabel(row.assignment.effectiveDueAt, timezone)}
                  </p>
                </div>
                <Badge tone="warning">Changes requested</Badge>
                <Link href={`/review/${row.assignment.id}`}>
                  <Button size="sm" variant="secondary">
                    Open
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {queue.items.length === 0 && queue.awaitingEmployee.length === 0 && (
        <EmptyState
          title="The queue is clear."
          hint="Assign work or wait for a submission; everything you need to review will land here."
          action={
            <Link href="/tasks">
              <Button variant="secondary">Go to tasks</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
