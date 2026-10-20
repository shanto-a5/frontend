"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/lib/api/tasks";
import { listMembers } from "@/lib/api/company";
import { ApiError } from "@/lib/api/client";
import { useCompany } from "@/components/CompanyProvider";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input, Textarea, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Loading } from "@/components/ui/Loading";
import { RELEASE_OFFSET_PRESETS, type CompanyMember, type TaskPriority } from "@/lib/api/types";
import { cn } from "@/lib/cn";

/**
 * The boss's task form (plan §4.2): title, instructions, deadline, release
 * moment (presets {1,3,4} / custom / immediate), priority, multi-assignee.
 *
 * All wall-clock inputs are labelled with the COMPANY timezone and submitted
 * as naive "YYYY-MM-DDTHH:mm" strings — the server re-interprets them in the
 * same company zone (`parseInstant`), so what the boss types is exactly the
 * instant everyone shares, regardless of the browser's own timezone.
 */

type ReleaseMode = "now" | "preset" | "custom";

const PRESET_LABELS: Record<number, string> = {
  1: "1 day before the deadline",
  3: "3 days before the deadline",
  4: "4 days before the deadline",
};

export default function NewTaskPage() {
  const router = useRouter();
  const { company, status: companyStatus } = useCompany();
  const timezone = company?.timezone ?? "Asia/Dhaka";

  const [members, setMembers] = useState<CompanyMember[] | null>(null);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  // left empty on purpose: the deadline is a required, timezone-sensitive
  // field — the label names the company zone the server will apply
  const [dueAt, setDueAt] = useState("");
  const [releaseMode, setReleaseMode] = useState<ReleaseMode>("preset");
  const [presetDays, setPresetDays] = useState<number>(1);
  const [customRelease, setCustomRelease] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [assigneeIds, setAssigneeIds] = useState<Set<string>>(new Set());
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (companyStatus === "none") router.replace("/onboarding");
  }, [companyStatus, router]);

  useEffect(() => {
    if (companyStatus !== "ready") return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await listMembers();
        if (!cancelled) setMembers(result.members);
      } catch {
        if (!cancelled) setMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyStatus]);

  const serverError = (field: string): string | undefined => {
    if (!error) return undefined;
    const fromServer = error.fieldError(field);
    if (fromServer) return fromServer;
    return undefined;
  };

  const fieldError = (field: string): string | undefined => localErrors[field] ?? serverError(field);

  const toggleAssignee = (id: string) => {
    setAssigneeIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();

    // client-side checks are instant feedback only; the server re-validates
    const problems: Record<string, string> = {};
    if (!title.trim()) problems.title = "Give the task a title.";
    if (!dueAt) problems.dueAt = "Pick a deadline.";
    if (assigneeIds.size === 0) problems.assigneeIds = "Choose at least one person.";
    if (releaseMode === "custom" && dueAt && customRelease) {
      // both values are naive company wall clocks in the same zone, so a
      // lexicographic comparison is an exact chronological one (no DST here)
      if (customRelease >= dueAt) {
        problems.releasesAt = "The release moment must be before the deadline.";
      }
    }
    setLocalErrors(problems);
    if (Object.keys(problems).length > 0) return;

    setPending(true);
    setError(null);
    try {
      const body = {
        title: title.trim(),
        instructions,
        dueAt,
        priority,
        assigneeIds: [...assigneeIds],
        ...(releaseMode === "preset" ? { releaseOffsetDays: presetDays } : {}),
        ...(releaseMode === "custom" ? { releasesAt: customRelease } : {}),
      };
      const result = await createTask(body);
      router.push(`/tasks/${result.task.id}`);
      return; // keep the button busy during navigation
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : null);
      setPending(false);
    }
  };

  if (companyStatus === "loading" || companyStatus === "none") return <Loading label="Loading…" />;
  if (members === null) return <Loading label="Loading team…" />;

  const formError =
    error && !error.fields?.length
      ? error.message
      : error?.fields?.length
        ? "Please fix the highlighted fields."
        : "";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-ink">Create a task</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Deadlines and release moments are entered in company time ({timezone}).
        </p>
      </header>

      {formError && (
        <Alert tone="danger" title="Could not create the task" role="alert">
          {formError}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <CardTitle>Task</CardTitle>
          <Input
            label="Title"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={fieldError("title")}
            maxLength={200}
            required
          />
          <Textarea
            label="Instructions"
            name="instructions"
            description="What exactly should be done? Employees see this when the task is released."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            error={fieldError("instructions")}
            maxLength={5000}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={`Deadline (${timezone})`}
              name="dueAt"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              error={fieldError("dueAt")}
              required
            />
            <Select
              label="Priority"
              name="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              error={fieldError("priority")}
            >
              <option value="normal">Normal</option>
              <option value="high">High (sorts above normal at equal deadline)</option>
            </Select>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <CardTitle>When does it become visible?</CardTitle>
          <CardDescription>
            Employees cannot see a task before its release moment. Pick a preset relative to
            the deadline, a specific moment, or make it visible immediately.
          </CardDescription>

          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">Release moment</legend>
            {(["now", "preset", "custom"] as const).map((mode) => (
              <label key={mode} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="releaseMode"
                  value={mode}
                  checked={releaseMode === mode}
                  onChange={() => setReleaseMode(mode)}
                  className="mt-1 size-4 accent-primary"
                />
                <span className="text-sm text-ink">
                  {mode === "now" && "Visible immediately when created"}
                  {mode === "preset" && "Visible a set number of days before the deadline"}
                  {mode === "custom" && "Visible at a specific moment"}
                </span>
              </label>
            ))}
          </fieldset>

          {releaseMode === "preset" && (
            <div className="ml-6 flex flex-col gap-2">
              {RELEASE_OFFSET_PRESETS.map((days) => (
                <label key={days} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name="presetDays"
                    value={days}
                    checked={presetDays === days}
                    onChange={() => setPresetDays(days)}
                    className="size-4 accent-primary"
                  />
                  {PRESET_LABELS[days]}
                </label>
              ))}
            </div>
          )}

          {releaseMode === "custom" && (
            <div className="ml-6 max-w-sm">
              <Input
                label={`Release moment (${timezone})`}
                name="releasesAt"
                type="datetime-local"
                value={customRelease}
                onChange={(e) => setCustomRelease(e.target.value)}
                error={fieldError("releasesAt")}
                description="Must be before the deadline."
                required
              />
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <CardTitle>Assign to</CardTitle>
          <CardDescription>Everyone selected gets their own copy of this task.</CardDescription>
          {members.length === 0 ? (
            <p className="text-sm text-ink-muted">No members to assign yet.</p>
          ) : (
            <fieldset className="flex flex-col gap-1">
              <legend className="sr-only">Team members</legend>
              {members.map((member) => (
                <label
                  key={member.userId}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-2 py-2 hover:bg-canvas",
                    "focus-within:outline-2 focus-within:outline-primary",
                  )}
                >
                  <input
                    type="checkbox"
                    name="assigneeIds"
                    value={member.userId}
                    checked={assigneeIds.has(member.userId)}
                    onChange={() => toggleAssignee(member.userId)}
                    className="size-4 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{member.name}</span>
                    <span className="block truncate text-sm text-ink-muted">{member.email}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {fieldError("assigneeIds") && (
            <p className="text-sm text-danger" role="alert">
              {fieldError("assigneeIds")}
            </p>
          )}
        </Card>

        <div className="flex gap-2">
          <Button type="submit" loading={pending}>
            Create task
          </Button>
          <Button variant="ghost" onClick={() => router.push("/tasks")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
