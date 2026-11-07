"use client";

import { Crown, Medal, Trophy } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useI18n } from "@/components/providers/i18n-provider";
import { useLeaderboard } from "@/lib/services/data-service";
import { formatNumber } from "@/lib/utils/format";
import { UserShell } from "@/components/layout/user-shell";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/feedback";
import { cn } from "@/lib/utils/cn";

const rankBadge = [
  { color: "bg-amber-100 text-amber-700", icon: Crown },
  { color: "bg-gray-100 text-gray-600", icon: Medal },
  { color: "bg-orange-100 text-orange-700", icon: Trophy },
];

function LeaderboardInner() {
  const { user } = useAuth();
  const { t } = useI18n();
  const uid = user?.id;
  const { entries, myEntry, totalUsers, loading } = useLeaderboard(uid, 500);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-ink">{t.leaderboard.title}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-soft">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            {t.leaderboard.updated}
          </p>
        </div>
        {(totalUsers ?? 0) > 0 && (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            {totalUsers} {t.dashboard.rank === "الترتيب" ? "مشارك" : "participants"}
          </span>
        )}
      </header>

      {/* Your row */}
      {myEntry && (
        <Card className="card-pad flex items-center justify-between bg-primary-tint !border-primary/20 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-white shadow-sm">
              {myEntry.rank ? `#${myEntry.rank}` : (myEntry.nickname?.[0]?.toUpperCase() ?? "?")}
            </span>
            <div>
              <p className="text-sm font-bold text-primary flex items-center gap-1.5">
                <span>{t.leaderboard.you}</span>
                {myEntry.rank && (
                  <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-extrabold text-primary">
                    #{myEntry.rank}
                  </span>
                )}
              </p>
              <p className="text-xs text-ink-soft">{myEntry.nickname}</p>
            </div>
          </div>
          <div className="text-end">
            <p className="text-base font-extrabold text-primary">
              {formatNumber(myEntry.totalXP)}
            </p>
            <p className="text-[11px] text-ink-soft">{t.leaderboard.xp}</p>
          </div>
        </Card>
      )}

      {/* Top list */}
      <Card className="divide-y divide-line">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="p-4 text-sm text-ink-soft">—</p>
        ) : (
          entries.map((e, i) => {
            const badge = rankBadge[i] ?? null;
            const isMe = e.uid === uid;
            return (
              <div
                key={e.uid}
                className={cn(
                  "flex items-center justify-between px-4 py-3",
                  isMe && "bg-primary-tint",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                      badge ? badge.color : "bg-surface-muted text-ink-soft",
                    )}
                  >
                    {badge ? <badge.icon className="h-4 w-4" /> : i + 1}
                  </span>
                  <p className="truncate text-sm font-medium text-ink">
                    {e.nickname}
                    {isMe && (
                      <span className="ms-1 text-xs text-primary">
                        ({t.leaderboard.you})
                      </span>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-primary">
                  {formatNumber(e.totalXP)}
                </span>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <UserShell>
      <LeaderboardInner />
    </UserShell>
  );
}
