"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ExternalLink, MapPin, Sparkles, CheckCircle2 } from "lucide-react";
import type { Workshop } from "@shared/models";
import { UserShell } from "@/components/layout/user-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FullPageLoader } from "@/components/ui/feedback";
import { call } from "@/lib/supabase/callable";
import { BackButton } from "@/components/navigation/back-button";

function WorkshopInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const rawId = params?.id;
  const workshopId =
    typeof rawId === "string"
      ? decodeURIComponent(rawId)
      : Array.isArray(rawId) && typeof rawId[0] === "string"
        ? decodeURIComponent(rawId[0])
        : null;

  const [workshop, setWorkshop] = useState<(Workshop & { id: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  useEffect(() => {
    if (!workshopId) return;

    let cancelled = false;

    call<{ id: string }, Workshop & { id: string }>("getWorkshop", { id: workshopId })
      .then((data) => {
        if (!cancelled) {
          setWorkshop(data);
          setError(null);
          setLoadedId(workshopId);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setWorkshop(null);
          setError((err as Error)?.message ?? "Workshop not found.");
          setLoadedId(workshopId);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [workshopId]);

  const loading = Boolean(workshopId && loadedId !== workshopId);

  const attendance = searchParams.get("attendance");

  return (
    <UserShell>
      <div className="space-y-4">
        <BackButton fallback="/activities" />
        <div className="rounded-2xl border border-primary/15 bg-white/90 p-4 shadow-lg shadow-primary/5 backdrop-blur">
          <div className="flex items-center gap-3 text-success">
            <CheckCircle2 className="h-6 w-6" />
            <div>
              <p className="font-extrabold">
                {attendance === "existing"
                  ? "Attendance already recorded"
                  : "Attendance recorded"}
              </p>
              <p className="text-xs text-ink-soft">
                You are checked in for this workshop.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : workshop ? (
          <Card className="overflow-hidden border-primary/15 bg-white/92 shadow-xl shadow-primary/10">
            <div className="flex items-center gap-3 border-b border-line p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                  UniByte workshop
                </p>
                <h1 className="text-xl font-extrabold text-ink">{workshop.title}</h1>
              </div>
            </div>

            {workshop.postImageUrl ? (
              <div className="flex justify-center bg-primary-tint/35 p-3 sm:p-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={workshop.postImageUrl}
                  alt={workshop.title}
                  className="max-h-[520px] w-auto max-w-full rounded-2xl object-contain shadow-lg shadow-primary/10"
                />
              </div>
            ) : (
              <div className="flex aspect-square items-center justify-center bg-[radial-gradient(circle_at_top,#aa45b5_0,#550055_44%,#26002b_100%)] p-10 text-center text-white">
                <div>
                  <Sparkles className="mx-auto h-10 w-10" />
                  <p className="mt-4 text-3xl font-extrabold">{workshop.title}</p>
                  <p className="mt-2 text-sm text-white/75">Learn · build · share</p>
                </div>
              </div>
            )}

            <div className="space-y-4 p-5">
              {workshop.location && (
                <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <MapPin className="h-4 w-4" /> {workshop.location}
                </p>
              )}
              <p className="whitespace-pre-wrap text-lg font-medium leading-8 text-ink sm:text-xl sm:leading-9">
                {workshop.summary ||
                  "Welcome to this UniByte Open Day workshop. Your attendance has been saved successfully."}
              </p>
              {workshop.contentUrl && (
                <a
                  href={workshop.contentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block"
                >
                  <Button className="w-full">
                    Open activity content <ExternalLink className="h-4 w-4" />
                  </Button>
                </a>
              )}
            </div>
          </Card>
        ) : (
          <Card className="card-pad text-center text-ink-soft">
            {error || "Workshop not found."}
          </Card>
        )}
      </div>
    </UserShell>
  );
}

export default function WorkshopExperiencePage() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <WorkshopInner />
    </Suspense>
  );
}
