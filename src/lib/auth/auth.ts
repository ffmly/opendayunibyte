import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { registerUserSchema } from "@shared/schemas";
import { call } from "@/lib/supabase/callable";

export interface AuthResult {
  user: User;
  registered: boolean;
}

export function onAuthChange(
  callback: (user: User | null) => void,
): () => void {
  const supabase = getSupabaseBrowser();
  void supabase.auth.getUser().then(({ data }) => callback(data.user));
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}

export async function signInAnon(): Promise<AuthResult> {
  const supabase = getSupabaseBrowser();
  const current = await supabase.auth.getUser();
  let user = current.data.user;
  if (!user) {
    const result = await supabase.auth.signInAnonymously();
    if (!result.error && result.data.user) {
      user = result.data.user;
    } else {
      // Some Supabase projects intentionally keep the Anonymous provider
      // disabled. Fall back to a server-created, confirmed guest account so
      // event visitors can still join without an email or password.
      const response = await fetch("/api/auth/guest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const guest = (await response.json().catch(() => null)) as
        | { email?: string; password?: string; error?: string }
        | null;
      if (!response.ok || !guest?.email || !guest.password) {
        throw new Error(guest?.error ?? result.error?.message ?? "Guest sign-in failed");
      }
      const signedIn = await supabase.auth.signInWithPassword({
        email: guest.email,
        password: guest.password,
      });
      if (signedIn.error || !signedIn.data.user) {
        throw signedIn.error ?? new Error("Guest sign-in failed");
      }
      user = signedIn.data.user;
    }
  }
  return { user, registered: true };
}

export async function registerProfile(nickname: string, email: string): Promise<number> {
  const parsed = registerUserSchema.safeParse({ nickname, email });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid profile data");
  }
  const res = await call<
    { nickname: string; email: string },
    { points: number; alreadyRegistered?: boolean }
  >("registerUser", {
    nickname: parsed.data.nickname,
    email: parsed.data.email,
  });
  return res.points;
}

export async function registerWithNickname(nickname: string, email = ""): Promise<number> {
  return registerProfile(nickname, email);
}

export async function signOutUser(): Promise<void> {
  const { error } = await getSupabaseBrowser().auth.signOut();
  if (error) throw error;
}

export async function signInAdmin(
  email: string,
  password: string,
): Promise<User> {
  const supabase = getSupabaseBrowser();
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.user) throw result.error ?? new Error("Sign-in failed");
  const role = result.data.user.app_metadata?.role;
  if (role !== "admin" && role !== "staff") {
    await supabase.auth.signOut();
    throw new Error("permission-denied");
  }
  return result.data.user;
}
