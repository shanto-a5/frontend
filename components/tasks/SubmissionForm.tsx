"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { ApiError } from "@/lib/api/client";
import { createSubmission, deleteUpload, uploadEvidenceFile } from "@/lib/api/submissions";
import type { EvidenceFileInput } from "@/lib/api/types";

/**
 * The employee submission form (M6, plan §5.3, §6).
 *
 * Files upload INDEPENDENTLY as they are chosen: each row has its own progress
 * bar, its own inline error, and its own retry/remove control, so one failure
 * never costs the others. After a file lands, only its durable handle is kept —
 * a raw URL is never part of the client state either. Links are bounded to 100
 * (the server's own limit) and validated as http(s) as the user types.
 *
 * The whole draft lives in component state; nothing is persisted until Submit,
 * which sends one JSON body carrying the handles + links + description and a
 * client-generated idempotency key so a double-click or a network retry cannot
 * create two attempts.
 */

const MAX_FILES = 10;
const MAX_LINKS = 100;
const MAX_DESCRIPTION = 5000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const ACCEPTED_TYPES =
  ".jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif,image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic,image/heif";

/** MIME types this browser can reliably paint from a local object URL. */
const LOCAL_PREVIEW_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

/** Evidence MIME types the backend allowlist mirrors (multer evidence filter). */
const ALLOWED_EVIDENCE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/x-heic",
  "image/x-heif",
]);

const ALLOWED_EVIDENCE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".heic",
  ".heif",
];

/**
 * Client-side mirror of the server's image allowlist. Some browsers report an
 * empty `file.type` (notably for HEIC picked on Windows), so the extension is
 * the fallback signal — the server still validates independently.
 */
const isAcceptedEvidenceType = (file: File): boolean => {
  if (file.type) return ALLOWED_EVIDENCE_MIME.has(file.type.toLowerCase());
  const name = file.name.toLowerCase();
  return ALLOWED_EVIDENCE_EXTENSIONS.some((ext) => name.endsWith(ext));
};

/** The short label shown as thumbnail fallback when no local preview exists. */
const fileExtensionLabel = (name: string): string => {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toUpperCase() : "FILE";
  return ext.slice(0, 5);
};

type UploadRow = {
  key: string;
  file: File;
  previewUrl: string | null;
  progress: number;
  /**
   * Honest lifecycle: `queued` (added, not yet sent) -> `uploading` (bytes in
   * flight, progress = real XHR upload events) -> `processing` (100% sent,
   * waiting for the server+provider confirmation) -> `done` (server returned
   * a valid staged handle) or `error`. `done` is ONLY set from the response
   * envelope, never from transport progress reaching 100%.
   */
  status: "queued" | "uploading" | "processing" | "done" | "error";
  handle?: EvidenceFileInput;
  error?: string;
};

const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `key-${Math.random().toString(36).slice(2)}-${String(performance.now())}`;

const isHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Row thumbnail: a local object URL when the browser can paint it, an
 * extension placeholder otherwise (HEIC/HEIF before upload), and an instant
 * fallback if the image element itself fails to load — never a broken icon.
 */
