"use client";

import { use, useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  cancelTask,
  getAssignment,
  getTask,
  setAssignmentOverride,
  updateTask,
  type AssignmentDetailResponse,
  type TaskWithAssignments,
} from "@/lib/api/tasks";
import { ApiError } from "@/lib/api/client";
import { useCompany } from "@/components/CompanyProvider";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input, Textarea, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  AssignmentStateBadge,
  PresentationBadge,
  PriorityBadge,
  SubmissionStatusBadge,
  TaskStateBadge,
} from "@/components/tasks/StatusBadges";
import { SubmissionForm } from "@/components/tasks/SubmissionForm";
import { EvidenceViewer } from "@/components/tasks/EvidenceViewer";
import { ActivityTimeline } from "@/components/tasks/ActivityTimeline";
import { dueLabel, formatInstant, relativeFromNow, toWallClockInput } from "@/lib/format";
import {
  RELEASE_OFFSET_PRESETS,
  type ActivityEvent,
  type SubmissionWithEvidence,
  type Task,
  type TaskPriority,
} from "@/lib/api/types";

/**
 * Task detail, resolved by role (plan §4): the boss reads `GET /tasks/:id`
 * (task + every assignment + task-scoped history) and may edit shared fields
 * until the first submission freezes them, cancel the task, or override one
 * assignee's deadline. The employee reads `GET /assignments/:id` — the
 * server allows only their own row (404 for anyone else's, never 403) — and
 * sees their slice: instructions, effective deadline, state, history.
 *
 * Navigation contract: rows coming from a boss surface carry a task id; rows
 * from `/my/tasks` carry the caller's assignment id. The URL is opaque here —
 * it is fetched through whichever endpoint the role permits.
 */

type Loaded =
  | { kind: "task"; task: TaskWithAssignments; activity: ActivityEvent[]; scheduled: boolean }
  | { kind: "assignment"; payload: AssignmentDetailResponse; scheduled: boolean };

type ReleaseMode = "keep" | "preset" | "custom";

const INPUT_CLASSES =
  "min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink " +
  "focus-visible:outline-2 focus-visible:outline-primary";

