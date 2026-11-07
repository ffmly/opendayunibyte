"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInAdmin } from "@/lib/auth/auth";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils/cn";

export default function AdminSignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInAdmin(email, password);
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "";
      setError(msg.includes("wrong-password") || msg.includes("not-found") || msg.includes("invalid-credential")
        ? "Invalid email or password."
        : msg.includes("permission")
          ? "This account does not have admin access."
          : "Sign-in failed. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo size={56} />
          <h1 className="text-xl font-extrabold text-ink">
            UniByte Open Day Admin
          </h1>
          <p className="text-sm text-ink-soft">
            Sign in with your staff account.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-line bg-white p-6"
        >
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p
              className={cn(
                "rounded-lg bg-red-50 px-3 py-2 text-sm text-danger",
              )}
            >
              {error}
            </p>
          )}

          <Button type="submit" loading={busy} className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
