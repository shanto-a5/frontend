/**
 * Typed API client for the business progress backend.
 *
 * Contract (verified against `backend/src/`):
 *  - base URL: `NEXT_PUBLIC_API_BASE_URL`, must point at the backend's
 *    `/api/v1` prefix (e.g. `http://localhost:4000/api/v1`);
 *  - session is an httpOnly cookie — every request sends `credentials:
 *    "include"` and no token is ever read from or written to browser storage;
 *  - success envelope `{ ok: true, data, meta }` -> the parsed `data`;
 *  - failure envelope `{ ok: false, error: { code, message, fields? } }` ->
 *    thrown `ApiError`;
 *  - a 401 on a credentialed request (session expired) redirects the browser
 *    to `/login`, preserving the intended destination. Auth endpoints (login,
 *    register, reset) opt out with `authRedirect: false` because their 401/4xx
 *    answers are ordinary form validation, not session loss.
 */

import type { ApiErrorBody } from "./types";

const rawBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
export const API_BASE_URL = rawBase.replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: { field: string; message: string }[];
  readonly requestId: string;

  constructor(
    status: number,
    body: ApiErrorBody | null,
    fallbackMessage: string,
    requestId = "",
  ) {
    super(body?.message || fallbackMessage);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.code ?? (status === 0 ? "network_error" : "unknown_error");
    this.fields = body?.fields ?? [];
    this.requestId = requestId;
  }

  /** First message for a given form field, if the server flagged it. */
  fieldError(field: string): string | undefined {
    return this.fields.find((f) => f.field === field)?.message;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Follow a 401 with a redirect to /login (default true). */
  authRedirect?: boolean;
  signal?: AbortSignal;
}

const currentPathWithQuery = (): string => {
  if (typeof window === "undefined") return "";
  return window.location.pathname + window.location.search;
};

type UnauthorizedNavigator = (href: string) => void;

let unauthorizedNavigator: UnauthorizedNavigator | null = null;

/**
 * Wire expired-session navigation to the app's router so a 401 stays inside
 * the SPA. The app shell registers it; until then (or after teardown) the
 * redirect below falls back to a full page load, which is still correct.
 */
export function setUnauthorizedNavigator(navigate: UnauthorizedNavigator | null): void {
  unauthorizedNavigator = navigate;
}

const redirectToLogin = (): void => {
  if (typeof window === "undefined") return;
  const target = `/login?next=${encodeURIComponent(currentPathWithQuery())}`;
  if (unauthorizedNavigator) {
    unauthorizedNavigator(target);
    return;
  }
  // Fallback for the one case the router cannot serve: an expired session
  // detected before the app shell registered its navigator. A full page
  // load to the login route (which understands `?next=`) is correct here.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(target);
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, authRedirect = true, signal } = options;

  if (API_BASE_URL === "") {
    throw new ApiError(
      0,
      { code: "configuration_error", message: "NEXT_PUBLIC_API_BASE_URL is not set." },
      "The API location is not configured.",
    );
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch {
    // Network-level failure: no envelope to parse.
    throw new ApiError(
      0,
      { code: "network_error", message: "Could not reach the server. Check your connection and try again." },
      "Could not reach the server.",
    );
  }

  const requestId = response.headers.get("x-request-id") ?? "";

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  const envelope = payload as
    | { ok?: boolean; data?: unknown; error?: ApiErrorBody }
    | null;

  if (!response.ok || envelope?.ok !== true) {
    if (response.status === 401 && authRedirect) {
      redirectToLogin();
    }
    throw new ApiError(
      response.status,
      envelope?.error ?? null,
      `Request failed with status ${response.status}.`,
      requestId,
    );
  }

  return envelope!.data as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
};