function TaskMeta({
  task,
  timezone,
  scheduled,
  overrideNote,
}: {
  task: Task;
  timezone: string;
  /** Whether the release moment is still ahead — computed once at load. */
  scheduled: boolean;
  overrideNote?: string;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <TaskStateBadge state={task.state} />
        <PriorityBadge priority={task.priority} />
        {scheduled && task.state === "open" && <Badge tone="info">Not yet released</Badge>}
      </div>
      <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-ink-muted">Deadline</dt>
          <dd className="mt-0.5 text-ink">
            <span className="font-medium">{formatInstant(task.dueAt, timezone)}</span>
            <span className="block text-ink-muted">
              {dueLabel(task.dueAt, timezone)} · {relativeFromNow(task.dueAt)}
            </span>
            {overrideNote && <span className="mt-1 block text-ink-muted">{overrideNote}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Visible to employees</dt>
          <dd className="mt-0.5 text-ink">
            <span className="font-medium">{formatInstant(task.releasesAt, timezone)}</span>
            <span className="block text-ink-muted">{relativeFromNow(task.releasesAt)}</span>
          </dd>
        </div>
      </dl>
      {task.instructions && (
        <div className="mt-4 border-t border-line pt-4">
          <h2 className="text-sm font-medium text-ink">Instructions</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{task.instructions}</p>
        </div>
      )}
    </Card>
  );
}

/**
 * The attempts of one assignment, newest first (M6). Each attempt is immutable
 * and shows its own verdict, so an employee can always see what they submitted
 * and what the boss said about it. Evidence bytes stay private: the viewer
 * fetches a short-lived signed URL on demand (plan §5.5).
 */
function AttemptsCard({
  submissions,
  timezone,
  emptyHint,
}: {
  submissions: SubmissionWithEvidence[];
  timezone: string;
  emptyHint?: string;
}) {
  return (
    <Card>
      <CardTitle>Your submissions</CardTitle>
      <CardDescription>
        Every attempt is kept exactly as you sent it — nothing is overwritten.
      </CardDescription>
      {submissions.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">{emptyHint ?? "You have not submitted yet."}</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-5">
          {submissions.map((submission) => (
            <li key={submission.id} className="rounded-xl border border-line bg-surface-low p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">Attempt {submission.attempt}</span>
                <SubmissionStatusBadge status={submission.status} />
                <span className="text-xs text-ink-muted">
                  {formatInstant(submission.createdAt, timezone)}
                </span>
              </div>
              {submission.description && (
                <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">
                  {submission.description}
                </p>
              )}
              <div className="mt-3 rounded-lg border border-line bg-surface p-3">
                <EvidenceViewer evidence={submission.evidence} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { company, isBoss, status: companyStatus } = useCompany();
  const timezone = company?.timezone ?? "Asia/Dhaka";

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // boss edit panel
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [releaseMode, setReleaseMode] = useState<ReleaseMode>("keep");
  const [presetDays, setPresetDays] = useState<number>(1);
  const [customRelease, setCustomRelease] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [editError, setEditError] = useState<ApiError | null>(null);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      if (isBoss) {
        const result = await getTask(id);
        setPageError("");
        setMissing(false);
        setLoaded({
          kind: "task",
          task: result.task,
          activity: result.activity,
          scheduled: Date.parse(result.task.releasesAt) > Date.now(),
        });
        const seeded: Record<string, string> = {};
        for (const assignment of result.task.assignments) {
          seeded[assignment.id] = toWallClockInput(
            assignment.dueAtOverride ?? result.task.dueAt,
            timezone,
          );
        }
        setOverrides(seeded);
      } else {
        const result = await getAssignment(id);
        setPageError("");
        setMissing(false);
        setLoaded({
          kind: "assignment",
          payload: result,
          scheduled: Date.parse(result.task.releasesAt) > Date.now(),
        });
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        setLoaded(null);
        setPageError("");
        setMissing(true);
      } else {
        setLoaded(null);
        setPageError(caught instanceof ApiError ? caught.message : "Could not load this task.");
      }
    }
  }, [id, isBoss, timezone]);

  useEffect(() => {
    if (companyStatus === "none") router.replace("/onboarding");
  }, [companyStatus, router]);

  useEffect(() => {
    if (companyStatus !== "ready") return;
    // state changes land only after the await (react-hooks/set-state-in-effect)
    void (async () => {
      await load();
    })();
  }, [companyStatus, load]);
  const openEdit = () => {
    if (loaded?.kind !== "task") return;
    const task = loaded.task;
    setTitle(task.title);
    setInstructions(task.instructions);
    setDueAt(toWallClockInput(task.dueAt, timezone));
    setPriority(task.priority);
    setReleaseMode("keep");
    setCustomRelease("");
    setEditError(null);
    setLocalErrors({});
    setEditing(true);
  };

  const onSaveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (loaded?.kind !== "task") return;

    const problems: Record<string, string> = {};
    if (!title.trim()) problems.title = "Give the task a title.";
    if (!dueAt) problems.dueAt = "Pick a deadline.";
    if (releaseMode === "custom" && customRelease && customRelease >= dueAt) {
      problems.releasesAt = "The release moment must be before the deadline.";
    }
    setLocalErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setBusy("edit");
    setEditError(null);
    try {
      await updateTask(loaded.task.id, {
        title: title.trim(),
        instructions,
        dueAt,
        priority,
        ...(releaseMode === "preset" ? { releaseOffsetDays: presetDays } : {}),
        ...(releaseMode === "custom" ? { releasesAt: customRelease } : {}),
      });
      setEditing(false);
      setNotice("Task updated.");
      await load();
    } catch (caught) {
      setEditError(caught instanceof ApiError ? caught : null);
      if (!(caught instanceof ApiError) || !caught.fields?.length) {
        setPageError(caught instanceof ApiError ? caught.message : "Could not update the task.");
      }
    } finally {
      setBusy(null);
    }
  };

  const onCancelTask = async () => {
    if (loaded?.kind !== "task") return;
    setBusy("cancel");
    try {
      const result = await cancelTask(loaded.task.id);
      setConfirmCancel(false);
      setNotice(
        `Task cancelled — ${result.cancelledAssignments} assignment(s) stopped; ${result.approvedUntouched} approved left untouched.`,
      );
      await load();
    } catch (caught) {
      setConfirmCancel(false);
      setPageError(caught instanceof ApiError ? caught.message : "Could not cancel the task.");
    } finally {
      setBusy(null);
    }
  };

  const onSaveOverride = async (assignmentId: string, explicit?: string) => {
    // explicit value wins over the input state (used by "Clear override");
    // an empty field means "no override" — the server restores the task due
    const value = explicit ?? overrides[assignmentId] ?? "";
    setBusy(`override:${assignmentId}`);
    setPageError("");
    try {
      await setAssignmentOverride(assignmentId, value || null);
      setNotice(value ? "Assignment deadline updated." : "Override cleared.");
      await load();
    } catch (caught) {
      setPageError(caught instanceof ApiError ? caught.message : "Could not update the deadline.");
    } finally {
      setBusy(null);
    }
  };

  if (companyStatus === "loading" || companyStatus === "none") return <Loading label="Loading…" />;
  if (loaded === null && !missing && !pageError) return <Loading label="Loading task…" />;

  if (missing) {
    return (
      <EmptyState
        title="Task not found."
        hint="It may belong to another company, or it never existed — either way it stays invisible to you."
        action={
          <Link href="/tasks">
            <Button variant="secondary">Back to tasks</Button>
          </Link>
        }
      />
    );
  }

  if (!loaded) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="danger" title="Could not load this task" role="alert">
          {pageError}
        </Alert>
        <Link href="/tasks">
          <Button variant="secondary">Back to tasks</Button>
        </Link>
      </div>
    );
  }

  const editField = (field: string): string | undefined =>
    localErrors[field] ?? editError?.fieldError(field);

  /* ---------------------------------------------------------------- */
  /* boss view: task + all assignments + controls                      */
  /* ---------------------------------------------------------------- */
  if (loaded.kind === "task") {
    const task = loaded.task;
    const frozen = task.frozen;
    const cancelled = task.state === "cancelled";

    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">{task.title}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {task.assignmentCount} assignment(s) · created {formatInstant(task.createdAt, timezone)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!cancelled && (
              <Button variant="secondary" onClick={openEdit} disabled={frozen}>
                Edit
              </Button>
            )}
            {!cancelled && (
              <Button variant="danger" onClick={() => setConfirmCancel(true)}>
                Cancel task
              </Button>
            )}
          </div>
        </header>

        {notice && (
          <Alert tone="success" title="Done" role="status">
            {notice}
          </Alert>
        )}
        {pageError && (
          <Alert tone="danger" title="Something went wrong" role="alert">
            {pageError}
          </Alert>
        )}
        {frozen && !cancelled && (
          <Alert tone="info" title="Shared fields are locked">
            At least one employee has submitted, so the title, instructions, deadline, release
            moment and priority are frozen (plan §4.1). Per-assignment deadlines below can still
            be adjusted.
          </Alert>
        )}

        {editing && (
          <Card>
            <CardTitle>Edit task</CardTitle>
            <CardDescription>Changes are recorded in the history for every assignee.</CardDescription>
            <form onSubmit={onSaveEdit} noValidate className="mt-4 flex flex-col gap-4">
              <Input
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                error={editField("title")}
                required
              />
              <Textarea
                label="Instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                error={editField("instructions")}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={`Deadline (${timezone})`}
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  error={editField("dueAt")}
                  required
                />
                <Select
                  label="Priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  error={editField("priority")}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </Select>
              </div>

              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium text-ink">Release moment</legend>
                <p className="text-sm text-ink-muted">
                  Current release: {formatInstant(task.releasesAt, timezone)}
                </p>
                {(["keep", "preset", "custom"] as const).map((mode) => (
                  <label key={mode} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="radio"
                      name="editReleaseMode"
                      checked={releaseMode === mode}
                      onChange={() => setReleaseMode(mode)}
                      className="size-4 accent-primary"
                    />
                    {mode === "keep" && "Keep the current release moment"}
                    {mode === "preset" && "Recompute from the deadline"}
                    {mode === "custom" && "Set a specific moment"}
                  </label>
                ))}
                {releaseMode === "preset" && (
                  <div className="ml-6 flex flex-col gap-1">
                    {RELEASE_OFFSET_PRESETS.map((days) => (
                      <label key={days} className="flex items-center gap-2 text-sm text-ink">
                        <input
                          type="radio"
                          name="editPresetDays"
                          checked={presetDays === days}
                          onChange={() => setPresetDays(days)}
                          className="size-4 accent-primary"
                        />
                        {days} day{days === 1 ? "" : "s"} before the deadline
                      </label>
                    ))}
                  </div>
                )}
                {releaseMode === "custom" && (
                  <div className="ml-6 max-w-sm">
                    <Input
                      label={`Release moment (${timezone})`}
                      type="datetime-local"
                      value={customRelease}
                      onChange={(e) => setCustomRelease(e.target.value)}
                      error={editField("releasesAt")}
                      required
                    />
                  </div>
                )}
              </fieldset>

              <div className="flex gap-2">
                <Button type="submit" loading={busy === "edit"}>
                  Save changes
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Discard
                </Button>
              </div>
            </form>
          </Card>
        )}

        <TaskMeta task={task} timezone={timezone} scheduled={loaded.scheduled} />

        <Card>
          <CardTitle>Assignments</CardTitle>
          <CardDescription>
            Each person has their own row; the deadline override below changes only that row.
          </CardDescription>
          <ul className="mt-4 divide-y divide-line">
            {task.assignments.map((assignment) => (
              <li key={assignment.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {assignment.assigneeName}
                  </span>
                  <AssignmentStateBadge state={assignment.state} />
                  <PresentationBadge
                    state={assignment.presentationState}
                    workflowState={assignment.state}
                  />
                </div>
                <p className="text-sm text-ink-muted">
                  Effective deadline:{" "}
                  <span className="font-medium text-ink">
                    {formatInstant(assignment.effectiveDueAt, timezone)}
                  </span>
                  {assignment.dueAtOverride && (
                    <span> (task deadline: {formatInstant(task.dueAt, timezone)})</span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`override-${assignment.id}`}>
                    New deadline for {assignment.assigneeName}
                  </label>
                  <input
                    id={`override-${assignment.id}`}
                    type="datetime-local"
                    className={INPUT_CLASSES + " max-w-56"}
                    value={overrides[assignment.id] ?? ""}
                    onChange={(e) =>
                      setOverrides((current) => ({ ...current, [assignment.id]: e.target.value }))
                    }
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy === `override:${assignment.id}`}
                    onClick={() => void onSaveOverride(assignment.id)}
                  >
                    Update deadline
                  </Button>
                  {assignment.dueAtOverride && (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busy === `override:${assignment.id}`}
                      onClick={() => void onSaveOverride(assignment.id, "")}
                    >
                      Clear override
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <ActivityTimeline activity={loaded.activity} timezone={timezone} />

        <Modal
          open={confirmCancel}
          title="Cancel this task?"
          onClose={() => setConfirmCancel(false)}
          footer={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
                Keep it
              </Button>
              <Button variant="danger" loading={busy === "cancel"} onClick={onCancelTask}>
                Cancel task
              </Button>
            </div>
          }
        >
          <p>
            Everyone stops working on it: assigned, submitted and change-requested rows become
            cancelled, while approved work stays approved. This cannot be undone from here.
          </p>
        </Modal>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* employee view: own assignment                                     */
  /* ---------------------------------------------------------------- */
  const { assignment, task, activity, submissions } = loaded.payload;
  const hasOverride = Boolean(assignment.dueAtOverride ?? assignment.revisedDueAt);
  const scheduled = loaded.scheduled;
  // The server is the authority on whether work can be submitted; the client
  // mirrors it so the form only appears when the action is actually legal
  // (`assigned`/`changes_requested`, task still open).
  const canSubmit = task.state === "open" && (assignment.state === "assigned" || assignment.state === "changes_requested");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink">{task.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PresentationBadge state={assignment.presentationState} workflowState={assignment.state} />
            <AssignmentStateBadge state={assignment.state} />
            <PriorityBadge priority={task.priority} />
            {scheduled && <Badge tone="info">Not yet released</Badge>}
          </div>
        </div>
      </header>

      {assignment.state === "changes_requested" && (() => {
        // The most recent attempt carries the boss's request; it is rendered
        // prominently (not just in the history) because it is the employee's
        // next action and outranks every other item in their queue (plan §4.3).
        const latestRequest = submissions.find(
          (attempt) => attempt.reviewAction?.action === "changes_requested",
        )?.reviewAction;
        return (
          <Alert tone="warning" title="Your boss asked for changes" role="status">
            <span className="block whitespace-pre-line">
              {latestRequest?.message ?? "Open the latest attempt below to read the request."}
            </span>
            {latestRequest?.revisedDueAt && (
              <span className="mt-2 block text-sm">
                New deadline: {formatInstant(latestRequest.revisedDueAt, timezone)} ·{" "}
                {relativeFromNow(latestRequest.revisedDueAt)}
              </span>
            )}
          </Alert>
        );
      })()}

      <TaskMeta
        task={task}
        timezone={timezone}
        scheduled={scheduled}
        overrideNote={
          hasOverride
            ? `Your deadline was adjusted — the shared task deadline is ${formatInstant(task.dueAt, timezone)}.`
            : undefined
        }
      />

      <Card>
        <CardTitle>Your deadline</CardTitle>
        <p className="mt-2 text-lg font-semibold text-ink">
          {formatInstant(assignment.effectiveDueAt, timezone)}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          {dueLabel(assignment.effectiveDueAt, timezone)} ·{" "}
          {relativeFromNow(assignment.effectiveDueAt)}
        </p>
        {assignment.state === "submitted" && (
          <p className="mt-3 text-sm text-ink-muted">
            Waiting with your boss — submitted work does not claim the Next slot.
          </p>
        )}
        {assignment.state === "changes_requested" && (
          <p className="mt-3 text-sm text-ink-muted">
            Your boss asked for changes; this task is first in your queue.
          </p>
        )}
      </Card>

      {canSubmit && <SubmissionForm assignmentId={assignment.id} onSubmitted={() => void load()} />}

      {!canSubmit && assignment.state === "submitted" && (
        <Alert tone="info" title="Waiting for review">
          Your submission is with your boss. You will be able to submit a revised attempt if changes
          are requested.
        </Alert>
      )}
      {!canSubmit && assignment.state === "approved" && (
        <Alert tone="success" title="Approved">
          Your boss approved this work. Nothing further is needed.
        </Alert>
      )}

      <AttemptsCard submissions={submissions} timezone={timezone} />

      <ActivityTimeline activity={activity} timezone={timezone} />

      <Link href="/dashboard">
        <Button variant="ghost">Back to dashboard</Button>
      </Link>
    </div>
  );
}
