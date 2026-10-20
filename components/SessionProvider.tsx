"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ApiError, setUnauthorizedNavigator } from "@/lib/api/client";
import { fetchCurrentUser, logout as apiLogout } from "@/lib/api/auth";
import type { PublicUser } from "@/lib/api/types";

/**
 * Client-side session state, validated against `GET /auth/me` (the cookie is
 * httpOnly, so the server is the only authority; the browser cannot read it).
 * The provider's 401 handling is built into `fetchCurrentUser`; the API
 * client additionally redirects expired sessions to /login on any request.
 */

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface SessionValue {
  user: PublicUser | null;
  status: SessionStatus;
  refresh: () => Promise<PublicUser | null>;
  signOut: () => Promise<void>;
  /** Optimistically install a user returned by login/register. */
  setUser: (user: PublicUser) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUserState] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");

  const refresh = useCallback(async () => {
    try {
      const next = await fetchCurrentUser();
      setUserState(next);
      setStatus(next ? "authenticated" : "unauthenticated");
      return next;
    } catch (error) {
      // A network failure must not masquerade as "signed out".
      setStatus("unauthenticated");
      if (error instanceof ApiError && error.code === "network_error") return null;
      return null;
    }
  }, []);

  useEffect(() => {
    // inline async IIFE: state settles only after the await, never
    // synchronously within the effect turn (react-hooks/set-state-in-effect)
    void (async () => {
      await refresh();
    })();
  }, [refresh]);

  useEffect(() => {
    // a 401 from any API call navigates through the Next router (SPA) with
    // the current path preserved for post-login return
    setUnauthorizedNavigator((href) => router.replace(href));
    return () => setUnauthorizedNavigator(null);
  }, [router]);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setUserState(null);
      setStatus("unauthenticated");
    }
  }, []);

  const setUser = useCallback((next: PublicUser) => {
    setUserState(next);
    setStatus("authenticated");
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ user, status, refresh, signOut, setUser }),
    [user, status, refresh, signOut, setUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>.");
  return value;
}
