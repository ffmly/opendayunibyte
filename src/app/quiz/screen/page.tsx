"use client";

import { useEffect, useMemo, useState } from "react";
import { QrCode as QrCodeIcon, Sparkles, Trophy } from "lucide-react";
import { call } from "@/lib/supabase/callable";
import type { LeaderboardEntry, QuizParticipant, QuizSession } from "@shared/models";
import { Logo } from "@/components/brand/logo";
import { QRCode } from "@/components/qr/qr-code";
import { getQuizClock } from "@/lib/quiz/timing";

type QuestionPublic = { question: string; options: string[]; points: number };

export default function QuizScreen() {
  const [session, setSession] = useState<(QuizSession & { id: string }) | null>(null);
  const [questionState, setQuestionState] = useState<{ id: string; value: QuestionPublic } | null>(null);
  const [participants, setParticipants] = useState<QuizParticipant[]>([]);
  const [allTime, setAllTime] = useState<Array<LeaderboardEntry & { uid: string }>>([]);
  const [joinPayload, setJoinPayload] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = await call<unknown, {
        session: (QuizSession & { id: string }) | null;
        participants: QuizParticipant[];
        allTime: Array<LeaderboardEntry & { uid: string }>;
      }>("getQuizLiveState", { participantLimit: 200, leaderboardLimit: 3 });
      if (!cancelled) {
        setSession(result.session);
        setParticipants(result.participants);
        setAllTime(result.allTime);
      }
    };
    void load();
    const timer = window.setInterval(load, 1_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadJoinCode = async () => {
      try {
        const result = await call<undefined, { payload: string; token: string }>("getQuizJoinCode");
        if (cancelled || !result?.payload) return;
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const full = result.payload.startsWith("http")
          ? result.payload
          : `${origin}${result.payload.startsWith("/") ? "" : "/"}${result.payload}`;
        setJoinPayload(full);
      } catch {
        // Keep previous valid payload if any; only set empty if nothing yet
      }
    };
    void loadJoinCode();
    const timer = window.setInterval(loadJoinCode, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const clock = useMemo(() => (session ? getQuizClock(session, now) : null), [session, now]);
  const questionId = clock?.ended ? null : clock?.questionId;

  useEffect(() => {
    if (!questionId) return;
    let cancelled = false;
    call<{ questionId: string }, QuestionPublic>("getQuizDisplayQuestion", { questionId })
      .then((result) => !cancelled && setQuestionState({ id: questionId, value: result }))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [questionId]);

  const roundTime = clock && !clock.ended
    ? `${String(Math.floor(clock.roundRemainingSec / 60)).padStart(2, "0")}:${String(clock.roundRemainingSec % 60).padStart(2, "0")}`
    : "--:--";
  const question = questionState && questionState.id === questionId ? questionState.value : null;
  const roundParticipants = useMemo(
    () => participants
      .filter((player) => player.roundNumber === clock?.roundNumber)
      .sort((a, b) => (b.roundPoints ?? 0) - (a.roundPoints ?? 0) || a.nickname.localeCompare(b.nickname))
      .slice(0, 10),
    [participants, clock?.roundNumber],
  );

  return (
    <main dir="ltr" className="open-day-bg min-h-dvh overflow-hidden p-[clamp(18px,2vw,34px)] text-ink">
      <div className="mx-auto grid min-h-[calc(100dvh-clamp(36px,4vw,68px))] max-w-[1800px] grid-cols-1 gap-[clamp(16px,2vw,30px)] lg:grid-cols-[minmax(0,1fr)_clamp(270px,24vw,390px)]">
        <section className="paper-panel flex min-w-0 flex-col rounded-[32px] border border-white/70 p-[clamp(24px,3vw,54px)] shadow-2xl shadow-primary/15">
          <header className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <Logo size={72} priority />
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary">UniByte Open Day</p>
                <h1 className="text-[clamp(24px,2.4vw,46px)] font-extrabold text-primary-deep">Live Quiz</h1>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="rounded-2xl border border-primary/15 bg-white/85 px-5 py-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-soft">Round {clock && !clock.ended ? clock.roundNumber : "—"}</p>
                <p className="font-mono text-2xl font-extrabold text-primary">{roundTime}</p>
              </div>
              <div className="min-w-24 rounded-2xl bg-primary px-5 py-3 text-center text-white shadow-lg shadow-primary/25">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/65">Question</p>
                <p className="font-mono text-3xl font-extrabold">{clock && !clock.ended ? clock.questionRemainingSec : "—"}</p>
              </div>
            </div>
          </header>

          <div className="flex flex-1 flex-col justify-center py-6">
            {session && clock && !clock.ended && question ? (
              <>
                <div className="mb-5 flex items-center gap-3">
                  <span className="rounded-full bg-primary-tint px-4 py-2 text-sm font-extrabold text-primary">Round {clock.roundNumber} · Question {clock.questionIndex + 1} / {session.totalQuestions}</span>
                  <span className="h-px flex-1 bg-primary/15" />
                </div>
                <h2 className="max-w-6xl text-[clamp(34px,4.2vw,76px)] font-extrabold leading-[1.04] text-primary-deep">{question.question}</h2>
                <div className="mt-[clamp(24px,4vh,54px)] grid grid-cols-2 gap-[clamp(12px,1.4vw,22px)]">
                  {question.options.map((option, index) => (
                    <div key={`${index}-${option}`} className="flex min-h-[92px] items-center gap-5 rounded-2xl border border-primary/15 bg-white/90 px-6 py-5 shadow-sm">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-xl font-extrabold text-white">{String.fromCharCode(65 + index)}</span>
                      <span className="text-[clamp(20px,1.8vw,32px)] font-bold leading-tight">{option}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mx-auto max-w-2xl text-center">
                <Sparkles className="mx-auto h-14 w-14 text-primary" />
                <h2 className="mt-5 text-5xl font-extrabold text-primary-deep">{clock?.ended ? "Quiz stopped" : "Ready for the quiz?"}</h2>
                <p className="mt-4 text-xl text-ink-soft">Automatic 5-minute rounds · runs until staff stops it</p>
              </div>
            )}
          </div>
        </section>

        <aside className="grid min-h-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-col">
          <section className="paper-panel rounded-[28px] border border-white/70 p-5 text-center shadow-xl shadow-primary/10">
            <div className="flex items-center justify-center gap-2 text-primary"><QrCodeIcon className="h-5 w-5" /><h2 className="font-extrabold">Scan with your phone</h2></div>
            <div className="mx-auto mt-3 w-fit rounded-[24px] border-4 border-primary bg-white p-2 shadow-lg shadow-primary/20">
              {joinPayload ? <QRCode value={joinPayload} size={210} fgColor="#550055" /> : <div className="h-[210px] w-[210px] animate-pulse rounded-xl bg-primary-tint" />}
            </div>
            <p className="mt-3 text-sm font-semibold text-ink-soft">Camera or UniByte scanner → enter your name → answer</p>
          </section>

          <section className="paper-panel min-h-0 flex-1 overflow-hidden rounded-[28px] border border-white/70 p-5 shadow-xl shadow-primary/10">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" /><h2 className="font-extrabold">Round Top 10</h2></div>
              <span className="flex items-center gap-1 text-xs font-bold text-success"><span className="h-2 w-2 animate-pulse rounded-full bg-success" /> LIVE</span>
            </div>
            <ol className="mt-3 space-y-1.5">
              {roundParticipants.map((player, index) => (
                <li key={player.userId} className="flex items-center gap-3 rounded-xl border border-primary/10 bg-white/80 px-3 py-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-extrabold ${index < 3 ? "bg-primary text-white" : "bg-primary-tint text-primary"}`}>{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{player.nickname}</span>
                  <span className="font-mono text-sm font-extrabold text-primary">{player.roundPoints ?? 0}</span>
                </li>
              ))}
              {roundParticipants.length === 0 && <li className="py-8 text-center text-sm text-ink-soft">Answer to enter this round</li>}
            </ol>
          </section>

          <section className="paper-panel rounded-[28px] border border-white/70 p-5 shadow-xl shadow-primary/10 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">All-time</p>
                <h2 className="font-extrabold text-primary-deep">Open Day Top 3</h2>
              </div>
              <Trophy className="h-6 w-6 text-amber-500" />
            </div>
            <ol className="mt-3 grid gap-2">
              {allTime.map((player, index) => (
                <li key={player.uid} className="flex items-center gap-3 rounded-xl border border-primary/10 bg-white/82 px-3 py-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold ${
                    index === 0
                      ? "bg-amber-400 text-amber-950"
                      : index === 1
                        ? "bg-slate-200 text-slate-700"
                        : "bg-orange-200 text-orange-800"
                  }`}>{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{player.nickname}</span>
                  <span className="font-mono text-sm font-extrabold text-primary">{player.totalXP} XP</span>
                </li>
              ))}
              {allTime.length === 0 && <li className="py-3 text-center text-xs text-ink-soft">No overall scores yet</li>}
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}
