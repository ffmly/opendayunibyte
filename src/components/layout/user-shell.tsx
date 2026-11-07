"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { FullPageLoader } from "@/components/ui/feedback";
import { AppHeader, BottomNav } from "./app-nav";

/**
 * Layout for the visitor app. Requires a signed-in user with a complete profile (including email).
 * Guards redirect for missing profile or missing email states.
 */
export function UserShell({ children }: { children: React.ReactNode }) {
  const { user, profile, hasProfile, loading } = useAuth();
  const router = useRouter();

  const isProfileComplete = Boolean(user && hasProfile && profile?.email);

  useEffect(() => {
    if (!loading && !isProfileComplete) {
      router.replace("/join");
    }
  }, [loading, isProfileComplete, router]);

  if (loading || !isProfileComplete) return <FullPageLoader />;

  return (
    <div className="open-day-bg flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-28 pt-4">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
