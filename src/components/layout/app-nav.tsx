"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, Trophy, User, ScanLine } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils/cn";
import { Logo } from "@/components/brand/logo";

export function AppHeader() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-20 border-b border-primary/10 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Logo size={32} />
          <span className="text-sm font-bold text-ink">{t.app.name}</span>
        </Link>
      </div>
    </header>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  const items: NavItem[] = [
    { href: "/dashboard", label: t.nav.home, icon: Home },
    { href: "/activities", label: t.nav.activities, icon: LayoutGrid },
    { href: "/scan", label: t.nav.scan, icon: ScanLine },
    { href: "/leaderboard", label: t.nav.leaderboard, icon: Trophy },
    { href: "/profile", label: t.nav.profile, icon: User },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-primary/10 bg-white/88 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-md items-stretch justify-between">
        {items.map((item) => {
          const active = pathname === item.href;
          const isScan = item.href === "/scan";
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                isScan ? "-mt-5" : "",
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                  isScan
                    ? "bg-primary text-white shadow-sm"
                    : active
                      ? "bg-primary-tint text-primary"
                      : "text-ink-soft",
                )}
              >
                <item.icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <span
                className={cn(
                  "font-medium",
                  active ? "text-primary" : "text-ink-soft",
                  isScan ? "text-primary" : "",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
