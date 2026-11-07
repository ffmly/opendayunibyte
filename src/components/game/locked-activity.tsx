"use client";

import Link from "next/link";
import { LockKeyhole, ScanLine } from "lucide-react";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Shown when a game is reached without scanning its QR code. Participation is
 * only possible through the /scan flow, so direct navigation is locked.
 */
export function LockedActivity({ title }: { title: string }) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-extrabold text-ink">{title}</h1>
      </header>
      <Card className="card-pad flex flex-col items-center gap-3 text-center !py-10">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-tint text-primary">
          <LockKeyhole className="h-7 w-7" />
        </span>
        <div>
          <p className="font-bold text-ink">{t.locked.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            {t.locked.subtitle}
          </p>
        </div>
        <Link href="/scan" className="mt-2 w-full">
          <Button size="lg" className="w-full">
            <ScanLine className="h-5 w-5" />
            {t.locked.scan}
          </Button>
        </Link>
      </Card>
    </div>
  );
}