function FileThumb({ row }: { row: UploadRow }) {
  const [broken, setBroken] = useState(false);
  if (row.previewUrl && !broken) {
    return (
      // A local object URL — the user's own file, never a server URL.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={row.previewUrl}
        alt=""
        onError={() => setBroken(true)}
        className="size-12 shrink-0 rounded-md border border-line object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-12 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-[10px] font-semibold text-ink-muted"
    >
      {fileExtensionLabel(row.file.name)}
    </span>
  );
}

export function SubmissionForm({
  assignmentId,
  onSubmitted,
}: {
  assignmentId: string;
  onSubmitted?: () => void;
}) {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [links, setLinks] = useState<string[]>([""]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState("");
  const idempotencyKey = useRef(newIdempotencyKey());
  const rowCounter = useRef(0);

  // Preview object URLs are revoked when their row is removed and on unmount,
  // so nothing leaks (plan §5.3, §8.3).
  const rowsRef = useRef<UploadRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(
    () => () => {
      for (const row of rowsRef.current) {
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
      }
    },
    [],
  );

  const patchRow = useCallback((key: string, patch: Partial<UploadRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }, []);

  const startUpload = useCallback(
    async (row: UploadRow) => {
      // Guard: a retry click while this row is already in flight would start a
      // second upload for the same item — ignore it.
      setRows((current) => {
        const existing = current.find((r) => r.key === row.key);
        if (existing && (existing.status === "uploading" || existing.status === "processing")) {
          return current;
        }
        return current.map((r) =>
          r.key === row.key ? { ...r, status: "uploading", progress: 0, error: undefined } : r,
        );
      });
      try {
        const media = await uploadEvidenceFile(row.file, (fraction) =>
          // Transport progress only. At 100% the browser finished SENDing —
          // the server and provider may still be working, so the row enters
          // `processing` and never `done` here.
          fraction >= 1
            ? patchRow(row.key, { progress: 1, status: "processing" })
            : patchRow(row.key, { progress: fraction }),
        );
        // Only a valid server response with the staged handle marks `done`.
        patchRow(row.key, {
          status: "done",
          progress: 1,
          handle: {
            publicId: media.publicId,
            resourceType: media.resourceType,
            format: media.format,
          },
        });
      } catch (caught) {
        patchRow(row.key, {
          status: "error",
          progress: 0,
          error:
            caught instanceof ApiError && caught.status === 413
              ? "Each file must be 10 MB or smaller."
              : caught instanceof ApiError
                ? caught.message
                : "Upload failed. Try again.",
        });
      }
    },
    [patchRow],
  );

  const onFilesChosen = (chosen: FileList | null) => {
    if (!chosen) return;
    const incoming = Array.from(chosen);
    const accepted: UploadRow[] = [];

    setRows((current) => {
      const additions: UploadRow[] = [];
      const room = Math.max(MAX_FILES - current.length, 0);
      for (const file of incoming.slice(0, room)) {
        rowCounter.current += 1;
        const typeOk = isAcceptedEvidenceType(file);
        const row: UploadRow = {
          key: `row-${rowCounter.current}`,
          file,
          // Object URL only for types this browser can actually paint; HEIC/HEIF
          // (and anything else undisplayable) gets a file-type placeholder
          // instead of a broken <img>.
          previewUrl: LOCAL_PREVIEW_TYPES.has(file.type) ? URL.createObjectURL(file) : null,
          progress: 0,
          status: "queued",
        };
        if (!typeOk) {
          row.status = "error";
          row.error =
            "Unsupported format. Use JPG, PNG, WebP, GIF, AVIF or HEIC/HEIF " +
            "(convert HEIC on your phone or with Preview/Photos if needed).";
        } else if (file.size > MAX_FILE_BYTES) {
          row.status = "error";
          row.error = "Each file must be 10 MB or smaller.";
        } else {
          accepted.push(row);
        }
        additions.push(row);
      }
      // Kick off the valid uploads after this state commit.
      queueMicrotask(() => {
        for (const row of accepted) void startUpload(row);
      });
      return [...current, ...additions];
    });
  };

  const removeRow = (row: UploadRow) => {
    setRows((current) => current.filter((r) => r.key !== row.key));
    if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
    if (row.handle) {
      // Best-effort cleanup of an uncommitted upload; a failure just leaves an
      // orphan the plan accepts in v1 (D12). Nothing user-facing depends on it.
      void deleteUpload(row.handle.publicId).catch(() => undefined);
    }
  };

  const updateLink = (index: number, value: string) =>
    setLinks((current) => current.map((link, i) => (i === index ? value : link)));

  const addLink = () => setLinks((current) => (current.length >= MAX_LINKS ? current : [...current, ""]));
  const removeLink = (index: number) =>
    setLinks((current) => (current.length === 1 ? [""] : current.filter((_, i) => i !== index)));

  const successfulFiles = rows.filter((row) => row.handle);
  const totalBytes = successfulFiles.reduce((sum, row) => sum + row.file.size, 0);
  // Anything not yet server-confirmed (`queued`, `uploading`, `processing`)
  // blocks submission — only `done` rows carry a verified staged handle.
  const pendingUploads = rows.some(
    (row) => row.status === "queued" || row.status === "uploading" || row.status === "processing",
  );
  const hasFailedUpload = rows.some((row) => row.status === "error");
  const badLinks = links.filter((link) => link.trim() !== "" && !isHttpUrl(link));
  const totalTooBig = totalBytes > MAX_TOTAL_BYTES;

  const canSubmit =
    !submitting && !pendingUploads && !hasFailedUpload && badLinks.length === 0 && !totalTooBig;

  const onSubmit = async () => {
    setFormError(null);
    setSubmitting(true);
    try {
      const files = successfulFiles.map((row) => row.handle as EvidenceFileInput);
      const cleanLinks = links.map((link) => link.trim()).filter(Boolean);
      const result = await createSubmission(assignmentId, {
        description: description.trim() || undefined,
        links: cleanLinks,
        files,
        idempotencyKey: idempotencyKey.current,
      });
      // Success is reported from the SAVED record the server returned —
      // attempt number, server timestamp and evidence count as persisted.
      const savedAt = new Date(result.submission.createdAt);
      const evidenceCount = result.evidence.length;
      setSuccess(
        result.idempotentReplay
          ? `Already recorded — attempt ${result.submission.attempt}, saved ${savedAt.toLocaleString()}, ` +
            `${evidenceCount} evidence item(s).`
          : `Submitted — attempt ${result.submission.attempt}, saved ${savedAt.toLocaleString()}, ` +
            `${evidenceCount} evidence item${evidenceCount === 1 ? "" : "s"} recorded.`,
      );
      for (const row of rowsRef.current) {
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
      }
      setRows([]);
      setLinks([""]);
      setDescription("");
      idempotencyKey.current = newIdempotencyKey();
      onSubmitted?.();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught : new ApiError(0, null, "Could not submit."));
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (field: string): string | undefined => formError?.fieldError(field);

  return (
    <Card>
      <CardTitle>Submit your work</CardTitle>
      <CardDescription>
        Attach up to {MAX_FILES} images (10 MB each), add up to {MAX_LINKS} links, and describe what
        you did. Each attempt is kept as-is for your boss to review.
      </CardDescription>

      {success && (
        <Alert tone="success" title="Submitted" role="status" className="mt-4">
          {success}
        </Alert>
      )}
      {formError && formError.fields.length === 0 && (
        <Alert tone="danger" title="Could not submit" role="alert" className="mt-4">
          {formError.message}
        </Alert>
      )}

      <form
        className="mt-4 flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) void onSubmit();
        }}
        noValidate
      >
        {/* ---------- files ---------- */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-ink" htmlFor="submission-files">
            Screenshots
          </label>
          <input
            id="submission-files"
            type="file"
            multiple
            accept={ACCEPTED_TYPES}
            disabled={submitting || rows.length >= MAX_FILES}
            onChange={(event) => {
              onFilesChosen(event.target.files);
              event.target.value = "";
            }}
            className="block w-full text-sm text-ink file:mr-3 file:min-h-11 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:text-sm file:font-medium file:text-ink hover:file:bg-canvas focus-visible:outline-2 focus-visible:outline-primary"
            aria-describedby={fieldError("files") ? "submission-files-error" : undefined}
          />
          {fieldError("files") && (
            <p id="submission-files-error" className="text-sm text-danger">
              {fieldError("files")}
            </p>
          )}
          {totalTooBig && <p className="text-sm text-danger">Total upload size must be 100 MB or less.</p>}

          {rows.length > 0 && (
            <ul className="mt-1 divide-y divide-line">
              {rows.map((row) => (
                <li key={row.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <FileThumb row={row} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{row.file.name}</span>
                  <span className="text-xs text-ink-muted">{Math.round(row.file.size / 1024)} KB</span>
                  <div className="flex min-w-40 items-center gap-2">
                    {row.status === "processing" ? (
                      // Transport finished — no honest percentage exists while
                      // the server/provider works, so show a busy state.
                      <progress className="h-2 w-full" aria-label={`Processing upload for ${row.file.name}`} />
                    ) : (
                      <progress
                        value={Math.round(row.progress * 100)}
                        max={100}
                        className="h-2 w-full"
                        aria-label={`Upload progress for ${row.file.name}`}
                      />
                    )}
                    <span className="w-16 text-right text-xs text-ink-muted">
                      {row.status === "queued"
                        ? "Queued"
                        : row.status === "processing"
                          ? "Processing"
                          : row.status === "done"
                            ? "Uploaded"
                            : `${Math.round(row.progress * 100)}%`}
                    </span>
                    <span
                      className={
                        "text-xs " +
                        (row.status === "done"
                          ? "text-success"
                          : row.status === "error"
                            ? "text-danger"
                            : "text-ink-muted")
                      }
                    >
                      {row.status === "queued" && "Waiting"}
                      {row.status === "uploading" && "Uploading…"}
                      {row.status === "processing" && "Processing upload…"}
                      {row.status === "done" && "Uploaded"}
                      {row.status === "error" && "Failed"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {row.status === "error" && (
                      <>
                        {/* `startUpload` itself refuses a retry while this row
                            is in flight, so no disabled-state juggling here
                            (TypeScript narrows status to "error" in this
                            branch anyway). */}
                        <Button size="sm" variant="secondary" onClick={() => void startUpload(row)}>
                          Retry
                        </Button>
                        <span className="text-xs text-danger">{row.error}</span>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => removeRow(row)}>
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ---------- links ---------- */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink">Links</legend>
          <p className="text-sm text-ink-muted">
            Up to {MAX_LINKS} links. Each must be a full http(s) address.
          </p>
          {fieldError("links") && <p className="text-sm text-danger">{fieldError("links")}</p>}
          <ul className="flex flex-col gap-2">
            {links.map((link, index) => (
              <li key={index} className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`submission-link-${index}`}>
                  Link {index + 1}
                </label>
                <input
                  id={`submission-link-${index}`}
                  type="url"
                  inputMode="url"
                  value={link}
                  onChange={(event) => updateLink(index, event.target.value)}
                  placeholder="https://example.com/evidence"
                  aria-invalid={link.trim() !== "" && !isHttpUrl(link) ? true : undefined}
                  className="min-h-11 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-primary"
                />
                <Button size="sm" variant="ghost" onClick={() => removeLink(index)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          {links.length < MAX_LINKS && (
            <div>
              <Button size="sm" variant="secondary" onClick={addLink}>
                Add link
              </Button>
            </div>
          )}
          {badLinks.length > 0 && (
            <p className="text-sm text-danger" role="alert">
              Each link must be a valid http(s) address.
            </p>
          )}
        </fieldset>

        {/* ---------- description ---------- */}
        <Textarea
          label="Description"
          description={`Optional, up to ${MAX_DESCRIPTION} characters.`}
          value={description}
          maxLength={MAX_DESCRIPTION}
          onChange={(event) => setDescription(event.target.value)}
          error={fieldError("description")}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={submitting} disabled={!canSubmit}>
            Submit for review
          </Button>
          {pendingUploads && (
            <span className="text-sm text-ink-muted">
              Waiting for uploads to finish — the button unlocks once every file is confirmed by the
              server.
            </span>
          )}
          {!pendingUploads && hasFailedUpload && (
            <span className="text-sm text-danger">
              Some uploads failed — retry them or remove them before submitting.
            </span>
          )}
          {!pendingUploads && !hasFailedUpload && totalTooBig && (
            <span className="text-sm text-danger">Total upload size must be 100 MB or less.</span>
          )}
        </div>
      </form>
    </Card>
  );
}
