"use client";

import { useEffect, useRef, useState } from "react";
import QRCodeLib from "qrcode";
import { cn } from "@/lib/utils/cn";

interface QRCodeProps {
  value: string;
  size?: number;
  className?: string;
  bgColor?: string;
  fgColor?: string;
  /** object-fit style: the QR canvas will always be square */
}

export function QRCode({
  value,
  size = 160,
  className,
  bgColor = "#FFFFFF",
  fgColor = "#550055",
}: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    QRCodeLib.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: fgColor, light: bgColor },
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [value, size, bgColor, fgColor]);

  if (error) {
    return (
      <div
        className={cn("flex items-center justify-center bg-white", className)}
        style={{ width: size, height: size }}
      >
        <span className="text-xs text-ink-soft">QR</span>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={cn("h-auto", className)}
      style={{ width: size, height: size }}
    />
  );
}
