"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
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
  if (isBoss) links.push({ href: "/company", label: "Company" });

  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex gap-1 md:flex-col">
        {links.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
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

  if (sessionStatus === "loading" || companyStatus === "loading") {
    return (
      <main id="main-content" className="flex flex-1 items-center justify-center">
        <Loading label="Loading your workspace…" />
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-base font-semibold text-primary">
              Progress
            </Link>
            <Nav className="hidden md:block" />
          </div>
          <UserMenu />
        </div>
        <Nav className="border-t border-line px-4 py-2 md:hidden" />
      </header>
      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {children}
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
