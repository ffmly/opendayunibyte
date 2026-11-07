"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { extractUnibyteToken } from "@/lib/qr/parse";

const QrScanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((m) => m.Scanner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[260px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    ),
  },
);

interface QrScannerProps {
  onDetected: (text: string) => void;
  paused?: boolean;
}

/**
 * Central QR camera reader. Detected codes are parsed for `token=` then
 * forwarded. The scanner pauses itself after a detection to avoid duplicate
 * triggers; the parent resumes it by toggling `paused`.
 */
export function QrScannerView({ onDetected, paused = false }: QrScannerProps) {
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const [cameraError, setCameraError] = useState<string | null>(null);

  const handleScan = useCallback(
    (codes: Array<{ rawValue?: string; rawBytes?: number[]; value?: string }>) => {
      const raw = codes[0]?.rawValue ?? codes[0]?.value;
      if (!raw) return;
      const token = extractUnibyteToken(raw);
      if (!token) return;
      // Dedupe identical reads within a 3s window (camera keeps re-reporting)
      const now = Date.now();
      if (raw === lastRef.current.text && now - lastRef.current.at < 3000) {
        return;
      }
      lastRef.current = { text: raw, at: now };
      onDetected(token);
    },
    [onDetected],
  );

  const handleError = useCallback(() => {
    setCameraError("camera");
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <QrScanner
        onScan={handleScan}
        onError={handleError}
        paused={paused}
        formats={["qr_code"]}
        constraints={{ facingMode: "environment" }}
        allowMultiple={false}
        scanDelay={1000}
        sound={false}
        classNames={{ container: "w-full" }}
      />
      {cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center">
          <p className="text-sm text-white">Camera unavailable</p>
        </div>
      )}
    </div>
  );
}
