"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { useSession } from "@/components/SessionProvider";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useSession();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [formError, setFormError] = useState("");

  const nextPath = searchParams.get("next");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFormError("");
    try {
      const user = await login(identifier, password);
      setUser(user);
      // A signed-in user without a company belongs in onboarding; honour an
      // explicit ?next= otherwise (validated server-side redirect-free: it is
      // only ever a same-origin path this app produced).
      const target =
        nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
          ? nextPath
          : "/dashboard";
      router.replace(target);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(apiError);
      setFormError(
        apiError && apiError.status === 401
          ? "That email/phone and password combination is not correct."
          : apiError?.message ?? "Sign in failed. Please try again.",
      );
      setPending(false);
    }
  };

  return (
    <Card>
      <CardTitle>Sign in</CardTitle>
      <CardDescription>Use the email or phone number on your account.</CardDescription>
      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4" noValidate>
        {formError && (
          <Alert tone="danger" title="Could not sign in" role="alert">
            {formError}
          </Alert>
        )}
        <Input
          label="Email or phone"
          name="email"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          error={error?.fieldError("email")}
          required
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error?.fieldError("password")}
          required
        />
        <Button type="submit" loading={pending}>
          Sign in
        </Button>
        <div className="flex flex-col gap-1 text-sm">
          <Link href="/forgot-password" className="text-primary hover:underline">
            Forgot your password?
          </Link>
          <p className="text-ink-muted">
            No account yet?{" "}
            <Link href="/register" className="text-primary hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
