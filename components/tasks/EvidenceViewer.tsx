"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ApiError } from "@/lib/api/client";
import { getEvidenceUrl } from "@/lib/api/submissions";
import type { Evidence } from "@/lib/api/types";

/**
 * Renders one submission attempt's evidence (M6, plan §5.5; reused by the M7
 * review screen).
 *
 * Files are PRIVATE: the payload only ever carries a durable `publicId`, never
 * a delivery URL. Bytes are loaded only after the user asks for them, through
 * the authorized `GET /evidence/:id/url`, which mints a short-lived signed URL.
 * Nothing is fetched silently, and a failure to sign shows an honest error
 * rather than falling back to an unsigned link.
 *
 * Links are external and are rendered as real anchors with
 * `rel="noopener noreferrer"` and the URL visible as text, so a person can see
 * where a link goes before following it.
 */

function EvidenceFile({ evidence }: { evidence: Evidence }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getEvidenceUrl(evidence.id);
      setUrl(result.url);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not open this file.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {url ? (
        // The signed URL expires; a reload simply re-fetches one. The `key`
        // forces a fresh <img> so a stale failure state cannot linger.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt={evidence.caption || "Submitted evidence"}
          className="max-h-96 w-auto rounded-md border border-line"
          onError={() => {
            setUrl(null);
            setError("That preview expired. Open it again to load a fresh link.");
          }}
        />
      ) : (
        <Button size="sm" variant="secondary" loading={loading} onClick={() => void load()}>
          {`Open ${evidence.format ?? "image"}`}
        </Button>
      )}
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

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

  return (
    <div className="flex flex-col gap-4">
      {evidence.some((item) => item.kind === "file") && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-ink">Files</h3>
          <ul className="flex flex-col gap-4">
            {evidence
              .filter((item) => item.kind === "file")
              .map((item) => (
                <li key={item.id} className="flex flex-col gap-1">
                  <EvidenceFile evidence={item} />
                  {item.caption && <p className="text-sm text-ink-muted">{item.caption}</p>}
                </li>
              ))}
          </ul>
        </div>
      )}

      {evidence.some((item) => item.kind === "link") && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-ink">Links</h3>
          <ul className="flex flex-col gap-1">
            {evidence
              .filter((item) => item.kind === "link")
              .map((item) => (
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

      {evidence.length > 0 && !evidence.some((item) => item.kind === "file") && (
        <Alert tone="neutral" title="Note">
          No files were attached to this attempt — only links.
        </Alert>
      )}
    </div>
  );
}
