"use client";

import { useEffect, useState } from "react";
import { call } from "@/lib/supabase/callable";
import type { QrType } from "@shared/models";
import { QRCode } from "@/components/qr/qr-code";
import { Button } from "@/components/ui/button";
import { Copy, Power, Plus } from "lucide-react";
import { buildInAppQrPayload } from "@/lib/qr/parse";

interface QrRow {
  id: string;
  token: string;
  type: QrType;
  label?: string;
  targetId: string;
  active: boolean;
}

export default function AdminQrPage() {
  const [qrs, setQrs] = useState<QrRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [type, setType] = useState<QrType>("QUIZ");
  const [targetId, setTargetId] = useState("");
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = await call<unknown, { qrs: QrRow[] }>("adminListQrs");
      if (!cancelled) setQrs(result.qrs.filter((item) => item.type === "QUIZ" || item.type === "WORKSHOP"));
    };
    void load();
    const timer = window.setInterval(load, 2_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  async function createQr(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage({});
    try {
      const res = await call<unknown, { token: string }>("adminCreateQRCode", {
        type,
        targetId,
        label: label || undefined,
      });
      setMessage({ ok: `QR created: ${res.token}` });
      setTargetId("");
      setLabel("");
      setShowCreate(false);
    } catch (e) {
      setMessage({ err: (e as { message?: string }).message ?? "Failed" });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(qr: QrRow) {
    setMessage({});
    try {
      await call("adminToggleQR", { qrId: qr.id, active: !qr.active });
    } catch (e) {
      setMessage({ err: (e as { message?: string }).message ?? "Failed" });
    }
  }

  async function copyToken(t: string) {
    try {
      await navigator.clipboard.writeText(t);
      setMessage({ ok: "In-app token copied" });
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">QR Codes</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            {qrs.length} codes · designed for the UniByte in-app scanner.
          </p>
        </div>
        <Button onClick={() => setShowCreate((s) => !s)}>
          <Plus className="h-4 w-4" /> New QR
        </Button>
      </header>

      {message.ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-success">{message.ok}</p>}
      {message.err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{message.err}</p>}

      {showCreate && (
        <form onSubmit={createQr} className="space-y-3 rounded-2xl border border-line bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={type}
                onChange={(e) => setType(e.target.value as QrType)}
              >
                <option value="QUIZ">QUIZ</option>
                <option value="WORKSHOP">WORKSHOP</option>
              </select>
            </div>
            <div>
              <label className="label">Target ID</label>
              <input
                className="input"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="doc id (e.g. a catId)"
                required
              />
            </div>
            <div>
              <label className="label">Label</label>
              <input
                className="input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Booth 2"
              />
            </div>
          </div>
          <Button type="submit" loading={busy}>Create code</Button>
        </form>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {qrs.map((qr) => (
          <div key={qr.id} className="rounded-2xl border border-line bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-ink">{qr.label ?? qr.targetId}</p>
                <span className="badge mt-1">{qr.type}</span>
              </div>
              <button
                className={
                  "flex h-8 w-8 items-center justify-center rounded-lg " +
                  (qr.active ? "bg-green-50 text-success" : "bg-red-50 text-danger")
                }
                onClick={() => toggle(qr)}
                title={qr.active ? "Deactivate" : "Activate"}
              >
                <Power className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex justify-center">
              <QRCode value={buildInAppQrPayload(qr.token)} size={140} />
            </div>
            <p className="mt-2 truncate font-mono text-[10px] text-ink-soft">{qr.token}</p>
            <div className="mt-2 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => copyToken(qr.token)}
              >
                <Copy className="h-3.5 w-3.5" /> Copy token
              </Button>
            </div>
          </div>
        ))}
        {qrs.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-ink-soft">
            No QR codes yet.
          </p>
        )}
      </div>
    </div>
  );
}
