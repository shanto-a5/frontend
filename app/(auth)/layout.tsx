import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in" };

/** Centered shell for the signed-out pages (login, register, password reset). */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <header className="mb-6 text-center">
          <p className="text-lg font-semibold text-primary">Progress</p>
          <p className="mt-1 text-sm text-ink-muted">
            Business task tracker — assignments, deadlines, and reviews in one place.
          </p>
        </header>
        {children}
      </div>
    </main>
  );
}
