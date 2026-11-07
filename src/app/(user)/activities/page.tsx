"use client";

import Link from "next/link";
import {
  BrainCircuit,
  Wrench,
  CheckCircle2,
  ScanLine,
  LockKeyhole,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useI18n } from "@/components/providers/i18n-provider";
import { useWorkshops } from "@/lib/services/data-service";
import { UserShell } from "@/components/layout/user-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

function ActivitiesInner() {
  const { user } = useAuth();
  const { t } = useI18n();
  const uid = user?.id;
  const { workshops, checkedIn } = useWorkshops(uid);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-extrabold text-ink">{t.activities.title}</h1>
        <p className="mt-0.5 text-sm text-ink-soft">{t.activities.subtitle}</p>
      </header>

      {/* Every activity is unlocked by scanning its QR code */}
      <Link href="/scan" className="block">
        <Button size="lg" className="w-full">
          <ScanLine className="h-5 w-5" />
          {t.activities.scanCta}
        </Button>
      </Link>

      <section>
        <Card className="card-pad flex items-center gap-4 border-primary/15 shadow-lg shadow-primary/5">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white"><BrainCircuit className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-ink">{t.activities.quiz}</p>
            <p className="text-xs text-ink-soft">10 questions · 30 seconds each</p>
          </div>
          <LockKeyhole className="h-4 w-4 shrink-0 text-primary/50" />
        </Card>
      </section>

      {/* Workshops */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">{t.activities.workshops}</h2>
          <Badge variant="primary">
            {checkedIn.size}/{workshops.length}
          </Badge>
        </div>
        <Card className="divide-y divide-line">
          {workshops.map((w) => {
            const done = checkedIn.has(w.id);
            return (
              <div key={w.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <Wrench
                    className={cn(
                      "h-4 w-4 shrink-0",
                      done ? "text-primary" : "text-ink-soft/40",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {w.title}
                    </p>
                    {w.location && (
                      <p className="truncate text-xs text-ink-soft">{w.location}</p>
                    )}
                  </div>
                </div>
                {done && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
              </div>
            );
          })}
        </Card>
      </section>
    </div>
  );
}

export default function ActivitiesPage() {
  return (
    <UserShell>
      <ActivitiesInner />
    </UserShell>
  );
}
