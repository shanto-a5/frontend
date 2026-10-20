"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createCompany, joinCompany } from "@/lib/api/company";
import { ApiError } from "@/lib/api/client";
import { useCompany } from "@/components/CompanyProvider";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/cn";

/**
 * First stop after sign-up (or for any account without a company): create one
 * and become its boss, or join an existing one with the code a boss shared —
 * the only two paths into a company in v1 (plan §2.3, D1).
 */

type Mode = "choose" | "create" | "join";

function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Dhaka";
  } catch {
    return "Asia/Dhaka";
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 409) return error.message;
  return error.message || fallback;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { refresh } = useCompany();

  const [mode, setMode] = useState<Mode>("choose");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(guessTimezone);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [formError, setFormError] = useState("");

  const finish = async () => {
    await refresh();
    router.replace("/dashboard");
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFormError("");
    try {
      await createCompany({ name, timezone });
      await finish();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : null);
      setFormError(errorMessage(caught, "Could not create the company. Please try again."));
      setPending(false);
    }
  };

  const onJoin = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFormError("");
    try {
      await joinCompany(code);
      await finish();
    } catch (caught) {
      // 404 on join is always the same answer for wrong and unknown codes
      // (anti-enumeration, plan §2.3) — phrase it for a human.
      const apiError = caught instanceof ApiError ? caught : null;
      setError(apiError);
      setFormError(
        apiError?.status === 404
          ? "We could not find a company with that code. Check the code with your boss — or ask them to generate a new one."
          : errorMessage(caught, "Could not join the company. Please try again."),
      );
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {formError && (
        <Alert tone="danger" title="Could not continue" role="alert">
          {formError}
        </Alert>
      )}

      {mode === "choose" && (
        <>
          <Card>
            <CardTitle>Create a company</CardTitle>
            <CardDescription>
              You become its boss: you can assign tasks, manage the team, and share the join code.
            </CardDescription>
            <div className="mt-4">
              <Button onClick={() => setMode("create")}>Create a company</Button>
            </div>
          </Card>
          <Card>
            <CardTitle>Join with a code</CardTitle>
            <CardDescription>
              Your boss shares a company code. Joining makes you an employee of that company.
            </CardDescription>
            <div className="mt-4">
              <Button variant="secondary" onClick={() => setMode("join")}>
                I have a code
              </Button>
            </div>
          </Card>
        </>
      )}

      {mode === "create" && (
        <Card>
          <CardTitle>Create your company</CardTitle>
          <CardDescription>
            Deadlines are shown in the company timezone for everyone.
          </CardDescription>
          <form onSubmit={onCreate} className="mt-5 flex flex-col gap-4" noValidate>
            <Input
              label="Company name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={error?.fieldError("name")}
              required
            />
            <Input
              label="Company timezone"
              name="timezone"
              description="An IANA name such as Asia/Dhaka. It sets the clock everyone shares."
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              error={error?.fieldError("timezone")}
              required
            />
            <div className="flex gap-2">
              <Button type="submit" loading={pending}>
                Create company
              </Button>
              <Button variant="ghost" onClick={() => setMode("choose")}>
                Back
              </Button>
            </div>
          </form>
        </Card>
      )}

      {mode === "join" && (
        <Card>
          <CardTitle>Join a company</CardTitle>
          <CardDescription>
            Enter the code your boss shared. Codes look like ABCDE-FGHJK-MNPQR-STVWX-YZ012-3.
          </CardDescription>
          <form onSubmit={onJoin} className="mt-5 flex flex-col gap-4" noValidate>
            <Input
              label="Company code"
              name="code"
              autoComplete="off"
              spellCheck={false}
              className={cn("font-mono uppercase")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              error={error?.fieldError("code")}
              required
            />
            <div className="flex gap-2">
              <Button type="submit" loading={pending}>
                Join company
              </Button>
              <Button variant="ghost" onClick={() => setMode("choose")}>
                Back
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
