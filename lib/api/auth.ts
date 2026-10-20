/**
 * Auth endpoints — thin typed wrappers over the shared client.
 *
 * The session lives in an httpOnly cookie set by the backend; nothing here
 * touches browser storage. `data.token` (a bearer token intended for native
 * clients) is deliberately ignored by the web app.
 */

import { api, ApiError } from "./client";
import type { PublicUser } from "./types";

interface AuthResult {
  user: PublicUser;
}

export async function login(identifier: string, password: string): Promise<PublicUser> {
  const data = await api.post<AuthResult>(
    "/auth/login",
    { email: identifier, password },
    { authRedirect: false },
  );
  return data.user;
}

export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export async function register(input: RegisterInput): Promise<PublicUser> {
  const data = await api.post<AuthResult>("/auth/register", input, { authRedirect: false });
  return data.user;
}

/** The current session's user, or null when signed out (401 is not an error). */
export async function fetchCurrentUser(): Promise<PublicUser | null> {
  try {
    const data = await api.get<{ user: PublicUser }>("/auth/me", { authRedirect: false });
    return data.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout", undefined, { authRedirect: false });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await api.post("/auth/password-reset/request", { email }, { authRedirect: false });
}

export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  await api.post("/auth/password-reset/confirm", { token, password }, { authRedirect: false });
}
