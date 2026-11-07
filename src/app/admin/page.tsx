"use client";

import { useEffect, useState } from "react";
import { call } from "@/lib/supabase/callable";
import { useAuth } from "@/components/providers/auth-provider";
import { formatNumber } from "@/lib/utils/format";
import {
  QrCode as QrIcon,
  Users,
  Trophy,
  Package,
  BrainCircuit,
  Wrench,
  AlertTriangle,
  Trash2,
  CheckCircle2,
  X,
} from "lucide-react";
import type {
  AdminLeaderboardsResult,
  AdminQuizLeaderboardEntry,
  AdminAllTimeLeaderboardEntry,
  AdminWorkshopLeaderboardEntry,
} from "@shared/models";
import { Button } from "@/components/ui/button";

interface Stats {
  totalUsers: number;
  catsFound: number;
  workshopCheckins: number;
  quizParticipants: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
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
  const [leaderboards, setLeaderboards] = useState<AdminLeaderboardsResult>({
    quiz: [],
    allTime: [],
    workshops: [],
  });
  const [activeTab, setActiveTab] = useState<"quiz" | "allTime" | "workshops">("allTime");
  const [error, setError] = useState<string | null>(null);

  // Cleanup modal state
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{
    deletedProfiles: number;
    deletedAuthUsers: number;
    preservedAdmins: number;
  } | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [dashResult, lbResult] = await Promise.all([
        call<unknown, { stats: Stats }>("adminDashboardData"),
        call<unknown, AdminLeaderboardsResult>("adminLeaderboards"),
      ]);
      setStats(dashResult.stats);
      setLeaderboards(lbResult);
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const [dashResult, lbResult] = await Promise.all([
          call<unknown, { stats: Stats }>("adminDashboardData"),
          call<unknown, AdminLeaderboardsResult>("adminLeaderboards"),
        ]);
        if (!cancelled) {
          setStats(dashResult.stats);
          setLeaderboards(lbResult);
        }
      } catch (cause) {
        if (!cancelled) setError((cause as Error).message);
      }
    };
    void poll();
    const timer = window.setInterval(poll, 4_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  async function handleExecuteCleanup() {
    if (confirmationInput !== "DELETE PARTICIPANTS" || cleanupBusy) return;
    setCleanupBusy(true);
    setCleanupError(null);
    try {
      const result = await call<
        { confirmation: string },
        { ok: boolean; deletedProfiles: number; deletedAuthUsers: number; preservedAdmins: number }
      >("adminCleanupParticipants", { confirmation: "DELETE PARTICIPANTS" });
      setCleanupResult(result);
      setShowCleanupModal(false);
      setConfirmationInput("");
      await loadData();
    } catch (err) {
      setCleanupError((err as Error).message || "Failed to cleanup participants.");
    } finally {
      setCleanupBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Dashboard</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Signed in as {user?.email ?? user?.id}
          </p>
        </div>
        <a
          href="/screen/leaderboard"
          target="_blank"
          className="btn btn-outline btn-sm w-fit"
        >
          Open big screen
        </a>
      </header>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {cleanupResult && (
        <div className="flex items-start justify-between rounded-2xl border border-success/20 bg-success-tint/20 p-4 text-sm text-success">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">Participant accounts deleted successfully</p>
              <p className="text-xs text-ink-soft">
                Removed {cleanupResult.deletedProfiles} profiles and{" "}
                {cleanupResult.deletedAuthUsers} auth accounts. Preserved{" "}
                {cleanupResult.preservedAdmins} admin/staff accounts and all platform content.
              </p>
            </div>
          </div>
          <button
            onClick={() => setCleanupResult(null)}
            className="text-ink-soft hover:text-ink"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label="Users" value={stats?.totalUsers ?? 0} />
        <StatCard icon={Trophy} label="Cats found" value={stats?.catsFound ?? 0} />
        <StatCard icon={Package} label="Workshop check-ins" value={stats?.workshopCheckins ?? 0} />
        <StatCard icon={QrIcon} label="Quiz players" value={stats?.quizParticipants ?? 0} />
      </div>

      {/* Administrative Leaderboards */}
      <section className="rounded-2xl border border-line bg-white shadow-sm">
        <header className="border-b border-line p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-extrabold text-ink">
                Administrative Leaderboards
              </h2>
              <p className="text-xs text-ink-soft">
                Participant rankings with private contact emails for reward distribution
              </p>
            </div>

            {/* Tab switchers */}
            <div className="flex rounded-xl bg-ink/5 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab("allTime")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                  activeTab === "allTime"
                    ? "bg-white text-primary shadow-sm"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                <Trophy className="h-3.5 w-3.5" />
                All-time
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("quiz")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                  activeTab === "quiz"
                    ? "bg-white text-primary shadow-sm"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                <BrainCircuit className="h-3.5 w-3.5" />
                Quiz
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("workshops")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                  activeTab === "workshops"
                    ? "bg-white text-primary shadow-sm"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                <Wrench className="h-3.5 w-3.5" />
                Workshops
              </button>
            </div>
          </div>
        </header>

        {/* Tab 1: All-time Leaderboard */}
        {activeTab === "allTime" && (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wider text-ink-soft">
                  <th className="px-4 py-3 text-start font-semibold">Rank</th>
                  <th className="px-4 py-3 text-start font-semibold">Participant</th>
                  <th className="px-4 py-3 text-start font-semibold">Email</th>
                  <th className="px-4 py-3 text-end font-semibold">Total XP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {leaderboards.allTime.map((entry: AdminAllTimeLeaderboardEntry, i: number) => (
                  <tr key={entry.userId} className="hover:bg-ink/[0.02]">
                    <td className="px-4 py-3 font-extrabold text-primary">#{i + 1}</td>
                    <td className="px-4 py-3 font-semibold text-ink">
                      {entry.nickname || entry.userId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {entry.email ? (
                        <a
                          href={`mailto:${entry.email}`}
                          className="text-primary hover:underline"
                        >
                          {entry.email}
                        </a>
                      ) : (
                        <span className="text-xs text-ink-soft/70">No email provided</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end font-bold text-ink">
                      {formatNumber(entry.totalXP)} XP
                    </td>
                  </tr>
                ))}
                {leaderboards.allTime.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-ink-soft">
                      No participants yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Quiz Leaderboard */}
        {activeTab === "quiz" && (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wider text-ink-soft">
                  <th className="px-4 py-3 text-start font-semibold">Rank</th>
                  <th className="px-4 py-3 text-start font-semibold">Participant</th>
                  <th className="px-4 py-3 text-start font-semibold">Email</th>
                  <th className="px-4 py-3 text-end font-semibold">Quiz Points</th>
                  <th className="px-4 py-3 text-end font-semibold">Correct Answers</th>
                  <th className="px-4 py-3 text-end font-semibold">Rounds Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {leaderboards.quiz.map((entry: AdminQuizLeaderboardEntry, i: number) => (
                  <tr key={entry.userId} className="hover:bg-ink/[0.02]">
                    <td className="px-4 py-3 font-extrabold text-primary">#{i + 1}</td>
                    <td className="px-4 py-3 font-semibold text-ink">
                      {entry.nickname || entry.userId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {entry.email ? (
                        <a
                          href={`mailto:${entry.email}`}
                          className="text-primary hover:underline"
                        >
                          {entry.email}
                        </a>
                      ) : (
                        <span className="text-xs text-ink-soft/70">No email provided</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end font-bold text-primary">
                      {formatNumber(entry.quizPoints)} pts
                    </td>
                    <td className="px-4 py-3 text-end text-ink">
                      {entry.correctAnswers}
                    </td>
                    <td className="px-4 py-3 text-end text-ink-soft">
                      {entry.roundsJoined}
                    </td>
                  </tr>
                ))}
                {leaderboards.quiz.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-ink-soft">
                      No quiz participants yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Workshop Visits Leaderboard */}
        {activeTab === "workshops" && (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wider text-ink-soft">
                  <th className="px-4 py-3 text-start font-semibold">Rank</th>
                  <th className="px-4 py-3 text-start font-semibold">Participant</th>
                  <th className="px-4 py-3 text-start font-semibold">Email</th>
                  <th className="px-4 py-3 text-end font-semibold">Workshops Visited</th>
                  <th className="px-4 py-3 text-end font-semibold">Workshop Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {leaderboards.workshops.map((entry: AdminWorkshopLeaderboardEntry, i: number) => (
                  <tr key={entry.userId} className="hover:bg-ink/[0.02]">
                    <td className="px-4 py-3 font-extrabold text-primary">#{i + 1}</td>
                    <td className="px-4 py-3 font-semibold text-ink">
                      {entry.nickname || entry.userId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {entry.email ? (
                        <a
                          href={`mailto:${entry.email}`}
                          className="text-primary hover:underline"
                        >
                          {entry.email}
                        </a>
                      ) : (
                        <span className="text-xs text-ink-soft/70">No email provided</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end font-bold text-ink">
                      {entry.workshopsVisited}
                    </td>
                    <td className="px-4 py-3 text-end font-bold text-primary">
                      {formatNumber(entry.workshopPoints)} XP
                    </td>
                  </tr>
                ))}
                {leaderboards.workshops.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-ink-soft">
                      No workshop check-ins yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Dangerous Operations / Participant Accounts Cleanup */}
      <section className="rounded-2xl border border-danger/25 bg-red-50/40 p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-danger">
              <AlertTriangle className="h-5 w-5" />
              Delete all participant accounts
            </h2>
            <p className="max-w-xl text-xs leading-relaxed text-ink-soft">
              Safely removes test attendee profiles, leaderboard entries, quiz answers, and
              temporary auth accounts before the live Open Day. All admin and staff accounts,
              workshops, quiz questions, QR codes, and configuration will be preserved.
            </p>
          </div>
          <Button
            variant="danger"
            onClick={() => {
              setShowCleanupModal(true);
              setConfirmationInput("");
              setCleanupError(null);
            }}
            className="shrink-0"
          >
            <Trash2 className="h-4 w-4" />
            Delete all participant accounts
          </Button>
        </div>
      </section>

      {/* Confirmation Modal */}
      {showCleanupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="paper-panel w-full max-w-lg rounded-2xl border border-line bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3 text-danger">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-danger">
                  <AlertTriangle className="h-6 w-6" />
                </span>
                <h3 className="text-lg font-extrabold text-ink">
                  Confirm participant cleanup
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCleanupModal(false)}
                className="text-ink-soft hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs leading-relaxed text-ink-soft">
              <p className="font-semibold text-danger">
                Warning: This is a permanent destructive action for attendee data.
              </p>
              <div className="rounded-xl border border-line bg-surface p-3">
                <p className="font-bold text-ink">What will be deleted:</p>
                <ul className="mt-1 list-disc space-y-0.5 ps-5 text-ink-soft">
                  <li>All non-admin visitor/participant profiles</li>
                  <li>Their corresponding Supabase Auth accounts</li>
                  <li>Participant leaderboard rankings</li>
                  <li>Attendee quiz answers, workshop check-ins, and XP events</li>
                </ul>
              </div>

              <div className="rounded-xl border border-success/30 bg-success-tint/20 p-3">
                <p className="font-bold text-success">What will be PRESERVED:</p>
                <ul className="mt-1 list-disc space-y-0.5 ps-5 text-ink-soft">
                  <li>All admin and staff accounts (including your current session)</li>
                  <li>The full quiz question bank ({stats?.quizParticipants !== undefined ? "active" : ""})</li>
                  <li>Workshops and workshop configuration</li>
                  <li>QR codes and cat hunt definitions</li>
                  <li>Event reward settings</li>
                </ul>
              </div>

              <p className="pt-2 text-ink">
                To confirm, type <span className="font-mono font-bold text-danger">DELETE PARTICIPANTS</span> below:
              </p>
              <input
                type="text"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                placeholder="DELETE PARTICIPANTS"
                className="input font-mono"
                disabled={cleanupBusy}
              />

              {cleanupError && (
                <p className="rounded-lg bg-red-50 p-2 text-xs font-semibold text-danger">
                  {cleanupError}
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowCleanupModal(false)}
                disabled={cleanupBusy}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={confirmationInput !== "DELETE PARTICIPANTS" || cleanupBusy}
                loading={cleanupBusy}
                onClick={handleExecuteCleanup}
              >
                Confirm deletion
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
