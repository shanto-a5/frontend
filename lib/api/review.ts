/**
 * Review endpoints (M7) — typed wrappers over the shared client. Boss-only on
 * the server; the UI additionally hides the surfaces from employees, but the
 * server is the authority.
 */

import { api } from "./client";
import type {
  RequestChangesInput,
  ReviewDecisionResponse,
  ReviewQueueResponse,
} from "./types";

/** The FIFO review queue plus the changes-requested group (plan §4.4). */
export async function getReviewQueue(): Promise<ReviewQueueResponse> {
  return api.get<ReviewQueueResponse>("/review/queue");
}

/** Approves the submission under review (only legal from `submitted`). */
export async function approveSubmission(submissionId: string): Promise<ReviewDecisionResponse> {
  return api.post<ReviewDecisionResponse>(`/submissions/${submissionId}/approve`);
}

/** Requests changes; `message` is required, `revisedDueAt` optional. */
export async function requestChanges(
  submissionId: string,
  input: RequestChangesInput,
): Promise<ReviewDecisionResponse> {
  return api.post<ReviewDecisionResponse>(`/submissions/${submissionId}/request-changes`, input);
}
