"use client";

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAssignment } from "@/lib/api/tasks";
import type { AssignmentDetailResponse } from "@/lib/api/tasks";
import { approveSubmission, requestChanges } from "@/lib/api/review";
import { ApiError } from "@/lib/api/client";
import { useCompany } from "@/components/CompanyProvider";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea, Input } from "@/components/ui/Field";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import { Alert } from "@/components/ui/Alert";
import { EvidenceViewer } from "@/components/tasks/EvidenceViewer";
import { ActivityTimeline } from "@/components/tasks/ActivityTimeline";
import { SubmissionStatusBadge } from "@/components/tasks/StatusBadges";
import { formatInstant, relativeFromNow } from "@/lib/format";

/**
 * The boss review screen (M7, plan §6, §4.1).
 *
 * One screen: the attempt under review with its evidence (private bytes loaded
 * through signed URLs on demand), the employee's description, the full attempt
 * history, and the append-only timeline. Approve and Request-changes are
 * SEPARATED controls — a change request needs a message and may carry a revised
 * deadline — and approve asks for confirmation, because it is a terminal act.
 *
 * The server is the authority on legality: a decision on an attempt that is no
 * longer `submitted` answers 409 and this screen re-loads rather than guessing.
 */

export default function ReviewDetailPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = use(params);
  const router = useRouter();
  const { company, isBoss, status: companyStatus } = useCompany();
  const timezone = company?.timezone ?? "Asia/Dhaka";

  const [data, setData] = useState<AssignmentDetailResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"approve" | "changes" | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [message, setMessage] = useState("");
  const [revisedDueAt, setRevisedDueAt] = useState("");
  const [decisionError, setDecisionError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getAssignment(assignmentId);
      setError("");
      setMissing(false);
      setData(result);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        setData(null);
        setMissing(true);
      } else {
        setData(null);
        setError(caught instanceof ApiError ? caught.message : "Could not load this submission.");
      }
    }
  }, [assignmentId]);

  useEffect(() => {
    if (companyStatus === "none") router.replace("/onboarding");
  }, [companyStatus, router]);

  useEffect(() => {
    if (companyStatus === "ready" && !isBoss) router.replace("/dashboard");
  }, [companyStatus, isBoss, router]);

  useEffect(() => {
    if (companyStatus !== "ready") return;
    void (async () => {
      await load();
    })();
  }, [companyStatus, load]);

  const onApprove = async () => {
    const current = data?.submissions.find((s) => s.status === "pending") ?? data?.submissions[0];
    if (!current) return;
    setBusy("approve");
    setDecisionError(null);
    try {
      await approveSubmission(current.id);
      setConfirmApprove(false);
      setNotice("Approved.");
      await load();
    } catch (caught) {
      setConfirmApprove(false);
      setDecisionError(caught instanceof ApiError ? caught : null);
    } finally {
      setBusy(null);
    }
  };

  const onRequestChanges = async () => {
    const current = data?.submissions.find((s) => s.status === "pending") ?? data?.submissions[0];
    if (!current) return;
    if (!message.trim()) {
      setDecisionError(
        new ApiError(422, { code: "validation_failed", message: "Please fix the highlighted fields.", fields: [{ field: "message", message: "Tell the employee what to change." }] }, "Add a message."),
      );
      return;
    }
    setBusy("changes");
    setDecisionError(null);
    try {
      await requestChanges(current.id, {
        message: message.trim(),
        revisedDueAt: revisedDueAt ? revisedDueAt : undefined,
      });
      setShowChanges(false);
      setMessage("");
      setRevisedDueAt("");
      setNotice("Changes requested.");
      await load();
    } catch (caught) {
      setDecisionError(caught instanceof ApiError ? caught : null);
    } finally {
      setBusy(null);
    }
  };

  if (companyStatus === "loading" || companyStatus === "none" || (!data && !missing && !error)) {
    return <Loading label="Loading the submission…" />;
  }

  if (missing) {
    return (
      <EmptyState
        title="Submission not found."
        hint="It may belong to another company — either way it stays invisible to you."
        action={
          <Link href="/review">
            <Button variant="secondary">Back to the queue</Button>
          </Link>
        }
      />
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="danger" title="Could not load this submission" role="alert">
          {error}
        </Alert>
        <Button variant="secondary" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  const { assignment, task, submissions, activity } = data;
  const current = submissions.find((s) => s.status === "pending") ?? null;
  const decided = assignment.state === "approved" || assignment.state === "changes_requested";
  const canDecide = Boolean(current);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">{task.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {assignment.assigneeName} · effective deadline{" "}
            {formatInstant(assignment.effectiveDueAt, timezone)} ·{" "}
            {relativeFromNow(assignment.effectiveDueAt)}
          </p>
        </div>
        <Link href="/review">
          <Button variant="ghost">Back to the queue</Button>
        </Link>
      </header>

      {notice && (
        <Alert tone="success" title="Done" role="status">
          {notice}
        </Alert>
      )}
      {decisionError && decisionError.fields.length === 0 && (
        <Alert tone="danger" title="Could not record that decision" role="alert">
          {decisionError.message}
        </Alert>
      )}

      {task.instructions && (
        <Card>
          <CardTitle>Instructions</CardTitle>
          <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{task.instructions}</p>
        </Card>
      )}

      <Card>
        <CardTitle>Attempts</CardTitle>
        <CardDescription>Newest first. Earlier attempts stay exactly as submitted.</CardDescription>
        {submissions.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">No submissions yet.</p>
        ) : (
          <ol className="mt-4 flex flex-col gap-6">
            {submissions.map((submission) => (
              <li key={submission.id} className="border-l-2 border-line pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">Attempt {submission.attempt}</span>
                  <SubmissionStatusBadge status={submission.status} />
                  <span className="text-xs text-ink-muted">
                    {formatInstant(submission.createdAt, timezone)}
                  </span>
                </div>
                {submission.description && (
                  <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">
                    {submission.description}
                  </p>
                )}
                {submission.reviewAction?.action === "changes_requested" && (
                  <Alert tone="warning" title="Changes requested" className="mt-3">
                    {submission.reviewAction.message}
                    {submission.reviewAction.revisedDueAt && (
                      <span className="mt-1 block text-xs">
                        New deadline: {formatInstant(submission.reviewAction.revisedDueAt, timezone)}
                      </span>
                    )}
                  </Alert>
                )}
                <div className="mt-3">
                  <EvidenceViewer evidence={submission.evidence} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {canDecide && (
        <Card>
          <CardTitle>Your decision</CardTitle>
          <CardDescription>
            Approving is final for this assignment. Requesting changes sends it back to the employee
            with your message.
          </CardDescription>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => setConfirmApprove(true)} loading={busy === "approve"}>
              Approve
            </Button>
            <Button variant="secondary" onClick={() => setShowChanges(true)}>
              Request changes
            </Button>
          </div>
        </Card>
      )}

      {decided && (
        <Alert tone="info" title="Already reviewed">
          This attempt has been reviewed; no further decision is possible on it.
        </Alert>
      )}

      <ActivityTimeline activity={activity} timezone={timezone} />

      <Modal
        open={confirmApprove}
        title="Approve this work?"
        onClose={() => setConfirmApprove(false)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirmApprove(false)}>
              Not yet
            </Button>
            <Button loading={busy === "approve"} onClick={() => void onApprove()}>
              Approve
            </Button>
          </div>
        }
      >
        <p>
          Approving is final: the employee&rsquo;s work is marked done and cannot return to review. If
          anything needs fixing, request changes instead.
        </p>
      </Modal>

      <Modal
        open={showChanges}
        title="Request changes"
        onClose={() => setShowChanges(false)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowChanges(false)}>
              Cancel
            </Button>
            <Button loading={busy === "changes"} onClick={() => void onRequestChanges()}>
              Send request
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Textarea
            label="What needs to change?"
            description="Required — the employee needs to know what to do next."
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            error={decisionError?.fieldError("message")}
            required
          />
          <Input
            label={`Revised deadline (${timezone})`}
            description="Optional. Leave blank to keep the current deadline."
            type="datetime-local"
            value={revisedDueAt}
            onChange={(event) => setRevisedDueAt(event.target.value)}
            error={decisionError?.fieldError("revisedDueAt")}
          />
        </div>
      </Modal>
    </div>
  );
}
