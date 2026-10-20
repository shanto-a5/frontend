import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { AssignmentState, PresentationState, TaskPriority } from "@/lib/api/types";

/**
 * Status chips for tasks and assignments. The workflow state (what the
 * system knows) and the presentation state (what the schedule implies) are
 * distinct axes (plan §4.3) — this component labels each with text, never
 * color alone (WCAG 1.4.1).
 */

const WORKFLOW_LABELS: Record<AssignmentState, { label: string; tone: BadgeTone }> = {
  assigned: { label: "Assigned", tone: "neutral" },
  submitted: { label: "With your boss", tone: "info" },
  changes_requested: { label: "Changes requested", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const PRESENTATION_LABELS: Record<PresentationState, { label: string; tone: BadgeTone }> = {
  scheduled: { label: "Scheduled", tone: "info" },
  available: { label: "Available", tone: "neutral" },
  due_soon: { label: "Due soon", tone: "warning" },
  overdue: { label: "Overdue", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function AssignmentStateBadge({ state }: { state: AssignmentState }) {
  const { label, tone } = WORKFLOW_LABELS[state] ?? WORKFLOW_LABELS.assigned;
  return <Badge tone={tone}>{label}</Badge>;
}

/**
 * The single chip an employee list needs: workflow state, unless the task is
 * merely early (scheduled) or the schedule itself is the story (overdue /
 * due soon on actionable work).
 */
export function PresentationBadge({
  state,
  workflowState,
}: {
  state: PresentationState;
  workflowState: AssignmentState;
}) {
  if (workflowState === "cancelled") return <Badge tone="neutral">Cancelled</Badge>;
  if (workflowState === "approved") return <Badge tone="success">Approved</Badge>;
  if (workflowState === "submitted") return <Badge tone="info">With your boss</Badge>;
  if (workflowState === "changes_requested") {
    const presentation = PRESENTATION_LABELS[state];
    return <Badge tone={presentation.tone}>Changes requested</Badge>;
  }
  const { label, tone } = PRESENTATION_LABELS[state] ?? PRESENTATION_LABELS.available;
  return <Badge tone={tone}>{label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  if (priority !== "high") return null;
  return <Badge tone="warning">High priority</Badge>;
}

export function TaskStateBadge({ state }: { state: "open" | "cancelled" }) {
  return state === "cancelled" ? (
    <Badge tone="neutral">Cancelled</Badge>
  ) : (
    <Badge tone="success">Open</Badge>
  );
}
