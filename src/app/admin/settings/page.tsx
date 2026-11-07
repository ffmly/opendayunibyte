"use client";

import { useEffect, useState } from "react";
import { call } from "@/lib/supabase/callable";
import type { RewardsConfig } from "@shared/models";
import { Button } from "@/components/ui/button";

export default function AdminSettingsPage() {
  const [rewards, setRewards] = useState<RewardsConfig | null>(null);
  const [roleUid, setRoleUid] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [message, setMessage] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void call<unknown, { rewards: RewardsConfig }>("adminGetSettings")
      .then((result) => setRewards(result.rewards))
      .catch((cause) => setMessage({ err: (cause as Error).message }));
  }, []);

  async function saveRewards(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage({});
    try {
      await call("adminUpdateRewards", { rewards });
      setMessage({ ok: "Rewards saved" });
    } catch (e) {
      setMessage({ err: (e as { message?: string }).message ?? "Failed" });
    } finally {
      setBusy(false);
    }
  }

  async function setRoleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage({});
    try {
      await call("adminSetRole", { uid: roleUid, role });
      setMessage({ ok: "Role assigned" });
      setRoleUid("");
    } catch (e) {
      setMessage({ err: (e as { message?: string }).message ?? "Failed" });
    } finally {
      setBusy(false);
    }
  }

  const set = (key: keyof RewardsConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setRewards((r) => (r ? { ...r, [key]: Number(e.target.value) || 0 } : r));
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold text-ink">Settings</h1>
      </header>

      {message.ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-success">{message.ok}</p>}
      {message.err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{message.err}</p>}

      {rewards && (
        <form onSubmit={saveRewards} className="space-y-3 rounded-2xl border border-line bg-white p-4">
          <h2 className="text-sm font-bold text-ink">Rewards (XP)</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["registration", "Registration"],
                ["workshop", "Workshop"],
                ["cat", "Cat"],
                ["rareCat", "Rare cat"],
                ["password", "Password"],
                ["mystery", "Mystery"],
                ["quizCorrect", "Quiz correct"],
                ["memoryBase", "Memory base"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input type="number" min={0} className="input" value={rewards[key] ?? 0} onChange={set(key)} />
              </div>
            ))}
          </div>
          <Button type="submit" loading={busy}>Save rewards</Button>
        </form>
      )}

      <form onSubmit={setRoleSubmit} className="space-y-3 rounded-2xl border border-line bg-white p-4">
        <h2 className="text-sm font-bold text-ink">Grant staff/admin role</h2>
        <p className="text-xs text-ink-soft">
          Create the user in Firebase Auth (email/password), then assign the role here using their UID.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="label">User UID</label>
            <input className="input font-mono" value={roleUid} onChange={(e) => setRoleUid(e.target.value)} required />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as "admin" | "staff")}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <Button type="submit" loading={busy}>Assign role</Button>
      </form>
    </div>
  );
}
