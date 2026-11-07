"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  QrCode,
  Wrench,
  Zap,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { signOutUser } from "@/lib/auth/auth";
import { FullPageLoader } from "@/components/ui/feedback";
import { cn } from "@/lib/utils/cn";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/qr", label: "QR Codes", icon: QrCode },
  { href: "/admin/workshops", label: "Workshops", icon: Wrench },
  { href: "/admin/quiz", label: "Quiz Control", icon: Zap },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isStaff, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isSignin = pathname === "/admin/signin";

  useEffect(() => {
    if (loading) return;
    if (isSignin) {
      if (isStaff) router.replace("/admin");
      return;
    }
    if (!isStaff) router.replace("/admin/signin");
  }, [loading, isStaff, router, isSignin]);

  // The sign-in page must not be hidden behind the staff guard.
  if (isSignin) return <>{children}</>;
  if (loading || !isStaff) return <FullPageLoader />;

  async function handleSignOut() {
    await signOutUser();
    router.replace("/admin/signin");
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-row items-center gap-1 overflow-x-auto border-b border-line bg-white px-3 py-2 md:w-64 md:flex-col md:items-stretch md:border-b-0 md:border-r md:py-6">
        <Link
          href="/admin"
          className="mb-2 hidden items-center gap-2 px-3 md:flex"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-extrabold text-white">
            U
          </span>
          <span className="text-sm font-extrabold text-ink">UniByte Admin</span>
        </Link>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-muted",
              pathname === item.href
                ? "bg-primary-tint text-primary"
                : "text-ink-soft hover:text-ink",
            )}
          >
            <item.icon className="h-4 w-4" />
            <span className="whitespace-nowrap">{item.label}</span>
          </Link>
        ))}
        <button
          onClick={handleSignOut}
          className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-red-50 md:mt-auto"
        >
          <LogOut className="h-4 w-4" />
          <span className="whitespace-nowrap">Sign out</span>
        </button>
      </aside>

      <main className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
