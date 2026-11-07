"use client";

import { useEffect, useState, useCallback } from "react";
import { call } from "@/lib/supabase/callable";
import { formatNumber } from "@/lib/utils/format";
import { Search, Plus, Minus, Ban, CheckCircle, UserPlus, X } from "lucide-react";

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

  // Add User modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newXp, setNewXp] = useState("50");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      const result = await call<unknown, { users: UserRow[] }>("adminListUsers");
      setUsers(result.users);
    } catch {
      // ignore transient poll errors
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await call<unknown, { users: UserRow[] }>("adminListUsers");
        if (!cancelled) setUsers(result.users);
      } catch {
        // ignore
      }
    };
    void load();
    const timer = window.setInterval(load, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
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

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!newNickname.trim()) {
      setFormError("Nickname is required");
      return;
    }
    if (!newEmail.trim()) {
      setFormError("Email is required");
      return;
    }
    setCreating(true);
    try {
      await call("adminCreateUser", {
        nickname: newNickname.trim(),
        email: newEmail.trim().toLowerCase(),
        totalXP: newXp === "" ? 50 : Math.max(0, parseInt(newXp, 10) || 0),
      });
      setMessage({ ok: `User "${newNickname.trim()}" created successfully!` });
      setNewNickname("");
      setNewEmail("");
      setNewXp("50");
      setShowAddModal(false);
      await loadUsers();
    } catch (err) {
      setFormError((err as { message?: string }).message ?? "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold text-ink">Users</h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
              {users.length} total
            </span>
          </div>
          <p className="mt-0.5 text-sm text-ink-soft">
            Search, view emails, adjust XP, toggle activity, or register new users.
          </p>
        </div>
        <button
          onClick={() => {
            setFormError("");
            setShowAddModal(true);
          }}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          <UserPlus className="h-4 w-4" />
          <span>Add User</span>
        </button>
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

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink">Add New User</h3>
                  <p className="text-xs text-ink-soft">Register attendee &amp; add to leaderboard</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1.5 text-ink-soft hover:bg-black/5 hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="mt-4 space-y-4">
              {formError && (
                <div className="rounded-lg bg-red-50 p-3 text-xs text-danger">
                  {formError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Nickname *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex"
                  value={newNickname}
                  onChange={(e) => setNewNickname(e.target.value)}
                  className="input w-full"
                  disabled={creating}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Email *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. alex@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="input w-full"
                  disabled={creating}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Starting XP</label>
                <input
                  type="number"
                  min="0"
                  step="5"
                  placeholder="50"
                  value={newXp}
                  onChange={(e) => setNewXp(e.target.value)}
                  className="input w-full"
                  disabled={creating}
                />
                <p className="mt-1 text-[11px] text-ink-soft">
                  Default is 50 XP (Registration bonus). Automatically syncs with leaderboard.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-outline btn-sm"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                  disabled={creating}
                >
                  {creating ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
