"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";

/**
 * Compact evidence gallery shared by the employee submission form and the
 * persisted-evidence viewers (employee attempts + boss review).
 *
 * Presentation only: it never uploads, deletes or submits anything. Local
 * previews arrive as object URLs; private evidence arrives through an
 * authorized `loadSrc` callback that mints a short-lived signed URL. A source
 * is only used for rendering — it is never stored or logged.
 *
 * Layout: square frames, `object-fit: contain` (never cropped or stretched),
 * six slots at most before expanding (first five + a `+N` tile).
 */

const COLLAPSED_SLOTS = 6;
const COLLAPSED_IMAGES = COLLAPSED_SLOTS - 1;

type SourceState = { url: string | null; loading: boolean; error: string };

export interface GalleryImageItem {
  /** Stable key (row key or evidence id). */
  id: string;
  /** Accessible description; also the modal caption when no `caption` is set. */
  alt: string;
  /** Already-renderable local object URL (employee draft only). */
  src?: string | null;
  /** Shown inside the placeholder when no preview exists (e.g. "HEIC"). */
  fallbackLabel?: string;
  /** Short status line under the thumbnail (upload lifecycle). */
  status?: { label: string; tone?: "muted" | "success" | "danger" };
  /** Optional user-facing caption shown under the thumbnail and in the modal. */
  caption?: string;
  /**
   * Authorized, on-demand source loader for persisted private evidence. The
   * gallery calls it once per item on mount and again on explicit retry.
   */
  loadSrc?: () => Promise<string>;
}

