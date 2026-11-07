"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { call } from "@/lib/supabase/callable";
import type { UserProfile } from "@shared/models";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  hasProfile: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  refreshProfile: () => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminRole, setAdminRole] = useState<"admin" | "staff" | null>(null);

  const sync = async (forcedUser?: User | null): Promise<UserProfile | null> => {
    const supabase = getSupabaseBrowser();
    let currentUser = forcedUser;
    if (currentUser === undefined) {
      const { data } = await supabase.auth.getUser();
      currentUser = data.user;
    }
    setUser(currentUser);
    if (currentUser) {
      const role = (currentUser.app_metadata?.role as "admin" | "staff") ?? null;
      setAdminRole(role);
      try {
        const result = await call<unknown, UserProfile>("getMyProfile");
        setProfile(result);
        setLoading(false);
        return result;
      } catch {
        setProfile(null);
        setLoading(false);
        return null;
      }
    } else {
      setProfile(null);
      setAdminRole(null);
      setLoading(false);
      return null;
    }
  };

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    void supabase.auth.getUser().then(({ data }) => sync(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void sync(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const refreshProfile = useMemo(
    () => async () => {
      return await sync();
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      hasProfile: !!profile,
      isAdmin: adminRole === "admin",
      isStaff: adminRole === "staff" || adminRole === "admin",
      refreshProfile,
    }),
    [user, profile, loading, adminRole, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
