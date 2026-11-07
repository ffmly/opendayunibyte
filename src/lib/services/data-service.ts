"use client";

import { useEffect, useState } from "react";
import type { Cat, LeaderboardEntry, Workshop, XpEvent } from "@shared/models";
import { call } from "@/lib/supabase/callable";

function usePolling<T>(
  enabled: boolean,
  loader: () => Promise<T>,
  initial: T,
  intervalMs: number,
) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const next = await loader();
        if (!cancelled) setData(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // Loader dependencies are supplied by each call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs]);

  return { data, loading: enabled && loading };
}

export function useActivityHistory(uid: string | undefined, count = 30) {
  const state = usePolling(
    Boolean(uid),
    () => call<{ count: number }, { events: Array<XpEvent & { id: string }> }>("getActivityHistory", { count }),
    { events: [] as Array<XpEvent & { id: string }> },
    5_000,
  );
  return { events: state.data.events, loading: state.loading };
}

export function useCats(uid: string | undefined) {
  const state = usePolling(
    Boolean(uid),
    () => call<unknown, { cats: Array<Cat & { id: string }>; found: string[] }>("getCatsData"),
    { cats: [] as Array<Cat & { id: string }>, found: [] as string[] },
    5_000,
  );
  return { cats: state.data.cats, found: new Set(state.data.found), loading: state.loading };
}

export function useWorkshops(uid: string | undefined) {
  const state = usePolling(
    Boolean(uid),
    () => call<unknown, { workshops: Array<Workshop & { id: string }>; checkedIn: string[] }>("getWorkshopsData"),
    { workshops: [] as Array<Workshop & { id: string }>, checkedIn: [] as string[] },
    5_000,
  );
  return { workshops: state.data.workshops, checkedIn: new Set(state.data.checkedIn), loading: state.loading };
}

export function useLeaderboard(uid: string | undefined, top = 50) {
  const state = usePolling(
    true,
    () => call<{ top: number }, {
      entries: Array<LeaderboardEntry & { uid: string }>;
      myEntry: (LeaderboardEntry & { uid: string }) | null;
    }>("getLeaderboard", { top }),
    { entries: [] as Array<LeaderboardEntry & { uid: string }>, myEntry: null },
    2_000,
  );
  return { ...state.data, loading: state.loading };
}

export function useMyRank(uid: string | undefined) {
  const state = usePolling(
    Boolean(uid),
    () => call<unknown, { rank: number; totalUsers: number }>("getMyRank"),
    { rank: null as number | null, totalUsers: null as number | null },
    5_000,
  );
  return { rank: state.data.rank, total: state.data.totalUsers };
}
