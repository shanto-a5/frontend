"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, type ReactNode } from "react";
import { useSession } from "@/components/SessionProvider";
import { CompanyProvider, useCompany } from "@/components/CompanyProvider";
import { Button } from "@/components/ui/Button";
import { Loading } from "@/components/ui/Loading";
import { cn } from "@/lib/cn";

/**
 * Authenticated app shell: skip link target, product header with the signed-in
 * user's name and a sign-out control, and role-aware navigation. Wide screens
 * (>= 768px) get a persistent side navigation; narrow screens get a horizontal
 * nav row under the header (plan §6 responsive rules).
 */

function Nav({ className }: { className?: string }) {
  const pathname = usePathname();
  const { isBoss } = useCompany();

  const links: { href: string; label: string }[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/tasks", label: isBoss ? "Tasks" : "My tasks" },
  ];
  if (isBoss) links.push({ href: "/review", label: "Review" });
  if (isBoss) links.push({ href: "/company", label: "Company" });

  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex flex-wrap gap-1 md:flex-col md:flex-nowrap">
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary-soft text-primary-soft-ink"
                    : "text-ink-muted hover:bg-canvas hover:text-ink",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function UserMenu() {
  const { user, signOut } = useSession();
  const router = useRouter();

  const onSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-ink-muted sm:inline">{user?.name}</span>
      <Button variant="secondary" size="sm" onClick={onSignOut}>
        Sign out
      </Button>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { status: sessionStatus } = useSession();
  const { status: companyStatus } = useCompany();
  const router = useRouter();

  useEffect(() => {
    if (sessionStatus === "unauthenticated") router.replace("/login");
  }, [sessionStatus, router]);

  // `{children}` is ALWAYS rendered — including while session/company resolve.
  // With `cacheComponents` enabled, Next.js validates that every segment of a
  // route can produce an instant navigation; a layout that early-returns
  // without `{children}` drops the page segment from rendering and trips the
  // `instant-unrendered-segment` insight (nextjs.org/docs/messages/instant-unrendered-segment).
  // Every page under this group guards its own `companyStatus === "loading"`
  // state, so rendering them during boot is safe; the overlay below preserves
  // the "Loading your workspace…" boot UX on top of them. Runtime-only data
  // (`use(params)` in the dynamic routes, `usePathname` in `Nav`) is bounded
  // by `<Suspense>` — see `app/(app)/loading.tsx` and the Nav boundaries — so
  // the static shell still prerenders. No `instant = false` opt-outs anywhere.
  const isBooting = sessionStatus === "loading" || companyStatus === "loading";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-base font-semibold text-primary">
              Progress
            </Link>
            {/* `usePathname` cannot resolve during prerendering of routes with
                unknown dynamic params (`/tasks/[id]`, `/review/[assignmentId]`)
                — the documented fix is a Suspense boundary around the active-
                link component so the rest of the shell still prerenders
                (nextjs.org/docs/messages/blocking-prerender-client-hook). */}
            <Suspense fallback={null}>
              <Nav className="hidden md:block" />
            </Suspense>
          </div>
          <UserMenu />
        </div>
        <Suspense fallback={null}>
          <Nav className="border-t border-line px-4 py-2 md:hidden" />
        </Suspense>
      </header>
      <main
        id="main-content"
        className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6"
      >
        {children}
        {isBooting && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-canvas"
            role="status"
            aria-live="polite"
          >
            <Loading label="Loading your workspace…" />
          </div>
        )}
      </main>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <CompanyProvider>
      <Shell>{children}</Shell>
    </CompanyProvider>
  );
}
