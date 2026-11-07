"use client";

import { useEffect, useState } from "react";
import { call } from "@/lib/supabase/callable";
import { useAuth } from "@/components/providers/auth-provider";
import { formatNumber } from "@/lib/utils/format";
import { QrCode as QrIcon, Users, Trophy, Package } from "lucide-react";

interface Stats {
  totalUsers: number;
  catsFound: number;
  workshopCheckins: number;
  quizParticipants: number;
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-tint text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-2xl font-extrabold text-ink">{formatNumber(value)}</p>
        <p className="text-xs font-medium text-ink-soft">{label}</p>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [leaderboard, setLeaderboard] = useState<Array<{ uid: string; nickname: string; totalXP: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await call<unknown, { stats: Stats; leaderboard: Array<{ uid: string; nickname: string; totalXP: number }> }>("adminDashboardData");
        if (!cancelled) {
          setStats(result.stats);
          setLeaderboard(result.leaderboard);
        }
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      }
    };
    void load();
    const timer = window.setInterval(load, 3_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-ink">Dashboard</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Signed in as {user?.email ?? user?.id}
        </p>
      </header>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label="Users" value={stats?.totalUsers ?? 0} />
        <StatCard icon={Trophy} label="Cats found" value={stats?.catsFound ?? 0} />
        <StatCard icon={Package} label="Workshop check-ins" value={stats?.workshopCheckins ?? 0} />
        <StatCard icon={QrIcon} label="Quiz players" value={stats?.quizParticipants ?? 0} />
      </div>

      <section className="rounded-2xl border border-line bg-white">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-bold text-ink">Top 10</h2>
          <a
            href="/screen/leaderboard"
            target="_blank"
            className="btn btn-outline btn-sm"
          >
            Open big screen
          </a>
        </header>
        <ol className="divide-y divide-line">
          {leaderboard.map((entry, i) => (
            <li key={entry.uid} className="flex items-center justify-between px-4 py-2.5">
              <span className="flex items-center gap-3 text-sm">
                <span className="font-extrabold text-primary">{i + 1}</span>
                {entry.nickname}
              </span>
              <span className="text-sm font-bold text-ink">{formatNumber(entry.totalXP)} XP</span>
            </li>
          ))}
          {leaderboard.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-soft">
              No players yet
            </li>
          )}
        </ol>
      </section>
    </div>
  );
}
