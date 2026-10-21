import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Centered shell for the signed-out pages (login, register, password reset).
 * Matches the reference treatment: soft tonal canvas, a product mark, and a
 * card-based form column.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main-content"
      className="flex flex-1 items-center justify-center bg-gradient-to-b from-surface-low to-canvas px-4 py-10"
    >
      <div className="w-full max-w-md">
        <header className="mb-6 flex flex-col items-center text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-container text-lg font-bold text-white shadow-sm"
          >
            P
          </span>
          <p className="mt-3 text-lg font-semibold text-ink">Progress</p>
          <p className="mt-1 text-sm text-ink-muted">
            Business task tracker — assignments, deadlines, and reviews in one place.
          </p>
        </header>
        {children}
      </div>
    </main>
  );
}
