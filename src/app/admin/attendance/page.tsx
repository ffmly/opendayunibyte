"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { call } from "@/lib/supabase/callable";
import { formatNumber, formatDate, timeAgo } from "@/lib/utils/format";
import type { WorkshopAttendanceResult, WorkshopWithAttendance } from "@shared/models";
import {
  UserCheck,
  Users,
  Wrench,
  Search,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Mail,
  MapPin,
  Clock,
  ArrowUpDown,
} from "lucide-react";

export default function AdminAttendancePage() {
  const [data, setData] = useState<WorkshopAttendanceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "withCheckins" | "active">("all");
  const [sortBy, setSortBy] = useState<"attendance" | "code" | "title">("attendance");
  const [expandedWorkshops, setExpandedWorkshops] = useState<Record<string, boolean>>({});
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await call<unknown, WorkshopAttendanceResult>("adminWorkshopAttendance");
      setData(res);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to load workshop attendance", err);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await call<unknown, WorkshopAttendanceResult>("adminWorkshopAttendance");
        if (!cancelled) {
          setData(res);
          setLastUpdated(new Date());
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) console.error("Poll error:", err);
      }
    };

    void poll();
    const interval = window.setInterval(poll, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const toggleExpand = (workshopId: string) => {
    setExpandedWorkshops((prev) => ({
      ...prev,
      [workshopId]: !prev[workshopId],
    }));
  };

  const expandAll = () => {
    if (!data) return;
    const allExpanded: Record<string, boolean> = {};
    for (const w of data.workshops) {
      allExpanded[w.id] = true;
    }
    setExpandedWorkshops(allExpanded);
  };

  const collapseAll = () => {
    setExpandedWorkshops({});
  };

  // Filtered and sorted workshops
  const filteredWorkshops = useMemo(() => {
    if (!data) return [];
    let list = data.workshops.filter((w) => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        w.title.toLowerCase().includes(q) ||
        w.code.toLowerCase().includes(q) ||
        (w.location && w.location.toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (filter === "withCheckins") return w.attendanceCount > 0;
      if (filter === "active") return w.active;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortBy === "attendance") {
        if (b.attendanceCount !== a.attendanceCount) {
          return b.attendanceCount - a.attendanceCount;
        }
        return a.code.localeCompare(b.code);
      }
      if (sortBy === "code") {
        return a.code.localeCompare(b.code);
      }
      return a.title.localeCompare(b.title);
    });

    return list;
  }, [data, search, filter, sortBy]);

  const topWorkshop = useMemo(() => {
    if (!data || data.workshops.length === 0) return null;
    const sorted = [...data.workshops].sort((a, b) => b.attendanceCount - a.attendanceCount);
    return sorted[0].attendanceCount > 0 ? sorted[0] : null;
  }, [data]);

  const maxAttendance = useMemo(() => {
    if (!data || data.workshops.length === 0) return 1;
    const max = Math.max(...data.workshops.map((w) => w.attendanceCount));
    return max > 0 ? max : 1;
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold text-ink">Workshop Attendance</h1>
            <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Updates
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            Real-time attendance numbers, metrics, and attendee check-in logs for every workshop.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="btn btn-outline btn-sm inline-flex items-center gap-1.5"
            title="Refresh attendance now"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-primary" : ""}`} />
            <span>Refresh</span>
          </button>
          <Link
            href="/admin/workshops"
            className="btn btn-outline btn-sm inline-flex items-center gap-1.5"
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>Manage Workshops</span>
          </Link>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Total Check-ins
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-black text-ink">
            {formatNumber(data?.stats.totalCheckins ?? 0)}
          </p>
          <p className="mt-1 text-xs text-ink-soft">Across all workshop stations</p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Unique Attendees
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-black text-ink">
            {formatNumber(data?.stats.uniqueAttendees ?? 0)}
          </p>
          <p className="mt-1 text-xs text-ink-soft">Participants who attended ≥1</p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Total Workshops
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <Wrench className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-black text-ink">
            {formatNumber(data?.stats.totalWorkshops ?? 0)}
          </p>
          <p className="mt-1 text-xs text-ink-soft">Configured in system</p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              Top Workshop
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 truncate text-xl font-black text-ink" title={topWorkshop?.title ?? "None"}>
            {topWorkshop ? topWorkshop.title : "No check-ins yet"}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {topWorkshop
              ? `${topWorkshop.attendanceCount} ${topWorkshop.attendanceCount === 1 ? "attendee" : "attendees"} (${topWorkshop.code})`
              : "Waiting for attendees"}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-3">
        <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            className="input ps-9 h-10 w-full text-sm"
            placeholder="Search workshop code, title, or room…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filter Pills */}
          <div className="flex rounded-xl bg-ink/5 p-1 text-xs font-semibold">
            <button
              onClick={() => setFilter("all")}
              className={`rounded-lg px-3 py-1.5 transition ${
                filter === "all" ? "bg-white text-primary shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              All ({data?.workshops.length ?? 0})
            </button>
            <button
              onClick={() => setFilter("withCheckins")}
              className={`rounded-lg px-3 py-1.5 transition ${
                filter === "withCheckins" ? "bg-white text-primary shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              With Check-ins ({data?.workshops.filter((w) => w.attendanceCount > 0).length ?? 0})
            </button>
            <button
              onClick={() => setFilter("active")}
              className={`rounded-lg px-3 py-1.5 transition ${
                filter === "active" ? "bg-white text-primary shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              Active
            </button>
          </div>

          {/* Sort Menu */}
          <div className="flex items-center gap-1.5 rounded-xl border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink-soft">
            <ArrowUpDown className="h-3.5 w-3.5" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "attendance" | "code" | "title")}
              className="bg-transparent text-ink focus:outline-none cursor-pointer"
            >
              <option value="attendance">Most Attended</option>
              <option value="code">By Code (A-Z)</option>
              <option value="title">By Title (A-Z)</option>
            </select>
          </div>

          {/* Expand / Collapse All */}
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={expandAll}
              className="btn btn-outline btn-sm px-2 text-xs"
              title="Expand all attendees tables"
            >
              Expand all
            </button>
            <button
              onClick={collapseAll}
              className="btn btn-outline btn-sm px-2 text-xs"
              title="Collapse all attendees tables"
            >
              Collapse all
            </button>
          </div>
        </div>
      </div>

      {/* Workshop Attendance Cards List */}
      {loading && !data ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-line bg-white/60" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
        {filteredWorkshops.map((w: WorkshopWithAttendance) => {
          const isExpanded = Boolean(expandedWorkshops[w.id]);
          const percent = maxAttendance > 0 ? Math.round((w.attendanceCount / maxAttendance) * 100) : 0;

          return (
            <div
              key={w.id}
              className="overflow-hidden rounded-2xl border border-line bg-white transition shadow-sm hover:border-primary/30"
            >
              {/* Card Header */}
              <div className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-primary/10 px-2.5 py-0.5 text-xs font-black tracking-wide text-primary">
                        {w.code}
                      </span>
                      {w.location && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-ink/5 px-2 py-0.5 text-xs font-medium text-ink-soft">
                          <MapPin className="h-3 w-3" />
                          {w.location}
                        </span>
                      )}
                      <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 border border-amber-200/50">
                        +{w.xp} XP
                      </span>
                      <span className={"badge text-[11px] " + (w.active ? "badge-success" : "badge-danger")}>
                        {w.active ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <h3 className="text-lg font-extrabold text-ink" dir="auto">{w.title}</h3>

                    {w.summary && (
                      <p className="line-clamp-2 text-xs text-ink-soft max-w-2xl" dir="auto">{w.summary}</p>
                    )}
                  </div>

                  {/* Attendance Count Metric */}
                  <div className="flex items-center gap-3">
                    <div className="text-end">
                      <div className="flex items-baseline justify-end gap-1">
                        <span className="text-3xl font-black text-primary">
                          {formatNumber(w.attendanceCount)}
                        </span>
                        <span className="text-xs font-semibold text-ink-soft">
                          {w.attendanceCount === 1 ? "attendee" : "attendees"}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-soft">
                        {data?.stats.totalCheckins && data.stats.totalCheckins > 0
                          ? `${Math.round((w.attendanceCount / data.stats.totalCheckins) * 100)}% of total check-ins`
                          : "0% of total"}
                      </p>
                    </div>

                    <button
                      onClick={() => toggleExpand(w.id)}
                      className={`btn btn-sm ${
                        isExpanded ? "btn-primary" : "btn-outline"
                      } inline-flex items-center gap-1`}
                    >
                      <span>Attendees</span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Relative attendance progress bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px] font-medium text-ink-soft mb-1">
                    <span>Attendance relative to top workshop</span>
                    <span>{percent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-ink/5">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Expandable Attendees Table */}
              {isExpanded && (
                <div className="border-t border-line bg-surface-muted/50 p-4 sm:p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                      Checked-in Attendees ({w.attendees.length})
                    </h4>
                    {w.attendees.length > 0 && (
                      <span className="text-xs text-ink-soft">
                        Latest check-in: {timeAgo(w.attendees[0].checkedInAt, "en")}
                      </span>
                    )}
                  </div>

                  {w.attendees.length > 0 ? (
                    <div className="overflow-x-auto rounded-xl border border-line bg-white">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-line text-xs uppercase tracking-wider text-ink-soft bg-surface-muted/30">
                            <th className="px-4 py-2.5 text-start font-semibold">#</th>
                            <th className="px-4 py-2.5 text-start font-semibold">Participant</th>
                            <th className="px-4 py-2.5 text-start font-semibold">Email</th>
                            <th className="px-4 py-2.5 text-start font-semibold">Check-in Time</th>
                            <th className="px-4 py-2.5 text-end font-semibold">XP Awarded</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {w.attendees.map((a, index) => (
                            <tr key={`${a.userId}-${a.checkedInAt}`} className="hover:bg-ink/[0.02]">
                              <td className="px-4 py-2.5 text-xs font-bold text-ink-soft">
                                #{index + 1}
                              </td>
                              <td className="px-4 py-2.5 font-bold text-ink">
                                {a.nickname || "Attendee"}
                              </td>
                              <td className="px-4 py-2.5 text-ink-soft text-xs">
                                {a.email ? (
                                  <a
                                    href={`mailto:${a.email}`}
                                    className="inline-flex items-center gap-1 text-primary hover:underline"
                                  >
                                    <Mail className="h-3 w-3" />
                                    <span>{a.email}</span>
                                  </a>
                                ) : (
                                  <span className="text-ink-soft/60 italic">No email</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-ink-soft text-xs">
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{formatDate(a.checkedInAt, "en")}</span>
                                  <span className="text-ink-soft/60">
                                    ({timeAgo(a.checkedInAt, "en")})
                                  </span>
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-end font-bold text-primary text-xs">
                                +{a.points} XP
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-line bg-white p-6 text-center">
                      <UserCheck className="mx-auto h-8 w-8 text-ink-soft/40" />
                      <p className="mt-2 text-sm font-semibold text-ink">No check-ins yet</p>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        Attendees will automatically appear here once they scan the workshop check-in QR code.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filteredWorkshops.length === 0 && (
          <div className="rounded-2xl border border-line bg-white p-12 text-center">
            <Wrench className="mx-auto h-10 w-10 text-ink-soft/40" />
            <p className="mt-3 text-base font-bold text-ink">No workshops match your criteria</p>
            <p className="mt-1 text-xs text-ink-soft">
              Try adjusting your search query or switching filters.
            </p>
          </div>
        )}
      </div>
      )}

      {/* Footer info */}
      <footer className="text-center text-xs text-ink-soft pt-2">
        Last updated: {lastUpdated.toLocaleTimeString()} · Data auto-refreshes every 3 seconds
      </footer>
    </div>
  );
}
