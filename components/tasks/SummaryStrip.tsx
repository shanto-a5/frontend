"use client";

import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import type { BossSummary, EmployeeSummary } from "@/lib/api/types";

/**
 * The dashboard progress summary (M9, plan §4.3, §6, §9).
 *
 * Every number is computed SERVER-SIDE (`GET /summary`) from the same
 * company-scoped rows the lists use, so the strip can never disagree with the
 * list it summarizes — there is deliberately no client counting. Each tile is
 * a labelled figure (never color-only), and a zero value is still shown so an
 * empty dashboard reads as "nothing waiting" rather than a blank space.
 */

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-ink",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

type Tile = { label: string; value: number; tone: Tone };

function Strip({
  title,
  description,
  tiles,
}: {
  title: string;
  description: string;
  tiles: Tile[];
}) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex flex-col gap-0.5 rounded-xl border border-line bg-surface-low p-3">
            <dt className="text-xs text-ink-muted">{tile.label}</dt>
            <dd className={cn("text-2xl font-semibold tabular-nums", TONE_TEXT[tile.tone])}>
              {tile.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function BossSummaryStrip({ summary }: { summary: BossSummary }) {
  const tiles: Tile[] = [
    {
      label: "Waiting for review",
      value: summary.awaitingReview,
      tone: summary.awaitingReview > 0 ? "info" : "neutral",
    },
    {
      label: "Changes requested",
      value: summary.changesRequested,
      tone: summary.changesRequested > 0 ? "warning" : "neutral",
    },
    { label: "Approved", value: summary.approved, tone: summary.approved > 0 ? "success" : "neutral" },
    { label: "Overdue", value: summary.overdue, tone: summary.overdue > 0 ? "danger" : "neutral" },
    { label: "Open tasks", value: summary.openTasks, tone: "neutral" },
  ];
  return (
    <Strip
      title="Progress overview"
      description="Counted by the server from live work — not a chart, just the numbers."
      tiles={tiles}
    />
  );
}

export function EmployeeSummaryStrip({ summary }: { summary: EmployeeSummary }) {
  const tiles: Tile[] = [
    {
      label: "With your boss",
      value: summary.submitted,
      tone: summary.submitted > 0 ? "info" : "neutral",
    },
    {
      label: "Changes requested",
      value: summary.changesRequested,
      tone: summary.changesRequested > 0 ? "warning" : "neutral",
    },
    { label: "Approved", value: summary.approved, tone: summary.approved > 0 ? "success" : "neutral" },
    { label: "Due this week", value: summary.dueThisWeek, tone: summary.dueThisWeek > 0 ? "warning" : "neutral" },
    { label: "Overdue", value: summary.overdue, tone: summary.overdue > 0 ? "danger" : "neutral" },
  ];
  return (
    <Strip title="Your week" description="Your own work, counted by the server." tiles={tiles} />
  );
}
