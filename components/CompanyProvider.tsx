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
import { getCurrentCompany } from "@/lib/api/company";
import { useSession } from "./SessionProvider";
import type { Company, Membership } from "@/lib/api/types";

/**
 * The caller's company context, fetched once per app-shell mount from
 * `GET /companies/current` (membership is the server-side authority; this is
 * a read-model cache for navigation and headers only — every mutation
 * re-checks on the server).
 */

type CompanyStatus = "loading" | "ready" | "none";

interface CompanyValue {
  company: Company | null;
  membership: Membership | null;
  isBoss: boolean;
  status: CompanyStatus;
  refresh: () => Promise<void>;
}

const CompanyContext = createContext<CompanyValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { status: sessionStatus } = useSession();
  const [company, setCompany] = useState<Company | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [status, setStatus] = useState<CompanyStatus>("loading");

  const refresh = useCallback(async () => {
    try {
      const current = await getCurrentCompany();
      if (current) {
        setCompany(current.company);
        setMembership(current.membership);
        setStatus("ready");
      } else {
        setCompany(null);
        setMembership(null);
        setStatus("none");
      }
    } catch {
      // Transient failure: treat as "no data yet", pages show their error UI.
      setStatus("none");
    }
  }, []);

  useEffect(() => {
    // state changes land only after the await — never synchronously in the
    // effect turn (react-hooks/set-state-in-effect)
    if (sessionStatus === "authenticated") {
      void (async () => {
        await refresh();
      })();
    }
  }, [sessionStatus, refresh]);

  const isBoss = membership?.roles.includes("boss") ?? false;

  const value = useMemo<CompanyValue>(
    () => ({ company, membership, isBoss, status, refresh }),
    [company, membership, isBoss, status, refresh],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyValue {
  const value = useContext(CompanyContext);
  if (!value) throw new Error("useCompany must be used inside <CompanyProvider>.");
  return value;
}
