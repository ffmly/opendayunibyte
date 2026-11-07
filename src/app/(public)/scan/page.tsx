"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ScanLine, Keyboard } from "lucide-react";
import { QrScannerView } from "@/components/scan/qr-scanner-view";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/providers/i18n-provider";
import { useAuth } from "@/components/providers/auth-provider";
import {
  processQRCode,
  checkInWorkshop,
  joinQuiz,
  type ProcessQrResult,
} from "@/lib/services/game-services";
import { CallableError } from "@/lib/supabase/callable";
import { extractUnibyteToken } from "@/lib/qr/parse";
import { BackButton } from "@/components/navigation/back-button";

type Stage =
  | "idle"
  | "scanning"
  | "processing"
  | "success"
  | "error"
  | "entry";

function ScanInner() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, hasProfile, loading } = useAuth();
  const [stage, setStage] = useState<Stage>("idle");
  const [paused, setPaused] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [message, setMessage] = useState("");
  const processingRef = useRef(false);

  const errorMessage = useCallback((err: unknown): string => {
    if (err instanceof CallableError) {
      const code = err.code;
      if (code.includes("already")) return t.errors.alreadyRewarded;
      if (code.includes("inactive")) return t.errors.inactive;
      if (code.includes("invalid")) return t.errors.invalidQr;
      if (code.includes("expired")) return t.errors.expiredQr;
      if (code.includes("unavailable")) return t.errors.network;
    }
    return t.errors.generic;
  }, [t]);

  const handleQrResult = useCallback(async (res: ProcessQrResult, token: string) => {
    switch (res.qrType) {
      case "ENTRY": {
        setStage("entry");
        setMessage("");
        break;
      }
      case "WORKSHOP": {
        try {
          const r = await checkInWorkshop(token);
          router.push(
            `/workshops/${encodeURIComponent(r.workshopId)}?attendance=${r.alreadyCheckedIn ? "existing" : "recorded"}`,
          );
        } catch (err) {
          setStage("error");
          setMessage(errorMessage(err));
        }
        break;
      }
      case "QUIZ": {
        try {
          const r = await joinQuiz(token);
          router.push(`/quiz?session=${encodeURIComponent(r.sessionId)}`);
        } catch (err) {
          setStage("error");
          setMessage(errorMessage(err));
        }
        break;
      }
      case "CAT":
      case "MEMORY":
      case "PASSWORD":
      case "MYSTERY":
      case "GAME":
      case "ACTIVITY":
      default: {
        setStage("error");
        setMessage(t.errors.inactive);
        break;
      }
    }
  }, [errorMessage, router, t.errors.inactive]);

  const handleToken = useCallback(async (token: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setPaused(true);

    if (!user || !hasProfile) {
      router.replace(`/join?token=${encodeURIComponent(token)}&from=scan`);
      return;
    }

    setStage("processing");
    try {
      const res = await processQRCode(token);
      await handleQrResult(res, token);
    } catch (err) {
      setStage("error");
      setMessage(errorMessage(err));
    } finally {
      processingRef.current = false;
    }
  }, [errorMessage, handleQrResult, hasProfile, router, user]);

  // Pre-fill from ?token= (e.g. shared links)
  useEffect(() => {
    const token = searchParams.get("token");
    if (token && !user && loading === false) {
      router.replace("/join?token=" + encodeURIComponent(token) + "&from=scan");
    } else if (token && user && hasProfile) {
      queueMicrotask(() => void handleToken(token));
    }
  }, [searchParams, user, hasProfile, loading, handleToken, router]);

  function resume() {
    setStage("idle");
    setPaused(false);
    setManual(false);
    processingRef.current = false;
  }

  async function handleManual() {
    const token = extractUnibyteToken(manualToken);
    if (!token) {
      setStage("error");
      setMessage(t.errors.invalidQr);
      return;
    }
    setManualToken("");
    await handleToken(token);
  }

  return (
    <div className="open-day-bg flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col px-4 pb-8 pt-6">
        <BackButton fallback="/dashboard" className="mb-4 w-fit" />
        <h1 className="text-xl font-extrabold text-ink">{t.scan.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{t.scan.subtitle}</p>

        <div className="paper-panel mt-4 rounded-[28px] p-2 shadow-xl shadow-primary/10">
          <QrScannerView onDetected={handleToken} paused={paused || stage !== "idle"} />
        </div>

        <div className="mt-4 flex items-center justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setManual((m) => !m);
              setStage("idle");
            }}
          >
            <Keyboard className="h-4 w-4" />
            {t.scan.manual}
          </Button>
        </div>

        {manual && (
          <form
            className="mt-2 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleManual();
            }}
          >
            <input
              className="input font-mono"
              placeholder={t.scan.manualPlaceholder}
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
              dir="ltr"
            />
            <Button type="submit" className="w-full">
              {t.scan.submit}
            </Button>
          </form>
        )}

        {/* Result banner */}
        {(stage === "processing" ||
          stage === "success" ||
          stage === "error" ||
          stage === "entry") && (
          <div
            className={`mt-5 rounded-xl border p-4 ${
              stage === "error"
                ? "border-red-200 bg-red-50 text-danger"
                : stage === "success"
                  ? "border-primary/20 bg-primary-tint text-primary"
                  : "border-line bg-surface-muted text-ink"
            }`}
          >
            <div className="flex items-center gap-3">
              {stage === "processing" && (
                <ScanLine className="h-5 w-5 animate-pulse" />
              )}
              <div className="flex-1">
                <p className="font-semibold">
                  {stage === "processing"
                    ? t.common.loading
                    : message || (stage === "entry" ? t.app.name : "")}
                </p>
                {stage !== "processing" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={resume}
                  >
                    {t.common.retry}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={null}>
      <ScanInner />
    </Suspense>
  );
}
