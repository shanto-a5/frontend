import { Spinner } from "./Spinner";

/** Centered in-place loading indicator with an accessible label. */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-muted" role="status">
      <Spinner className="size-5" />
      <span>{label}</span>
    </div>
  );
}
