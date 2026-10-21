/**
 * Task endpoints (M5) — typed wrappers over the shared client.
 *
 * All deadlines cross the wire as ISO-8601 UTC instants (the server computes
 * them from the company's wall clock); formatting for display happens in
 * `lib/format.ts` against the company timezone, never here.
 */

import { api } from "./client";
import type {
  ActivityEvent,
  MyTasksResponse,
  PresentationState,
  SubmissionWithEvidence,
  SummaryResponse,
  Task,
  TaskAssignment,
  TaskPriority,
} from "./types";

export interface CreateTaskInput {
  title: string;
  instructions?: string;
  /** ISO instant, or a company-local wall clock like "2026-03-24T18:00". */
  dueAt: string;
  /** Preset {1, 3, 4}… */
  releaseOffsetDays?: number;
  /** …or a custom release instant; never both. Omit for visible-now. */
  releasesAt?: string;
  priority: TaskPriority;
  assigneeIds: string[];
}

export interface TaskWithAssignments extends Task {
  assignmentCount: number;
  assignments: (TaskAssignment & {
    assigneeName: string;
    presentationState: PresentationState;
  })[];
}

export interface TaskListResponse {
  tasks: TaskWithAssignments[];
}

export interface TaskDetailResponse {
  task: TaskWithAssignments;
  activity: ActivityEvent[];
}

export interface AssignmentDetailResponse {
  assignment: TaskAssignment & {
    assigneeName: string;
    presentationState: PresentationState;
  };
  task: Task;
  /** Newest attempt first, each with its evidence (M6). */
  submissions: SubmissionWithEvidence[];
  activity: ActivityEvent[];
}

/** Boss-only. */
export async function listTasks(params?: {
  status?: "open" | "cancelled";
  upcoming?: boolean;
}): Promise<TaskListResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.upcoming !== undefined) query.set("upcoming", String(params.upcoming));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api.get<TaskListResponse>(`/tasks${suffix}`);
}

/** Boss-only. */
export async function createTask(input: CreateTaskInput): Promise<{
  task: Task;
  assignments: TaskAssignment[];
}> {
  return api.post("/tasks", input);
}

/** Boss-only. */
export async function getTask(id: string): Promise<TaskDetailResponse> {
  return api.get<TaskDetailResponse>(`/tasks/${id}`);
}

export type UpdateTaskInput = Partial<
  Pick<CreateTaskInput, "title" | "instructions" | "dueAt" | "releaseOffsetDays" | "releasesAt" | "priority">
>;

/** Boss-only; 409 once any submission exists (shared-field freeze). */
export async function updateTask(id: string, update: UpdateTaskInput): Promise<TaskDetailResponse> {
  return api.patch<TaskDetailResponse>(`/tasks/${id}`, update);
}

/** Boss-only; cancels every non-terminal assignment, keeps approved ones. */
export async function cancelTask(id: string): Promise<{
  cancelledAssignments: number;
  approvedUntouched: number;
}> {
  return api.post(`/tasks/${id}/cancel`);
}

/** The employee's released, server-ranked work list. */
export async function myTasks(): Promise<MyTasksResponse> {
  return api.get<MyTasksResponse>("/my/tasks");
}

/** The assignee or a boss of the same company may read; anyone else 404s. */
export async function getAssignment(id: string): Promise<AssignmentDetailResponse> {
  return api.get<AssignmentDetailResponse>(`/assignments/${id}`);
}

/** The server-authoritative dashboard summary (M9) — never counted client-side. */
export async function getSummary(): Promise<SummaryResponse> {
  return api.get<SummaryResponse>("/summary");
}

/** Boss-only per-assignment deadline override; null clears the override. */
export async function setAssignmentOverride(
  id: string,
  dueAtOverride: string | null,
): Promise<{ assignment: TaskAssignment; task: Task }> {
  return api.patch<{ assignment: TaskAssignment; task: Task }>(`/assignments/${id}`, {
    dueAtOverride,
  });
}
