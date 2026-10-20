"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [formError, setFormError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFormError("");
    try {
      await requestPasswordReset(email);
      setSent(true);
      setPending(false);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(apiError);
      setFormError(apiError?.message ?? "Could not send the reset email. Please try again.");
      setPending(false);
    }
  };

  return (
    <Card>
      <CardTitle>Reset your password</CardTitle>
      <CardDescription>
        We will email a reset link if that address has an account.
      </CardDescription>
      {sent ? (
        <div className="mt-5">
          <Alert tone="success" title="Check your inbox" role="status">
            If that address has an account, a reset link is on its way. The link
            opens this app&apos;s reset page, where you choose a new password.
          </Alert>
          <p className="mt-4 text-sm">
            <Link href="/login" className="text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4" noValidate>
          {formError && (
            <Alert tone="danger" title="Could not send the request" role="alert">
              {formError}
            </Alert>
          )}
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error?.fieldError("email")}
            required
          />
          <Button type="submit" loading={pending}>
            Send reset link
          </Button>
          <p className="text-sm text-ink-muted">
            Remembered it?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      )}
    </Card>
  );
}
