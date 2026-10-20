"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  activateEmployeeRole,
  listMembers,
  offboardMember,
  rotateJoinCode,
  transferBoss,
} from "@/lib/api/company";
import { ApiError } from "@/lib/api/client";
import { useCompany } from "@/components/CompanyProvider";
import { useSession } from "@/components/SessionProvider";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Modal } from "@/components/ui/Modal";
import { Loading } from "@/components/ui/Loading";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CompanyMember } from "@/lib/api/types";

/**
 * Company settings (boss). All four role/tenant actions live here: the team
 * list, join-code rotation, the self-serve employee-role activation
 * (dual-role, plan §2.3/D3) and the boss transfer (D5). Every button maps to
 * a real M4 endpoint — nothing here is a placeholder.
 *
 * Security note: only the SHA-256 digest of a join code is stored, so the
 * plaintext exists only in the response that mints it (creation or rotation).
 * The page says so plainly instead of pretending it can re-show the code.
 */

export default function CompanyPage() {
  const router = useRouter();
  const { user } = useSession();
  const { company, membership, isBoss, status: companyStatus, refresh } = useCompany();

  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");

  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    | { kind: "offboard"; member: CompanyMember }
    | { kind: "transfer"; member: CompanyMember }
    | null
  >(null);
  const [modalError, setModalError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await listMembers();
      setPageError("");
      setMembers(result.members);
    } catch (error) {
      setPageError(error instanceof ApiError ? error.message : "Could not load the team.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (companyStatus === "none") router.replace("/onboarding");
    // state changes land only after the await (react-hooks/set-state-in-effect)
    if (isBoss) {
      void (async () => {
        await load();
      })();
    }
  }, [companyStatus, isBoss, load, router]);

  if (companyStatus === "loading") return <Loading label="Loading company…" />;
  if (companyStatus === "none") return null;

  const run = async (key: string, action: () => Promise<void>, failure: string) => {
    setBusy(key);
    setNotice("");
    setPageError("");
    try {
      await action();
    } catch (error) {
      setPageError(error instanceof ApiError ? error.message : failure);
    } finally {
      setBusy(null);
    }
  };

  const onRotate = () =>
    run(
      "rotate",
      async () => {
        const result = await rotateJoinCode();
        setFreshCode(result.joinCode);
        setNotice("New code generated. The previous code stopped working immediately.");
      },
      "Could not rotate the join code.",
    );

  const onActivateEmployeeRole = () =>
    run(
      "activate",
      async () => {
        const result = await activateEmployeeRole();
        await refresh();
        setNotice(
          result.activated
            ? "You can now also work as an employee in this company."
            : "The employee role was already active.",
        );
      },
      "Could not activate the employee role.",
    );

  const confirmOffboard = async () => {
    if (confirm?.kind !== "offboard") return;
    const member = confirm.member;
    setModalError("");
    setBusy("offboard");
    try {
      await offboardMember(member.membershipId);
      setConfirm(null);
      await load();
      setNotice(`${member.name} has been offboarded.`);
    } catch (error) {
      setModalError(error instanceof ApiError ? error.message : "Could not offboard this member.");
    } finally {
      setBusy(null);
    }
  };

  const confirmTransfer = async () => {
    if (confirm?.kind !== "transfer") return;
    const member = confirm.member;
    setModalError("");
    setBusy("transfer");
    try {
      await transferBoss(member.userId);
      setConfirm(null);
      await refresh();
      await load();
      setNotice(`${member.name} now holds the boss role too.`);
    } catch (error) {
      setModalError(error instanceof ApiError ? error.message : "Could not transfer the boss role.");
    } finally {
      setBusy(null);
    }
  };

  const hasEmployeeRole = membership?.roles.includes("employee") ?? false;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-ink">{company?.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Company timezone: <span className="font-medium text-ink">{company?.timezone}</span> —
          deadlines are shown on this clock for everyone.
        </p>
      </header>

      {notice && (
        <Alert tone="success" title="Done" role="status">
          {notice}
        </Alert>
      )}
      {pageError && (
        <Alert tone="danger" title="Something went wrong" role="alert">
          {pageError}
        </Alert>
      )}

      <Card>
        <CardTitle>Join code</CardTitle>
        <CardDescription>
          Codes are stored only as a secure hash, so the current code cannot be shown again —
          generate a new one to share with employees. The old code dies the moment you rotate.
        </CardDescription>
        {freshCode && (
          <div className="mt-4 rounded-md border border-line bg-canvas px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              New join code — shown once
            </p>
            <p className="mt-1 break-all font-mono text-lg font-semibold text-ink">{freshCode}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => void navigator.clipboard?.writeText(freshCode)}
            >
              Copy code
            </Button>
          </div>
        )}
        <div className="mt-4">
          <Button loading={busy === "rotate"} onClick={onRotate}>
            Generate a new code
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>Your roles</CardTitle>
        <CardDescription>
          You are a boss of this company. Activate the employee role to also receive and
          complete tasks yourself — the plan calls this the dual-role setup.
        </CardDescription>
        <div className="mt-3 flex items-center gap-2">
          {membership?.roles.map((role) => (
            <Badge key={role} tone={role === "boss" ? "info" : "neutral"}>
              {role}
            </Badge>
          ))}
        </div>
        {!hasEmployeeRole && (
          <div className="mt-4">
            <Button
              variant="secondary"
              loading={busy === "activate"}
              onClick={onActivateEmployeeRole}
            >
              Also work as an employee
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>Team</CardTitle>
        <CardDescription>Everyone with an active membership in this company.</CardDescription>
        {loading ? (
          <Loading label="Loading team…" />
        ) : members.length === 0 ? (
          <EmptyState title="No members yet." />
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {members.map((member) => {
              const isSelf = member.userId === user?.id;
              return (
                <li key={member.membershipId} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {member.name}
                      {isSelf && <span className="ml-2 text-xs text-ink-muted">(you)</span>}
                    </p>
                    <p className="truncate text-sm text-ink-muted">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {member.roles.map((role) => (
                      <Badge key={role} tone={role === "boss" ? "info" : "neutral"}>
                        {role}
                      </Badge>
                    ))}
                  </div>
                  {!isSelf && (
                    <div className="flex gap-2">
                      {!member.roles.includes("boss") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={busy === "transfer"}
                          onClick={() => {
                            setModalError("");
                            setConfirm({ kind: "transfer", member });
                          }}
                        >
                          Make boss
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        onClick={() => {
                          setModalError("");
                          setConfirm({ kind: "offboard", member });
                        }}
                      >
                        Offboard
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal
        open={confirm?.kind === "offboard"}
        title="Offboard this member?"
        onClose={() => setConfirm(null)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy === "offboard"} onClick={confirmOffboard}>
              Offboard
            </Button>
          </div>
        }
      >
        <p>
          {confirm?.kind === "offboard"
            ? `${confirm.member.name} loses access to this company's tasks immediately. Their history stays.`
            : ""}
        </p>
        {modalError && (
          <Alert tone="danger" title="Could not offboard" role="alert" className="mt-3">
            {modalError}
          </Alert>
        )}
      </Modal>

      <Modal
        open={confirm?.kind === "transfer"}
        title="Grant the boss role?"
        onClose={() => setConfirm(null)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button loading={busy === "transfer"} onClick={confirmTransfer}>
              Make boss
            </Button>
          </div>
        }
      >
        <p>
          {confirm?.kind === "transfer"
            ? `${confirm.member.name} will be able to assign tasks, manage the team, and manage the join code — exactly as you can now. You keep your own boss role; offboard yourself afterwards if you intend to step down.`
            : ""}
        </p>
        {modalError && (
          <Alert tone="danger" title="Could not transfer" role="alert" className="mt-3">
            {modalError}
          </Alert>
        )}
      </Modal>
    </div>
  );
}
