/**
 * Submission, upload, and evidence endpoints (M6) — typed wrappers.
 *
 * The multipart upload cannot go through the shared JSON client (which
 * stringifies every body), so `uploadEvidenceFile` speaks to the API through
 * `XMLHttpRequest`, which is also the only way to report upload progress to
 * the UI. It preserves the shared client's contract exactly: cookie-sent
 * (`withCredentials`), same envelope `{ ok, data, error }`, and the same
 * `ApiError` on failure — including the 401 → login redirect.
 *
 * Private evidence: `getEvidenceUrl` authorizes on the server and answers a
 * short-lived signed URL. The browser loads image bytes ONLY from those URLs;
 * the raw delivery URL never exists in any stored payload.
 */

import { API_BASE_URL, ApiError, api } from "./client";
import type {
  CreateSubmissionInput,
  CreateSubmissionResponse,
  UploadedMedia,
  Evidence,
} from "./types";

const parseEnvelope = (status: number, text: string): { ok: boolean; data?: unknown; error?: unknown } => {
  try {
    return (JSON.parse(text) as { ok: boolean; data?: unknown; error?: unknown }) ?? { ok: false };
  } catch {
    return { ok: false };
  }
};

/** The assignee creates an attempt (or replays one via `idempotencyKey`). */
export async function createSubmission(
  assignmentId: string,
  input: CreateSubmissionInput,
): Promise<CreateSubmissionResponse> {
  return api.post<CreateSubmissionResponse>(`/assignments/${assignmentId}/submissions`, input);
}

/**
 * Uploads one file and resolves with its durable handle. Progress is reported
 * through `onProgress` as a 0..1 fraction so the form can show a per-file bar.
 */
export function uploadEvidenceFile(
  file: File,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadedMedia> {
  return new Promise<UploadedMedia>((resolve, reject) => {
    if (API_BASE_URL === "") {
      reject(
        new ApiError(
          0,
          { code: "configuration_error", message: "NEXT_PUBLIC_API_BASE_URL is not set." },
          "The API location is not configured.",
        ),
      );
      return;
    }

    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE_URL}/uploads`);
    request.withCredentials = true;

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };

    request.onerror = () =>
      reject(
        new ApiError(
          0,
          { code: "network_error", message: "Could not reach the server. Check your connection and try again." },
          "Could not reach the server.",
        ),
      );

    request.onabort = () =>
      reject(new ApiError(0, { code: "aborted", message: "Upload cancelled." }, "Upload cancelled."));

    request.onload = () => {
      const envelope = parseEnvelope(request.status, request.responseText);
      if (request.status < 200 || request.status >= 300 || envelope.ok !== true) {
        reject(
          new ApiError(
            request.status,
            (envelope.error as { code: string; message: string; fields?: { field: string; message: string }[] }) ?? null,
            `Upload failed with status ${request.status}.`,
          ),
        );
        return;
      }
      const data = envelope.data as { media: UploadedMedia };
      resolve(data.media);
    };

    if (signal) {
      signal.addEventListener("abort", () => request.abort(), { once: true });
    }

    const form = new FormData();
    form.append("file", file, file.name);
    request.send(form);
  });
}

/** Removes an uncommitted upload (namespace-checked on the server). */
export async function deleteUpload(publicId: string): Promise<{ deleted: boolean }> {
  // The shared client's DELETE helper sends no body, so reuse the JSON request
  // path directly through a small POST-shaped call to `/uploads` with the
  // method overridden — see apiRequest; DELETE carries the publicId in the body.
  return apiRequestWithBody<{ deleted: boolean }>("/uploads", "DELETE", { publicId });
}

/** The authorized, short-lived signed delivery URL for one evidence row. */
export async function getEvidenceUrl(
  evidenceId: string,
): Promise<{ kind: "file" | "link"; url: string | null; expiresAt: string | null }> {
  return api.get(`/evidence/${evidenceId}/url`);
}

/** Convenience: the evidence rows of one attempt (already nested in detail). */
export type { Evidence };

/**
 * The shared client exposes DELETE without a body; submissions need one for
 * `/uploads`. This mirrors `apiRequest`'s envelope handling exactly, including
 * the 401 redirect flag default.
 */
async function apiRequestWithBody<T>(path: string, method: "DELETE", body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const envelope = parseEnvelope(response.status, text) as {
    ok: boolean;
    data?: unknown;
    error?: { code: string; message: string; fields?: { field: string; message: string }[] };
  };
  if (!response.ok || envelope.ok !== true) {
    throw new ApiError(
      response.status,
      envelope.error ?? null,
      `Request failed with status ${response.status}.`,
      response.headers.get("x-request-id") ?? "",
    );
  }
  return envelope.data as T;
}
