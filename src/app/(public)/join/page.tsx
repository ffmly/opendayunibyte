"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/providers/i18n-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { signInAnon, registerWithNickname } from "@/lib/auth/auth";
import { CallableError } from "@/lib/supabase/callable";

function JoinInner() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, hasProfile, refreshProfile } = useAuth();
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);
  const token = searchParams.get("token");
  const destination = token
    ? `/scan?token=${encodeURIComponent(token)}`
    : "/dashboard";

  useEffect(() => {
    // Already registered → go straight to the main website
    if (!startedRef.current && user && hasProfile) {
      startedRef.current = true;
      router.replace(destination);
    }
  }, [user, hasProfile, router, destination]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const { user: u } = await signInAnon();
      void u;
      // Create the user profile + registration XP reward
      await registerWithNickname(nickname);
      // The profile doc was just created server-side; make the auth context
      // see it before navigating, otherwise the dashboard guard bounces back.
      await refreshProfile();
      // A QR opened from the phone camera continues to its activity after the
      // one-time name step. Normal registrations still go to the dashboard.
      router.replace(destination);
    } catch (err) {
      setBusy(false);
      if (err instanceof CallableError && err.code.includes("nickname")) {
        setError(t.errors.nicknameTaken);
      } else {
        setError(t.errors.generic);
      }
    }
  }

  return (
    <div className="open-day-bg flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="paper-panel w-full max-w-md rounded-[30px] border border-white/70 p-6 shadow-2xl shadow-primary/15 sm:p-8">
          <div className="flex justify-center"><Logo size={96} priority /></div>
          <h1 className="mt-5 text-center text-2xl font-extrabold text-ink">{t.join.title}</h1>
          <p className="mt-1.5 text-center text-sm text-ink-soft">{t.join.subtitle}</p>

        <form
          onSubmit={handleSubmit}
          className="mx-auto mt-8 w-full max-w-sm space-y-4"
        >
          <div>
            <label htmlFor="nickname" className="label">
              {t.join.nickname}
            </label>
            <input
              id="nickname"
              type="text"
              required
              maxLength={24}
              autoComplete="nickname"
              placeholder={t.join.nicknamePlaceholder}
              className="input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              dir="auto"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {busy ? t.common.loading : t.join.continue}
          </Button>
        </form>

          <p className="mx-auto mt-6 max-w-xs text-center text-xs leading-relaxed text-ink-soft">{t.join.legal}</p>
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinInner />
    </Suspense>
  );
}
