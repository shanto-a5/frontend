import { Loading } from "@/components/ui/Loading";

/**
 * Implicit `<Suspense>` boundary around every page in the authenticated group
 * (Cache Components, plan §6).
 *
 * The app shell (header, nav, providers) prerenders as the static shell, while
 * the dynamic routes underneath — `/tasks/[id]`, `/review/[assignmentId]` —
 * read runtime-only `params` via `use(params)` in client components. Next.js
 * documents the fix for exactly this shape: pass the `params` promise into a
 * `<Suspense>` boundary instead of resolving it at the top level, so the shell
 * can prerender while the params are still unknown and the page streams in
 * behind this fallback (nextjs.org/docs/messages/blocking-prerender-dynamic).
 *
 * This file is that boundary — no `export const instant = false` anywhere.
 */
export default function AppGroupLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loading label="Loading…" />
    </div>
  );
}
