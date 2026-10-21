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

/* ---------- submissions, evidence, review (M6/M7) ---------- */

export type SubmissionStatus = "pending" | "approved" | "changes_requested";
export type EvidenceKind = "file" | "link";

/**
 * One evidence row on a submission attempt. A `file` row carries the durable
 * `publicId` (never a delivery URL — the client fetches bytes through
 * `getEvidenceUrl`, which authorizes and mints a short-lived signed URL).
 * A `link` row carries its stored `url`.
 */
export interface Evidence {
  id: string;
  submissionId: string;
  assignmentId: string;
  kind: EvidenceKind;
  publicId: string | null;
  resourceType: string | null;
  format: string | null;
  url: string | null;
  caption: string;
  position: number;
}

export interface Submission {
  id: string;
  assignmentId: string;
  taskId: string;
  companyId: string;
  submittedBy: string;
  attempt: number;
  description: string;
  status: SubmissionStatus;
  reviewActionId: string | null;
  createdAt: string;
}

export interface SubmissionWithEvidence extends Submission {
  evidence: Evidence[];
  /** The immutable decision on this attempt, if it has been reviewed (M7). */
  reviewAction: ReviewAction | null;
}

/** `POST /api/v1/uploads` — the durable handles an upload returns. */
export interface UploadedMedia {
  publicId: string;
  resourceType: string;
  format: string | null;
  restricted: true;
}

/** One already-uploaded file the submission references by handle. */
export interface EvidenceFileInput {
  publicId: string;
  resourceType: string;
  format: string | null;
  caption?: string;
}

export interface CreateSubmissionInput {
  description?: string;
  links?: string[];
  files?: EvidenceFileInput[];
  idempotencyKey?: string;
}

export interface CreateSubmissionResponse {
  submission: Submission;
  evidence: Evidence[];
  assignment: TaskAssignment;
  task: Task;
  idempotentReplay: boolean;
}

/* ---------- review (M7) ---------- */

export type ReviewActionKind = "approved" | "changes_requested";

/** One immutable boss decision on an attempt (M7). */
export interface ReviewAction {
  id: string;
  submissionId: string;
  assignmentId: string;
  companyId: string;
  actorId: string;
  action: ReviewActionKind;
  message: string;
  revisedDueAt: string | null;
  filePublicIds: string[];
  links: string[];
  createdAt: string;
}

/** One FIFO review-queue item: the attempt, its scope, and its evidence. */
export interface ReviewQueueItem {
  submission: Submission;
  assignment: TaskAssignment;
  task: Task;
  assigneeName: string;
  evidence: Evidence[];
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  awaitingEmployee: { assignment: TaskAssignment; task: Task }[];
}

export interface ReviewDecisionResponse {
  reviewAction: ReviewAction;
  submission: Submission;
  assignment: TaskAssignment;
  task: Task;
}

export interface RequestChangesInput {
  message: string;
  revisedDueAt?: string | null;
  files?: string[];
  links?: string[];
}

/* ---------- progress summaries (M9) ---------- */

/** Server-computed boss dashboard counts. */
export interface BossSummary {
  awaitingReview: number;
  changesRequested: number;
  approved: number;
  overdue: number;
  openTasks: number;
}

/** Server-computed employee dashboard counts (own rows only). */
export interface EmployeeSummary {
  submitted: number;
  changesRequested: number;
  approved: number;
  dueThisWeek: number;
  overdue: number;
}

export interface SummaryResponse {
  /** Null unless the caller holds the boss role. */
  boss: BossSummary | null;
  employee: EmployeeSummary;
  now: string;
}

/* ---------- errors ---------- */

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: { field: string; message: string }[];
}
