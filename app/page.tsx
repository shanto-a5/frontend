"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { Loading } from "@/components/ui/Loading";

/**
 * Landing route: route by role once the session resolves.
 * - loading -> spinner (never a flash of the wrong page)
 * - signed in, no company yet -> /onboarding
 * - signed in boss -> /dashboard (boss view)
 * - signed in employee -> /dashboard (employee view)
 * - signed out -> /login
 */
export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    // Company membership is resolved server-side on the dashboard; landing
    // there with an unaffiliated account redirects to /onboarding.
    router.replace("/dashboard");
  }, [status, router]);

  return (
    <main id="main-content" className="flex flex-1 items-center justify-center">
      <Loading label="Loading your workspace…" />
    </main>
  );
}
