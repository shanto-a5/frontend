"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { confirmPasswordReset } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

/**
 * The target of the emailed reset link: `PUBLIC_APP_URL` on the backend points
 * at this route, and the page reads the raw `token` query parameter (the
 * backend's reset validator matches the same TOKEN_SHAPE).
 */
function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [formError, setFormError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFormError("");
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(apiError);
      setFormError(
        apiError?.status === 404
          ? "This reset link is not valid or has already been used. Request a new one."
          : apiError?.message ?? "Could not reset the password. Please try again.",
      );
    } finally {
      setPending(false);
    }
  };

  if (!token) {
    return (
      <Card>
        <Alert tone="danger" title="Missing reset link">
          This page needs the link from your reset email.{" "}
          <Link href="/forgot-password" className="underline">
            Request a new one
          </Link>
          .
        </Alert>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Choose a new password</CardTitle>
      <CardDescription>This replaces the password on your account.</CardDescription>
      {done ? (
        <div className="mt-5">
          <Alert tone="success" title="Password updated" role="status">
            Your password has been reset. You can sign in with it now.
          </Alert>
          <p className="mt-4 text-sm">
            <Link href="/login" className="text-primary hover:underline">
              Go to sign in
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4" noValidate>
          {formError && (
            <Alert tone="danger" title="Could not reset the password" role="alert">
              {formError}
            </Alert>
          )}
          <Input
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            description="At least 8 characters."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error?.fieldError("password")}
            required
          />
          <Button type="submit" loading={pending}>
            Set new password
          </Button>
        </form>
      )}
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
