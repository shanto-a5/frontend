import { cn } from "@/lib/cn";

/** White surface panel with a quiet border — the app's one container. */
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-line bg-surface p-5 sm:p-6", className)}>
      {children}
    </section>
  );
}

export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h2 className={cn("text-base font-semibold text-ink", className)}>{children}</h2>;
}

export function CardDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cn("mt-1 text-sm text-ink-muted", className)}>{children}</p>;
}
