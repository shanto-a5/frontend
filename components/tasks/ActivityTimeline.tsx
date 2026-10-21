"use client";

import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { formatInstant, relativeFromNow } from "@/lib/format";
import type { ActivityEvent } from "@/lib/api/types";

/**
 * The append-only audit timeline (M8, plan §4.1, §9). Used by the task detail,
 * the employee assignment view and the boss review screen so a change reads
 * identically everywhere.
 *
 * Every row is written by the server with a server-derived actor; the client
 * never edits or reorders history. Where an event carries `{ field, from, to }`
 * (a shared-field edit before the freeze, a per-assignment deadline override,
 * a review's `revisedDueAt`), the change is shown explicitly — old value →
 * new value — rather than buried in prose, so the audit trail is legible.
 */

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  instructions: "Instructions",
  priority: "Priority",
  dueAt: "Task deadline",
  releasesAt: "Release moment",
  dueAtOverride: "Assignment deadline",
  revisedDueAt: "Revised deadline",
};

/** Renders one value of a change: instants are formatted in company time. */
function ChangeValue({ value, timezone }: { value: unknown; timezone: string }) {
  if (value === null || value === undefined) {
    return <span className="text-ink-muted">none</span>;
  }
  const text = String(value);
  // A change value that parses as an ISO instant is shown as company time.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) {
    return <span>{formatInstant(text, timezone)}</span>;
  }
  return <span>{text}</span>;
}

type ChangeDetail = { field: string; from: unknown; to: unknown };

/** Extracts a single `{ field, from, to }` change from an event's data, if any. */
function singleChange(event: ActivityEvent): ChangeDetail | null {
  const { field, from, to } = event.data as Partial<ChangeDetail>;
  if (typeof field === "string" && ("from" in event.data || "to" in event.data)) {
    return { field, from, to };
  }
  return null;
}

export function ActivityTimeline({
  activity,
  timezone,
  title = "History",
}: {
  activity: ActivityEvent[];
  timezone: string;
  title?: string;
}) {
  if (activity.length === 0) return null;

  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <CardDescription>Every recorded change, newest first. Nothing here is ever rewritten.</CardDescription>
      <ol className="mt-4 flex flex-col gap-3">
        {activity.map((event) => {
          const change = singleChange(event);
          return (
            <li key={event.id} className="flex flex-col gap-1 border-l-2 border-line pl-3">
              <p className="text-sm text-ink">{event.summary}</p>
              {change && (
                <p className="text-xs text-ink-muted">
                  <span className="font-medium text-ink">
                    {FIELD_LABELS[change.field] ?? change.field}
                  </span>
                  {": "}
                  <ChangeValue value={change.from} timezone={timezone} />
                  {" → "}
                  <ChangeValue value={change.to} timezone={timezone} />
                </p>
              )}
              <p className="text-xs text-ink-muted">
                {formatInstant(event.createdAt, timezone)} · {relativeFromNow(event.createdAt)}
              </p>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
