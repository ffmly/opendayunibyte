"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export function BackButton({
  fallback = "/dashboard",
  label = "Back",
  className,
}: {
  fallback?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/10 bg-white/85 px-3 py-2 text-sm font-bold text-primary shadow-sm backdrop-blur transition hover:bg-primary-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
        className,
      )}
      aria-label={label}
    >
      <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
      <span>{label}</span>
    </button>
  );
}
