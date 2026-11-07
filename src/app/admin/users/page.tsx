"use client";

import { useEffect, useState } from "react";
import { call } from "@/lib/supabase/callable";
import { formatNumber } from "@/lib/utils/format";
import { Search, Plus, Minus, Ban, CheckCircle } from "lucide-react";

interface UserRow {
  uid: string;
  nickname: string;
  email: string | null;
  totalXP: number;
  status: "active" | "disabled";
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [adjusting, setAdjusting] = useState<{ [uid: string]: boolean }>({});
  const [message, setMessage] = useState<{ ok?: string; err?: string }>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = await call<unknown, { users: UserRow[] }>("adminListUsers");
      if (!cancelled) setUsers(result.users);
    };
    void load();
    const timer = window.setInterval(load, 3_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const filtered = users.filter(
    (u) =>
      u.nickname?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.uid?.toLowerCase().includes(search.toLowerCase()),
  );

  async function adjust(uid: string, points: number) {
    setAdjusting((s) => ({ ...s, [uid]: true }));
    setMessage({});
    try {
      await call("adjustUserXp", { userId: uid, points, reason: "Manual admin adjust" });
      setMessage({ ok: "Updated" });
    } catch (e) {
      setMessage({ err: (e as { message?: string }).message ?? "Failed" });
    } finally {
      setAdjusting((s) => ({ ...s, [uid]: false }));
    }
  }

  async function toggleActive(uid: string, active: boolean) {
    setMessage({});
    try {
      await call("setUserActive", { userId: uid, active });
      setMessage({ ok: active ? "User activated" : "User deactivated" });
    } catch (e) {
      setMessage({ err: (e as { message?: string }).message ?? "Failed" });
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold text-ink">Users</h1>
        <p className="mt-0.5 text-sm text-ink-soft">Search, view emails, adjust XP, toggle activity.</p>
      </header>

      {message.ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-success">{message.ok}</p>}
      {message.err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{message.err}</p>}

      <div className="relative">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        <input
          className="input ps-9"
          placeholder="Search by name, email, or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-start text-xs uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3 text-start font-semibold">Nickname</th>
              <th className="px-4 py-3 text-start font-semibold">Email</th>
              <th className="px-4 py-3 text-start font-semibold">XP</th>
              <th className="px-4 py-3 text-start font-semibold">Status</th>
              <th className="px-4 py-3 text-end font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((u) => (
              <tr key={u.uid}>
                <td className="px-4 py-3 font-medium text-ink">
                  {u.nickname || u.uid.slice(0, 8)}
                </td>
                <td className="px-4 py-3 text-ink-soft">
                  {u.email ? (
                    <a href={`mailto:${u.email}`} className="text-primary hover:underline">
                      {u.email}
                    </a>
                  ) : (
                    <span className="text-xs text-ink-soft/70">No email provided</span>
                  )}
                </td>
                <td className="px-4 py-3 font-bold text-primary">{formatNumber(u.totalXP)}</td>
                <td className="px-4 py-3">
                  {u.status === "active" ? (
                    <span className="badge badge-success">Active</span>
                  ) : (
                    <span className="badge badge-danger">Inactive</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      className="btn btn-outline btn-sm"
                      disabled={adjusting[u.uid]}
                      onClick={() => adjust(u.uid, 50)}
                      title="Add 50 XP"
                    >
                      <Plus className="h-3.5 w-3.5" />50
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      disabled={adjusting[u.uid]}
                      onClick={() => adjust(u.uid, -50)}
                      title="Remove 50 XP"
                    >
                      <Minus className="h-3.5 w-3.5" />50
                    </button>
                    {u.status === "active" ? (
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => toggleActive(u.uid, false)}
                        title="Deactivate"
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => toggleActive(u.uid, true)}
                        title="Activate"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-soft">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
