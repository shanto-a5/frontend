"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listTasks, myTasks, type TaskWithAssignments } from "@/lib/api/tasks";
import { ApiError } from "@/lib/api/client";
import { useCompany } from "@/components/CompanyProvider";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import {
  AssignmentStateBadge,
  PresentationBadge,
  PriorityBadge,
  TaskStateBadge,
} from "@/components/tasks/StatusBadges";
import { dueLabel, formatInstant, relativeFromNow } from "@/lib/format";
import type { MyAssignment } from "@/lib/api/types";

/**
 * `/tasks` serves both roles (the nav labels it accordingly): the boss gets
 * the company-wide task board with status/upcoming filters; the employee gets
 * their own released list. Filtering is delegated to the server for the boss
 * (query params) and to the server's release gate for the employee
 * (`/my/tasks` never serializes unreleased rows).
 */

function BossTaskList({ timezone }: { timezone: string }) {
  const [tasks, setTasks] = useState<TaskWithAssignments[] | null>(null);
  const [status, setStatus] = useState<"" | "open" | "cancelled">("");
  const [upcoming, setUpcoming] = useState<"" | "true" | "false">("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await listTasks({
        status: status === "" ? undefined : status,
        upcoming: upcoming === "" ? undefined : upcoming === "true",
      });
      setError("");
      setTasks(result.tasks);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load tasks.");
      setTasks([]);
    }
  }, [status, upcoming]);

  useEffect(() => {
    // state changes land only after the await (react-hooks/set-state-in-effect)
    void (async () => {
      await load();
    })();
  }, [load]);

  if (tasks === null) return <Loading label="Loading tasks…" />;

  return (
    <>
      {error && (
        <Alert tone="danger" title="Could not load tasks" role="alert">
          {error}
        </Alert>
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-44">
            <Select
              label="Status"
              value={status}
              onChange={(e) => {
                // event handlers may reset synchronously — the effect only
                // touches state after the network await
                setTasks(null);
                setStatus(e.target.value as typeof status);
              }}
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </div>
          <div className="w-44">
            <Select
              label="Release"
              value={upcoming}
              onChange={(e) => {
                setTasks(null);
                setUpcoming(e.target.value as typeof upcoming);
              }}
            >
              <option value="">All</option>
              <option value="false">Released</option>
              <option value="true">Upcoming</option>
            </Select>
          </div>
        </div>
      </Card>

      {tasks.length === 0 ? (
        <EmptyState
          title="No tasks match."
          hint="Create a task to assign work with a clear deadline and release moment."
          action={
            <Link href="/tasks/new">
              <Button>Create a task</Button>
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {tasks.map((task) => (
            <li key={task.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/tasks/${task.id}`}
                        className="text-base font-semibold text-ink hover:underline"
                      >
                        {task.title}
                      </Link>
                      <TaskStateBadge state={task.state} />
                      <PriorityBadge priority={task.priority} />
                      {task.frozen && <span className="text-xs text-ink-muted">Locked (submissions exist)</span>}
                    </p>
                    <p className="mt-1 text-sm text-ink-muted">
                      Released {formatInstant(task.releasesAt, timezone)} ·{" "}
                      {dueLabel(task.dueAt, timezone)} ({relativeFromNow(task.dueAt)})
                    </p>
                  </div>
                  <Link href={`/tasks/${task.id}`}>
                    <Button variant="secondary" size="sm">
                      Open
                    </Button>
                  </Link>
                </div>
                {task.assignments.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
                    {task.assignments.map((assignment) => (
                      <li key={assignment.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-ink">{assignment.assigneeName}</span>
                        <AssignmentStateBadge state={assignment.state} />
                        <span className="text-ink-muted">
                          due {formatInstant(assignment.effectiveDueAt, timezone)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function EmployeeTaskList({ rows, timezone }: { rows: MyAssignment[]; timezone: string }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing is waiting for you."
        hint="Tasks your boss releases appear here automatically."
      />
    );
  }
  return (
    <Card>
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/tasks/${row.id}`}
              className="flex flex-wrap items-center gap-3 py-3 transition-colors hover:bg-canvas"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  {row.next && (
                    <span className="rounded bg-primary-soft px-1.5 py-0.5 text-xs font-semibold text-primary-soft-ink">
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
        ))}
      </ul>
    </Card>
  );
}

export default function TasksPage() {
  const router = useRouter();
  const { company, isBoss, status: companyStatus } = useCompany();
  const [rows, setRows] = useState<MyAssignment[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (companyStatus === "none") router.replace("/onboarding");
  }, [companyStatus, router]);

  useEffect(() => {
    if (companyStatus !== "ready" || isBoss) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await myTasks();
        if (!cancelled) setRows(result.assignments);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof ApiError ? caught.message : "Could not load your tasks.");
          setRows([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyStatus, isBoss]);

  if (companyStatus === "loading" || companyStatus === "none") {
    return <Loading label="Loading…" />;
  }
  if (!isBoss && rows === null) {
    return error ? (
      <Alert tone="danger" title="Could not load tasks" role="alert">
        {error}
      </Alert>
    ) : (
      <Loading label="Loading your tasks…" />
    );
  }

  const timezone = company?.timezone ?? "Asia/Dhaka";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">{isBoss ? "Tasks" : "My tasks"}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {isBoss
              ? "Every task in this company, newest first."
              : "Everything released to you, ordered by the server."}
          </p>
        </div>
        {isBoss && (
          <Link href="/tasks/new">
            <Button>Create a task</Button>
          </Link>
        )}
      </header>

      {error && !isBoss && (
        <Alert tone="danger" title="Could not load tasks" role="alert">
          {error}
        </Alert>
      )}
      {isBoss ? (
        <BossTaskList timezone={timezone} />
      ) : (
        <EmployeeTaskList rows={rows ?? []} timezone={timezone} />
      )}
    </div>
  );
}
