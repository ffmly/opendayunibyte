"use client";

import Link from "next/link";
import { ScanLine, Trophy, Wrench, BrainCircuit } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useI18n } from "@/components/providers/i18n-provider";
import { useActivityHistory, useWorkshops, useMyRank } from "@/lib/services/data-service";
import { timeAgo } from "@/lib/utils/format";
import { UserShell } from "@/components/layout/user-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/feedback";
import type { XpEventType } from "@shared/models";

const xpTypeLabel: Record<XpEventType, string> = {
  REGISTRATION: "Registration",
  CAT: "Cat",
  WORKSHOP: "Workshop",
  QUIZ: "Quiz",
  MEMORY: "Memory Matrix",
  PASSWORD: "Hack The Password",
  MYSTERY: "UniByte Mystery",
  ACHIEVEMENT: "Achievement",
  ADMIN_ADJUSTMENT: "Adjustment",
};

function DashboardInner() {
  const { user, profile } = useAuth();
  const { t, locale } = useI18n();
  const uid = user?.id;
  const { events, loading: evLoading } = useActivityHistory(uid, 25);
  const { workshops, checkedIn } = useWorkshops(uid);
  const { rank: myRank } = useMyRank(uid);

  const xp = profile?.totalXP ?? 0;
  const rank = myRank ? `#${myRank}` : "—";

  const stats = [
    { icon: BrainCircuit, label: t.activities.quiz, value: "LIVE" },
    { icon: Wrench, label: t.dashboard.workshops, value: `${checkedIn.size}/${workshops.length}` },
    { icon: Trophy, label: t.dashboard.rank, value: rank },
  ];

  return (
    <div className="space-y-5">
      {/* Identity + XP */}
      <section className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-xl font-extrabold text-white">
          {profile?.nickname?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold text-ink">
            {profile?.nickname ?? "…"}
          </h1>
          <p className="text-sm text-ink-soft">
            {t.dashboard.xp} · {xp.toLocaleString()} XP
          </p>
        </div>
      </section>

      {/* SCAN QR — the primary action */}
      <Link href="/scan" className="block">
        <Button size="lg" className="w-full">
          <ScanLine className="h-5 w-5" />
          {t.nav.scan}
        </Button>
      </Link>

      {/* Stats grid */}
      <section className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <Card key={s.label} className="card-pad flex flex-col items-center gap-1 !p-3">
            <s.icon className="h-4 w-4 text-primary" />
            <span className="text-base font-bold text-ink">{s.value}</span>
            <span className="text-center text-[11px] leading-tight text-ink-soft">
              {s.label}
            </span>
          </Card>
        ))}
      </section>

      {/* Recent activity */}
      <section>
        <h2 className="mb-2 text-base font-bold text-ink">
          {t.dashboard.recentActivity}
        </h2>
        <Card className="divide-y divide-line">
          {evLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="p-4 text-sm text-ink-soft">{t.dashboard.noActivity}</p>
          ) : (
            events.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {xpTypeLabel[ev.type] ?? ev.type}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {timeAgo(ev.createdAt, locale)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-primary">
                  +{ev.points}
                </span>
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <UserShell>
      <DashboardInner />
    </UserShell>
  );
}
