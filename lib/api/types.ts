/**
 * Wire types mirroring the backend's verified response shapes.
 *
 * Backend conventions (verified in `backend/src/`):
 *   success: { ok: true, data, meta: { message } }
 *   failure: { ok: false, error: { code, message, fields? }, meta }
 * `data` carries domain payloads; ids are strings (`toPublicUser` emits `id`).
 * All dates are ISO-8601 UTC instants — display formatting happens in the
 * company timezone on the client (`lib/format.ts`), never on the server.
 */

/* ---------- auth ---------- */

export type Role = "boss" | "employee" | (string & {});

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  hasPassword: boolean;
  roles: Role[];
  createdAt: string;
  updatedAt: string;
}

/* ---------- company ---------- */

export interface Company {
  id: string;
  name: string;
  timezone: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type MembershipRole = "boss" | "employee";

export interface Membership {
  id: string;
  companyId: string;
  userId: string;
  roles: MembershipRole[];
  status: "active" | "removed";
  createdAt: string;
  updatedAt: string;
}

export interface CurrentCompany {
  company: Company;
  membership: Membership;
}

/** `GET /api/v1/companies/members` — boss team list. */
export interface CompanyMember {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  roles: MembershipRole[];
  status: "active" | "removed";
  joinedAt: string;
}

/** Boss-only: only returned to a boss on `GET /companies/current`. */
export interface JoinCodeView {
  joinCode: string;
}

/* ---------- tasks ---------- */

export type TaskPriority = "normal" | "high";
export type TaskState = "open" | "cancelled";
export type AssignmentState =
  | "assigned"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "cancelled";

/** Presentation state derived server-side; separate from workflow state. */
export type PresentationState =
  | "scheduled"
  | "available"
  | "due_soon"
  | "overdue"
  | "cancelled";

export const RELEASE_OFFSET_PRESETS = [1, 3, 4] as const;
export type ReleaseOffsetPreset = (typeof RELEASE_OFFSET_PRESETS)[number];

export interface Task {
  id: string;
  companyId: string;
  title: string;
  instructions: string;
  dueAt: string;
  releasesAt: string;
  priority: TaskPriority;
  state: TaskState;
  createdBy: string;
  frozen: boolean;
  createdAt: string;
  updatedAt: string;
  /** Boss reads: aggregate over assignments. */
  assignmentCount?: number;
  assignments?: TaskAssignment[];
}

export interface TaskAssignment {
  id: string;
  taskId: string;
  companyId: string;
  assigneeId: string;
  assigneeName?: string;
  state: AssignmentState;
  dueAtOverride: string | null;
  revisedDueAt: string | null;
  effectiveDueAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One row of `GET /api/v1/my/tasks` (employee dashboard). */
export interface MyAssignment extends TaskAssignment {
  task: Task;
  presentationState: PresentationState;
  /** true on the single Next-task winner (server-ranked). */
  next: boolean;
  rank: number;
}

export interface MyTasksResponse {
  assignments: MyAssignment[];
  nextAssignmentId: string | null;
  now: string;
}

export interface ActivityEvent {
  id: string;
  companyId: string;
  subjectType: "company" | "membership" | "task" | "assignment";
  subjectId: string;
  actorId: string;
  type: string;
  summary: string;
  data: Record<string, unknown>;
  createdAt: string;
}

/* ---------- errors ---------- */

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: { field: string; message: string }[];
}
