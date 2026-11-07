"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/providers/i18n-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { signInAnon, registerProfile } from "@/lib/auth/auth";
import { CallableError } from "@/lib/supabase/callable";

function JoinInner() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, refreshProfile } = useAuth();
  const [customNickname, setCustomNickname] = useState<string | null>(null);
  const nickname = customNickname !== null ? customNickname : (profile?.nickname ?? "");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);
  const token = searchParams.get("token");
  const destination = token
    ? `/scan?token=${encodeURIComponent(token)}`
    : "/dashboard";

  // Already completely registered (both nickname and email present) → proceed to destination
  useEffect(() => {
    if (!startedRef.current && user && profile && profile.email) {
      startedRef.current = true;
      router.replace(destination);
    }
  }, [user, profile, router, destination]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      // Ensure we have a persistent Supabase session in this browser
      await signInAnon();
      // Register new profile or recover existing account with matching nickname + email
      await registerProfile(nickname, email);
      // Ensure the auth context gets the updated profile before navigation
      const synced = await refreshProfile();
      startedRef.current = true;
      if (synced && synced.email) {
        router.replace(destination);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 80));
        await refreshProfile();
        router.replace(destination);
      }
    } catch (err) {
      setBusy(false);
      if (err instanceof CallableError) {
        if (err.message && err.message.includes("different nickname")) {
          setError(
            locale === "ar"
              ? "هذا البريد الإلكتروني مسجل باسم مستعار آخر. يرجى إدخال نفس الاسم المستعار الذي سجلت به سابقاً."
              : "This email is registered under a different nickname. Please enter the same nickname you originally registered with.",
          );
          return;
        }
        if (err.code === "already-exists" || err.message?.toLowerCase().includes("email")) {
          setError(t.errors.emailTaken);
          return;
        }
        if (err.code.includes("nickname")) {
          setError(t.errors.nicknameTaken);
          return;
        }
      }
      setError((err as Error).message || t.errors.generic);
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
                onChange={(e) => setCustomNickname(e.target.value)}
                dir="auto"
              />
            </div>

            <div>
              <label htmlFor="email" className="label">
                {t.join.email}
              </label>
              <input
                id="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder={t.join.emailPlaceholder}
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
              />
              <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                {t.join.emailNotice}
              </p>
            </div>

            <p className="rounded-xl border border-primary/10 bg-primary-tint/40 px-3 py-2 text-xs leading-relaxed text-primary">
              {t.join.deviceNotice}
            </p>

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
