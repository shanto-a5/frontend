"use client";

import { Alert } from "@/components/ui/Alert";
import { EvidenceImageGallery, type GalleryImageItem } from "@/components/tasks/EvidenceImageGallery";
import { getEvidenceUrl } from "@/lib/api/submissions";
import type { Evidence } from "@/lib/api/types";

/**
 * Renders one submission attempt's evidence (M6, plan §5.5; reused by the M7
 * review screen and the employee's attempt history).
 *
 * Files are PRIVATE: the payload only ever carries a durable `publicId`, never
 * a delivery URL. A thumbnail requests bytes through the authorized
 * `GET /evidence/:id/url`, which mints a short-lived signed URL — the gallery
 * never falls back to an unsigned/public link and never persists the URL.
 * Signed-URL failures surface honestly with a retry; expired URLs are
 * re-fetched once through the same authorized endpoint.
 *
 * Links are external and are rendered as real anchors with
 * `rel="noopener noreferrer"` and the URL visible as text, so a person can see
 * where a link goes before following it.
 */
export function EvidenceViewer({
  evidence,
  emptyHint = "No files or links were attached to this attempt.",
}: {
  evidence: Evidence[];
  emptyHint?: string;
}) {
  if (evidence.length === 0) {
    return <p className="text-sm text-ink-muted">{emptyHint}</p>;
  }

  const files = evidence.filter((item) => item.kind === "file");
  const links = evidence.filter((item) => item.kind === "link");

  const images: GalleryImageItem[] = files.map((item, index) => ({
    id: item.id,
    alt: item.caption || `Submitted evidence ${index + 1}`,
    fallbackLabel: (item.format ?? "IMG").toUpperCase().slice(0, 5),
    caption: item.caption || undefined,
    loadSrc: async () => {
      const result = await getEvidenceUrl(item.id);
      if (!result.url) throw new Error("No preview is available for this file.");
      return result.url;
    },
  }));

  return (
    <div className="flex flex-col gap-4">
      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-ink">
            Files <span className="font-normal text-ink-muted">({files.length})</span>
          </h3>
          <EvidenceImageGallery ariaLabel="Evidence images" items={images} />
        </div>
      )}

      {links.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-ink">Links</h3>
          <ul className="flex flex-col gap-1">
            {links.map((item) => (
              <li key={item.id} className="min-w-0">
                <a
                  href={item.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {item.url}
                </a>
                {item.caption && <p className="text-sm text-ink-muted">{item.caption}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {evidence.length > 0 && files.length === 0 && (
        <Alert tone="neutral" title="Note">
          No files were attached to this attempt — only links.
        </Alert>
      )}
    </div>
  );
}