export function EvidenceImageGallery({
  items,
  ariaLabel = "Image evidence",
  className,
}: {
  items: GalleryImageItem[];
  ariaLabel?: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [sourceState, setSourceState] = useState<Record<string, SourceState>>({});
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const requestedRef = useRef<Set<string>>(new Set());
  const autoRefreshedRef = useRef<Set<string>>(new Set());
  const triggerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const itemsLengthRef = useRef(items.length);

  const titleId = useId();
  const descriptionId = useId();

  // Keeps the keyboard handler's boundary check current without re-binding the
  // document listener on every item change.
  useEffect(() => {
    itemsLengthRef.current = items.length;
  }, [items.length]);

  const fetchSource = useCallback((id: string, load: () => Promise<string>) => {
    setBroken((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setSourceState((current) => ({
      ...current,
      [id]: { url: null, loading: true, error: "" },
    }));
    load().then(
      (url) => {
        setSourceState((current) => ({
          ...current,
          [id]: { url, loading: false, error: "" },
        }));
      },
      (caught: unknown) => {
        setSourceState((current) => ({
          ...current,
          [id]: {
            url: null,
            loading: false,
            error:
              caught instanceof Error && caught.message
                ? caught.message
                : "Could not load this image.",
          },
        }));
      },
    );
  }, []);

  // Persisted evidence is fetched through the existing authorized endpoint —
  // once per item, never silently retried in a loop.
  useEffect(() => {
    for (const item of items) {
      if (!item.src && item.loadSrc && !requestedRef.current.has(item.id)) {
        requestedRef.current.add(item.id);
        fetchSource(item.id, item.loadSrc);
      }
    }
  }, [items, fetchSource]);

  const urlFor = (item: GalleryImageItem): string | null =>
    item.src ?? sourceState[item.id]?.url ?? null;

  const loadingFor = (item: GalleryImageItem): boolean => {
    if (item.src) return false;
    if (!item.loadSrc) return false;
    return sourceState[item.id]?.loading ?? true;
  };

  const errorFor = (item: GalleryImageItem): string =>
    item.src ? "" : (sourceState[item.id]?.error ?? "");

  const retry = (item: GalleryImageItem) => {
    if (!item.loadSrc) return;
    autoRefreshedRef.current.delete(item.id);
    fetchSource(item.id, item.loadSrc);
  };

  const markBroken = (item: GalleryImageItem) => {
    setBroken((current) => new Set(current).add(item.id));
    if (item.loadSrc && !autoRefreshedRef.current.has(item.id)) {
      // An expired signed URL is refreshed once through the same authorized
      // endpoint; a second failure is reported honestly instead of looping.
      autoRefreshedRef.current.add(item.id);
      fetchSource(item.id, item.loadSrc);
    }
  };

  const close = useCallback(() => {
    setOpenIndex(null);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const go = useCallback((delta: -1 | 1) => {
    setOpenIndex((current) => {
      if (current === null) return current;
      const next = current + delta;
      if (next < 0 || next >= itemsLengthRef.current) return current;
      return next;
    });
  }, []);

  const visible = openIndex !== null && items.length > 0;
  const safeIndex = visible ? Math.min(openIndex, items.length - 1) : null;
  const current = safeIndex !== null ? items[safeIndex] : null;

  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        go(1);
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === dialogRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || active === dialogRef.current)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [visible, close, go]);

  if (items.length === 0) return null;

  const overflowCount = items.length > COLLAPSED_SLOTS ? items.length - COLLAPSED_IMAGES : 0;
  const shown = expanded || overflowCount === 0 ? items : items.slice(0, COLLAPSED_IMAGES);
  const gridId = `${titleId}-grid`;

  const openAt = (index: number, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setOpenIndex(index);
  };

  const renderPlaceholder = (item: GalleryImageItem) => {
    if (loadingFor(item)) {
      return (
        <span className="flex flex-col items-center gap-1 text-[10px] text-ink-muted">
          <Spinner className="size-4" />
          <span>Loading</span>
        </span>
      );
    }
    if (errorFor(item) || broken.has(item.id)) {
      return <span className="px-1 text-[10px] font-medium text-danger">Unavailable</span>;
    }
    return (
      <span className="px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        {item.fallbackLabel ?? "Image"}
      </span>
    );
  };

  const currentUrl = current && !broken.has(current.id) ? urlFor(current) : null;
  const currentError = current
    ? errorFor(current) || (broken.has(current.id) ? "That preview could not be loaded." : "")
    : "";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <ul
        id={gridId}
        aria-label={ariaLabel}
        className="grid list-none grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
      >
        {shown.map((item) => {
          const index = items.indexOf(item);
          const url = urlFor(item);
          const canOpen = Boolean(url || item.loadSrc);
          const frameClass = cn(
            "group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas transition-colors",
            canOpen && "hover:border-primary/60",
          );
          const body = url ? (
            // Local object URL or an authorized short-lived signed URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              onError={() => markBroken(item)}
              className="h-full w-full object-contain object-center p-1"
            />
          ) : (
            renderPlaceholder(item)
          );

          return (
            <li key={item.id} className="flex min-w-0 flex-col gap-1">
              {canOpen ? (
                <button
                  type="button"
                  onClick={(event) => openAt(index, event.currentTarget)}
                  aria-label={`Open image ${index + 1} of ${items.length}: ${item.alt}`}
                  className={cn(frameClass, "cursor-pointer focus-visible:outline-2 focus-visible:outline-primary")}
                >
                  {body}
                </button>
              ) : (
                <div className={frameClass} role="img" aria-label={`${item.alt}: preview unavailable`}>
                  {body}
                </div>
              )}
              {(item.status || item.caption) && (
                <span
                  className={cn(
                    "min-w-0 truncate text-center text-[11px]",
                    item.status?.tone === "success"
                      ? "text-success"
                      : item.status?.tone === "danger"
                        ? "text-danger"
                        : "text-ink-muted",
                  )}
                  title={item.caption ?? item.status?.label}
                >
                  {item.status?.label ?? item.caption}
                </span>
              )}
            </li>
          );
        })}

        {overflowCount > 0 && !expanded && (
          <li key="overflow" className="flex min-w-0 flex-col gap-1">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-expanded={false}
              aria-controls={gridId}
              aria-label={`Show ${overflowCount} more image${overflowCount === 1 ? "" : "s"}`}
              className="relative flex aspect-square w-full items-center justify-center rounded-xl border border-primary/30 bg-primary-soft text-base font-semibold text-primary transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span aria-hidden="true">+{overflowCount}</span>
            </button>
            <span aria-hidden="true" className="text-center text-[11px] text-ink-muted">
              more
            </span>
          </li>
        )}
      </ul>

      {expanded && overflowCount > 0 && (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setExpanded(false)} aria-controls={gridId}>
            Show fewer
          </Button>
        </div>
      )}

      {visible && current && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-3 backdrop-blur-sm sm:p-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/15 bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <h2 id={titleId} className="text-sm font-semibold text-ink">
                  Image preview
                </h2>
                <p id={descriptionId} className="truncate text-xs text-ink-muted">
                  Use Previous and Next, or the Left and Right arrow keys. Escape closes the viewer.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close image viewer"
                className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-lg text-ink transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center bg-[#071226] p-2 sm:p-4">
              {currentUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={currentUrl}
                  src={currentUrl}
                  alt={current.alt}
                  onError={() => markBroken(current)}
                  className="max-h-[68vh] w-auto max-w-full object-contain object-center"
                />
              ) : loadingFor(current) ? (
                <div className="flex flex-col items-center gap-2 text-sm text-white/80" role="status">
                  <Spinner className="size-6" />
                  <span>Loading image…</span>
                </div>
              ) : (
                <div className="flex max-w-sm flex-col items-center gap-3 px-4 py-10 text-center">
                  <p className="text-sm text-white/85" role="alert">
                    {currentError || "This image cannot be previewed."}
                  </p>
                  {current.loadSrc && (
                    <Button size="sm" variant="secondary" onClick={() => retry(current)}>
                      Try again
                    </Button>
                  )}
                </div>
              )}
            </div>

            {(current.caption || current.status) && (
              <p className="truncate border-t border-line px-4 py-2 text-sm text-ink-muted">
                {current.caption ?? current.status?.label}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => go(-1)}
                disabled={safeIndex === 0}
              >
                Previous
              </Button>
              <p className="text-sm font-medium text-ink" aria-live="polite">
                {safeIndex !== null ? safeIndex + 1 : 0} of {items.length}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => go(1)}
                disabled={safeIndex !== null && safeIndex === items.length - 1}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
