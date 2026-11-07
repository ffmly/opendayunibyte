"use client";

import { useEffect, useState } from "react";
import { call } from "@/lib/supabase/callable";
import type { LeaderboardEntry } from "@shared/models";
import { Logo } from "@/components/brand/logo";
import { formatNumber } from "@/lib/utils/format";

/**
 * Big 16:9 realtime leaderboard screen for a projector / lobby display.
 */
export default function LeaderboardScreen() {
  const [entries, setEntries] = useState<Array<LeaderboardEntry & { uid: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = await call<{ top: number }, { entries: Array<LeaderboardEntry & { uid: string }> }>("getLeaderboard", { top: 20 });
      if (!cancelled) setEntries(result.entries);
    };
    void load();
    const timer = window.setInterval(load, 2_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  return (
    <main className="flex min-h-dvh flex-col bg-white px-16 py-10 text-ink">
      <header className="flex items-center justify-between border-b border-line pb-6">
        <div className="flex items-center gap-4">
          <Logo size={56} />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-primary">
              OPEN DAY
            </h1>
            <p className="text-sm text-ink-soft">Live Leaderboard</p>
          </div>
        </div>
      </header>

      <section className="mt-8 flex-1">
        <ol className="space-y-3">
          {entries.map((e, i) => (
            <li
              key={e.uid}
              className="flex items-center justify-between rounded-xl border border-line px-6 py-4"
            >
              <div className="flex items-center gap-5">
                <span
                  className={
                    "flex h-12 w-12 items-center justify-center rounded-full text-lg font-extrabold " +
                    (i === 0
                      ? "bg-amber-100 text-amber-700"
                      : i === 1
                        ? "bg-gray-100 text-gray-600"
                        : i === 2
                          ? "bg-orange-100 text-orange-700"
                          : "bg-surface-muted text-ink-soft")
                  }
                >
                  {i + 1}
                </span>
                <span className="text-2xl font-bold">{e.nickname}</span>
              </div>
              <span className="text-2xl font-extrabold text-primary">
                {formatNumber(e.totalXP)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
