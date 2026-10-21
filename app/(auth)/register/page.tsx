"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { register } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { useSession } from "@/components/SessionProvider";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export default function RegisterPage() {
  const router = useRouter();
  const { setUser } = useSession();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [formError, setFormError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFormError("");
    try {
      const user = await register({ name, email, phone, password });
      setUser(user);
      // A fresh account has no company: onboarding is the next step.
      router.replace("/onboarding");
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(apiError);
      setFormError(apiError?.message ?? "Registration failed. Please try again.");
    } finally {
      // Same lifecycle guard as the sign-in form: a successful registration
      // navigates away, and the preserved route instance must come back idle.
      setPending(false);
    }
  };

  return (
    <Card>
      <CardTitle>Create your account</CardTitle>
      <CardDescription>
        You will choose or create your company right after signing up.
      </CardDescription>
      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4" noValidate>
        {formError && (
          <Alert tone="danger" title="Could not create the account" role="alert">
            {formError}
          </Alert>
        )}
        <Input
          label="Full name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error?.fieldError("name")}
          required
        />
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
        <Input
          label="Phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={error?.fieldError("phone")}
          required
        />
        <Input
          label="Password"
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
          Create account
        </Button>
        <p className="text-sm text-ink-muted">
          Already registered?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </Card>
  );
}
