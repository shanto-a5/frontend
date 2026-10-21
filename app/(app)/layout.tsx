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
 * Authenticated app shell: skip link target, product header with the
 * signed-in user's name and a sign-out control, and role-aware navigation.
 * Wide screens (>= 768px) get the navigation in the header; narrow screens get
 * a horizontal nav row under it (plan §6 responsive rules).
 *
 * Visual language follows the supplied references: a compact tonal header with
 * the product mark, a company pill, pill navigation and an avatar cluster.
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
      <ul className="flex flex-wrap gap-1 md:flex-nowrap">
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary-soft text-primary-soft-ink shadow-sm"
                    : "text-ink-muted hover:bg-surface-low hover:text-ink",
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

function initialsOf(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
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
      <span className="hidden items-center gap-2 sm:flex">
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-ink"
        >
          {initialsOf(user?.name)}
        </span>
        <span className="max-w-32 truncate text-sm font-medium text-ink">{user?.name}</span>
      </span>
      <Button variant="secondary" size="sm" onClick={onSignOut}>
        Sign out
      </Button>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { company, status: companyStatus } = useCompany();
  const { status: sessionStatus } = useSession();
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
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-container text-sm font-bold text-white shadow-sm"
            >
              P
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block text-sm font-semibold text-ink">Progress</span>
              <span className="block text-[11px] text-ink-muted">Work tracker</span>
            </span>
          </Link>

          {company && (
            <span className="hidden min-w-0 max-w-48 truncate rounded-full border border-line bg-surface-low px-3 py-1 text-xs font-medium text-ink-muted lg:inline">
              {company.name}
            </span>
          )}

          {/* `usePathname` cannot resolve during prerendering of routes with
              unknown dynamic params (`/tasks/[id]`, `/review/[assignmentId]`)
              — the documented fix is a Suspense boundary around the active-
              link component so the rest of the shell still prerenders
              (nextjs.org/docs/messages/blocking-prerender-client-hook). */}
          <div className="ml-auto hidden md:block">
            <Suspense fallback={null}>
              <Nav />
            </Suspense>
          </div>

          <div className="ml-auto md:ml-0">
            <UserMenu />
          </div>
        </div>
        <Suspense fallback={null}>
          <Nav className="border-t border-line px-4 py-2 md:hidden" />
        </Suspense>
      </header>
      <main
        id="main-content"
        className="relative mx-auto w-full max-w-7xl flex-1 px-4 py-7 sm:px-6 sm:py-9 lg:px-8"
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
