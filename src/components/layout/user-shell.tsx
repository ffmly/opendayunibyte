"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { FullPageLoader } from "@/components/ui/feedback";
import { AppHeader, BottomNav } from "./app-nav";

/**
 * Layout for the visitor app. Requires a signed-in user with a user profile.
 * Guards both redirect and "no profile" states.
 */
export function UserShell({ children }: { children: React.ReactNode }) {
  const { user, hasProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !hasProfile)) {
      router.replace("/join");
    }
  }, [user, hasProfile, loading, router]);

  if (loading) return <FullPageLoader />;
  if (!user || !hasProfile) return <FullPageLoader />;

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
