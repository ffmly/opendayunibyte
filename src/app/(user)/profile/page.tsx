"use client";

import { useRouter } from "next/navigation";
import { LogOut, Globe, PawPrint, Wrench, Trophy } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useI18n } from "@/components/providers/i18n-provider";
import { useCats, useWorkshops } from "@/lib/services/data-service";
import { formatDate } from "@/lib/utils/format";
import { UserShell } from "@/components/layout/user-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signOutUser } from "@/lib/auth/auth";
import { locales, type Locale } from "@/lib/i18n/locales";

function ProfileInner() {
  const { user, profile } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const uid = user?.id;
  const { cats, found } = useCats(uid);
  const { workshops, checkedIn } = useWorkshops(uid);

  const stats = [
    { icon: Trophy, label: t.dashboard.xp, value: profile?.totalXP.toLocaleString() ?? "0" },
    { icon: PawPrint, label: t.dashboard.catsFound, value: `${found.size}/${cats.length}` },
    { icon: Wrench, label: t.dashboard.workshops, value: `${checkedIn.size}/${workshops.length}` },
  ];

  async function handleSignOut() {
    await signOutUser();
    router.replace("/join");
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col items-center pt-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-3xl font-extrabold text-white">
          {profile?.nickname?.[0]?.toUpperCase() ?? "?"}
        </div>
        <h1 className="mt-3 text-2xl font-extrabold text-ink">{profile?.nickname}</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          {t.profile.memberSince}{" "}
          {formatDate(profile?.createdAt, locale)}
        </p>
      </section>

      <section className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <Card key={s.label} className="card-pad flex flex-col items-center gap-1">
            <s.icon className="h-4 w-4 text-primary" />
            <span className="text-base font-bold text-ink">{s.value}</span>
            <span className="text-center text-[11px] text-ink-soft">{s.label}</span>
          </Card>
        ))}
      </section>

      <Card className="card-pad">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Globe className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-ink">{t.profile.language}</span>
          </div>
          <div className="flex gap-1">
            {(Object.keys(locales) as Locale[]).map((l) => (
              <Button
                key={l}
                variant={locale === l ? "primary" : "outline"}
                size="sm"
                onClick={() => setLocale(l)}
              >
                {l.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Button variant="outline" className="w-full" onClick={handleSignOut}>
        <LogOut className="h-4 w-4" />
        {t.profile.signOut}
      </Button>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <UserShell>
      <ProfileInner />
    </UserShell>
  );
}
