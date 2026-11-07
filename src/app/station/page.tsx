"use client";

import { useEffect, useState } from "react";
import type { QrCode } from "@shared/models";
import { QRCode as QrCodeView } from "@/components/qr/qr-code";
import { UserShell } from "@/components/layout/user-shell";
import { useI18n } from "@/components/providers/i18n-provider";
import { buildPublicQrUrl } from "@/lib/qr/parse";
import { call } from "@/lib/supabase/callable";
import { BackButton } from "@/components/navigation/back-button";

function StationInner() {
  const { t } = useI18n();
  const [qrs, setQrs] = useState<Array<QrCode & { id: string }>>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = await call<unknown, { qrs: Array<QrCode & { id: string }> }>("listStationQrs");
      if (cancelled) return;
      setQrs(result.qrs);
      setSelected((current) => current ?? result.qrs[0]?.id ?? null);
    };
    void load();
    const timer = window.setInterval(load, 3_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const current = qrs.find((qr) => qr.id === selected);

  return (
    <div className="space-y-4">
      <header>
        <BackButton fallback="/dashboard" className="mb-3" />
        <h1 className="text-xl font-extrabold text-ink">{t.station.title}</h1>
        <p className="mt-0.5 text-sm text-ink-soft">{t.station.subtitle}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-[1fr_240px]">
        <div className="rounded-2xl border border-line bg-white p-6">
          {current ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="rounded-2xl border border-line p-4">
                <QrCodeView value={buildPublicQrUrl(current.token ?? "")} size={240} />
              </div>
              <div>
                <p className="text-lg font-bold text-ink">
                  {current.label ?? current.id}
                </p>
                <p className="mt-0.5 font-mono text-xs text-ink-soft">
                  {current.token}
                </p>
                <span
                  className={
                    "badge mt-2 " +
                    (current.active ? "badge-success" : "badge-danger")
                  }
                >
                  {current.active ? t.station.active : t.station.inactive}
                </span>
                <p className="mt-3 max-w-xs text-sm leading-6 text-ink-soft">
                  Scan with the normal phone camera or the UniByte scanner.
                </p>
              </div>
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-ink-soft">
              {t.station.empty}
            </p>
          )}
        </div>

        <aside className="rounded-2xl border border-line bg-white p-4">
          <h2 className="mb-2 text-sm font-bold text-ink">{t.station.qrList}</h2>
          <ul className="space-y-2">
            {qrs.map((qr) => (
              <li key={qr.id}>
                <button
                  onClick={() => setSelected(qr.id)}
                  className={
                    "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-start text-sm " +
                    (selected === qr.id
                      ? "border-primary bg-primary-tint"
                      : "border-line hover:bg-surface-muted")
                  }
                >
                  <span className="truncate font-medium">
                    {qr.label ?? qr.id}
                  </span>
                  <span className="text-ink-soft">{qr.type}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

export default function StationPage() {
  return (
    <UserShell>
      <StationInner />
    </UserShell>
  );
}
