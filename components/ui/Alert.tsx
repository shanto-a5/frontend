import { cn } from "@/lib/cn";
import type { BadgeTone } from "./Badge";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-canvas border-line text-ink",
  info: "bg-info-soft border-info/25 text-info",
  success: "bg-success-soft border-success/25 text-success",
  warning: "bg-warning-soft border-warning/25 text-warning",
  danger: "bg-danger-soft border-danger/25 text-danger",
};

/**
 * Inline message block with a visible label ("Error", "Notice"…) so the
 * severity is readable without color. Use `role="alert"` for form-level
 * failures that appear after an action.
 */
export function Alert({
  tone = "neutral",
  title,
  children,
  className,
  role,
}: {
  tone?: BadgeTone;
  title: string;
  children?: React.ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  return (
    <div className={cn("rounded-md border px-4 py-3 text-sm", TONE_CLASSES[tone], className)} role={role}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}
