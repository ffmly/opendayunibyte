"use client";

import { useEffect, useState, useCallback } from "react";
import { call } from "@/lib/supabase/callable";
import type { QrType } from "@shared/models";
import { QRCode } from "@/components/qr/qr-code";
import { Button } from "@/components/ui/button";
import { Copy, Power, Plus, Pencil, X, AlertCircle, CheckCircle2 } from "lucide-react";
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

  // Edit modal state
  const [editingQr, setEditingQr] = useState<QrRow | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editTargetId, setEditTargetId] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const loadQrs = useCallback(async () => {
    try {
      const result = await call<unknown, { qrs: QrRow[] }>("adminListQrs");
      setQrs(result.qrs.filter((item) => item.type === "QUIZ" || item.type === "WORKSHOP"));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await call<unknown, { qrs: QrRow[] }>("adminListQrs");
        if (!cancelled) setQrs(result.qrs.filter((item) => item.type === "QUIZ" || item.type === "WORKSHOP"));
      } catch {
        // ignore
      }
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
      await loadQrs();
    } catch (e) {
      setMessage({ err: (e as { message?: string }).message ?? "Failed" });
    } finally {
      setBusy(false);
    }
  }

  function openEditModal(qr: QrRow) {
    setEditingQr(qr);
    setEditLabel(qr.label || "");
    setEditTargetId(qr.targetId || "");
    setEditActive(qr.active);
    setEditError(null);
  }

  function closeEditModal() {
    setEditingQr(null);
    setEditError(null);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingQr) return;
    setEditBusy(true);
    setEditError(null);

    try {
      await call("adminUpdateQR", {
        qrId: editingQr.id,
        label: editLabel.trim(),
        targetId: editTargetId.trim(),
        active: editActive,
      });
      setMessage({ ok: "QR code updated successfully!" });
      closeEditModal();
      await loadQrs();
    } catch (err) {
      setEditError((err as { message?: string }).message ?? "Failed to update QR code");
    } finally {
      setEditBusy(false);
    }
  }

  async function toggle(qr: QrRow) {
    setMessage({});
    try {
      await call("adminToggleQR", { qrId: qr.id, active: !qr.active });
      await loadQrs();
    } catch (e) {
      setMessage({ err: (e as { message?: string }).message ?? "Failed" });
    }
  }

  async function copyToken(t: string) {
    try {
      await navigator.clipboard.writeText(t);
      setMessage({ ok: "In-app token copied to clipboard" });
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">QR Codes</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            {qrs.length} codes · designed for the UniByte in-app scanner. Edit labels, targets, or status anytime.
          </p>
        </div>
        <Button onClick={() => setShowCreate((s) => !s)}>
          <Plus className="h-4 w-4" /> New QR
        </Button>
      </header>

      {message.ok && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3.5 py-2.5 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{message.ok}</span>
        </div>
      )}
      {message.err && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{message.err}</span>
        </div>
      )}

      {showCreate && (
        <form onSubmit={createQr} className="space-y-3 rounded-2xl border border-line bg-white p-4">
          <h2 className="text-base font-bold text-ink">Create New QR Code</h2>
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
                placeholder="doc id (e.g. workshop id)"
                required
              />
            </div>
            <div>
              <label className="label">Label</label>
              <input
                className="input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Booth 2, Web Dev WS"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="btn btn-outline btn-sm"
            >
              Cancel
            </button>
            <Button type="submit" loading={busy} className="btn-sm">Create code</Button>
          </div>
        </form>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {qrs.map((qr) => (
          <div key={qr.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm hover:border-primary/30 transition">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-ink truncate max-w-[180px]">{qr.label ?? qr.targetId}</p>
                <span className="badge mt-1">{qr.type}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => openEditModal(qr)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-soft hover:bg-surface-muted hover:text-ink transition"
                  title="Edit label or target ID"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  className={
                    "flex h-8 w-8 items-center justify-center rounded-lg transition " +
                    (qr.active ? "bg-green-50 text-success hover:bg-green-100" : "bg-red-50 text-danger hover:bg-red-100")
                  }
                  onClick={() => toggle(qr)}
                  title={qr.active ? "Click to deactivate" : "Click to activate"}
                >
                  <Power className="h-4 w-4" />
                </button>
              </div>
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

      {/* Edit QR Modal */}
      {editingQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Pencil className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink">Edit QR Code</h3>
                  <p className="text-xs text-ink-soft">Update label, target link, or active status</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg p-1.5 text-ink-soft hover:bg-black/5 hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              {editError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-danger">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div>
                <label className="label">QR Token</label>
                <div className="rounded-xl border border-line bg-surface-muted px-3 py-2 font-mono text-xs text-ink-soft">
                  {editingQr.token} ({editingQr.type})
                </div>
              </div>

              <div>
                <label className="label">Label</label>
                <input
                  className="input"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder="e.g. Workshop: Web Dev 101"
                  disabled={editBusy}
                />
              </div>

              <div>
                <label className="label">Target ID *</label>
                <input
                  className="input"
                  value={editTargetId}
                  onChange={(e) => setEditTargetId(e.target.value)}
                  placeholder="Linked document or workshop ID"
                  required
                  disabled={editBusy}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editQrActive"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
                  disabled={editBusy}
                />
                <label htmlFor="editQrActive" className="text-xs font-semibold text-ink cursor-pointer">
                  QR code is active and scannable by attendees
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="btn btn-outline btn-sm"
                  disabled={editBusy}
                >
                  Cancel
                </button>
                <Button type="submit" loading={editBusy} className="btn-sm">
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
