"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, QrCode as QrCodeIcon, Sparkles, Trophy, Volume2, VolumeX } from "lucide-react";
import { call } from "@/lib/supabase/callable";
import type { LeaderboardEntry, QuizParticipant, QuizSession } from "@shared/models";
import { Logo } from "@/components/brand/logo";
import { QRCode } from "@/components/qr/qr-code";
import { getQuizClock } from "@/lib/quiz/timing";
import { soundEffects } from "@/lib/quiz/sound-effects";
import { getCategoryMeta } from "@/lib/quiz/categories";

type QuestionPublic = {
  question: string;
  options: string[];
  points: number;
  correctAnswer?: number;
  category?: string;
};

export default function QuizScreen() {
  const [session, setSession] = useState<(QuizSession & { id: string }) | null>(null);
  const [questionState, setQuestionState] = useState<{ id: string; value: QuestionPublic } | null>(null);
  const [participants, setParticipants] = useState<QuizParticipant[]>([]);
  const [allTime, setAllTime] = useState<Array<LeaderboardEntry & { uid: string }>>([]);
  const [joinPayload, setJoinPayload] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [isMuted, setIsMuted] = useState(() => soundEffects.isMuted());

  // Sound tracking refs to prevent re-triggering in the same second/question
  const lastTickPlayedSec = useRef<number | null>(null);
  const lastRevealQuestionId = useRef<string | null>(null);

  useEffect(() => {
    const unlockAudio = () => soundEffects.ensureUnlocked();
    window.addEventListener("click", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  const toggleSound = () => {
    const next = soundEffects.toggleMute();
    setIsMuted(next);
  };

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
        // Keep previous valid payload if any
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

    const fetchQuestion = () => {
      call<{ questionId: string }, QuestionPublic>("getQuizDisplayQuestion", { questionId })
        .then((result) => {
          if (!cancelled && result) {
            setQuestionState({ id: questionId, value: result });
          }
        })
        .catch(() => {});
    };

    fetchQuestion();

    // Auto-retry every 2.5s if question hasn't loaded yet (handles WiFi drops / transient network errors)
    const retryTimer = window.setInterval(() => {
      if (!cancelled) {
        setQuestionState((prev) => {
          if (!prev || prev.id !== questionId) {
            fetchQuestion();
          }
          return prev;
        });
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(retryTimer);
    };
  }, [questionId]);

  // Audio Effects Triggering
  useEffect(() => {
    if (!clock || clock.ended || !questionId) return;

    if (!clock.isRevealing) {
      // Countdown ticking in the final 5 seconds of answering (5, 4, 3, 2, 1)
      if (clock.questionRemainingSec <= 5 && clock.questionRemainingSec > 0) {
        if (lastTickPlayedSec.current !== clock.questionRemainingSec) {
          lastTickPlayedSec.current = clock.questionRemainingSec;
          soundEffects.playCountdownTick(clock.questionRemainingSec);
        }
      } else {
        lastTickPlayedSec.current = null;
      }
    } else {
      // Reveal Chime played as soon as reveal phase begins
      if (lastRevealQuestionId.current !== questionId) {
        lastRevealQuestionId.current = questionId;
        soundEffects.playRevealChime();
      }
    }
  }, [clock, questionId]);

  const roundTime = clock && !clock.ended
    ? `${String(Math.floor(clock.roundRemainingSec / 60)).padStart(2, "0")}:${String(clock.roundRemainingSec % 60).padStart(2, "0")}`
    : "--:--";

  const question = questionState && questionState.id === questionId ? questionState.value : null;
  const categoryMeta = getCategoryMeta(question?.category);

  const roundParticipants = useMemo(
    () => participants
      .filter((player) => player.roundNumber === clock?.roundNumber)
      .sort((a, b) => (b.roundPoints ?? 0) - (a.roundPoints ?? 0) || a.nickname.localeCompare(b.nickname))
      .slice(0, 10),
    [participants, clock?.roundNumber],
  );

  const isLastFiveSec = clock && !clock.ended && !clock.isRevealing && clock.questionRemainingSec <= 5 && clock.questionRemainingSec > 0;

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
            <div className="flex items-center gap-3">
              {/* Sound Toggle */}
              <button
                type="button"
                onClick={toggleSound}
                className="flex items-center gap-1.5 rounded-2xl border border-primary/15 bg-white/85 px-3.5 py-3 text-xs font-bold text-ink-soft hover:bg-white hover:text-primary transition"
                title={isMuted ? "Unmute audio effects" : "Mute audio effects"}
              >
                {isMuted ? <VolumeX className="h-5 w-5 text-danger" /> : <Volume2 className="h-5 w-5 text-primary" />}
                <span className="hidden md:inline">{isMuted ? "Sound Off" : "Sound On"}</span>
              </button>

              {/* Round Timer */}
              <div className="rounded-2xl border border-primary/15 bg-white/85 px-5 py-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-soft">Round {clock && !clock.ended ? clock.roundNumber : "—"}</p>
                <p className="font-mono text-2xl font-extrabold text-primary">{roundTime}</p>
              </div>

              {/* Question Countdown / Reveal Status Box */}
              <div
                className={`min-w-28 rounded-2xl px-5 py-3 text-center text-white shadow-lg transition-all duration-300 ${
                  clock && !clock.ended && clock.isRevealing
                    ? "bg-emerald-600 shadow-emerald-500/30 scale-105"
                    : isLastFiveSec
                      ? "bg-danger shadow-danger/40 animate-pulse"
                      : "bg-primary shadow-primary/25"
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">
                  {clock && !clock.ended && clock.isRevealing ? "Reveal" : "Time Left"}
                </p>
                <p className="font-mono text-3xl font-extrabold">
                  {clock && !clock.ended
                    ? clock.isRevealing
                      ? `${clock.revealRemainingSec}s`
                      : `${clock.questionRemainingSec}s`
                    : "—"}
                </p>
              </div>
            </div>
          </header>

          <div className="flex flex-1 flex-col justify-center py-6">
            {session && clock && !clock.ended && question ? (
              <>
                {/* Category & Round metadata */}
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-primary-tint px-4 py-2 text-sm font-extrabold text-primary">
                    Round {clock.roundNumber} · Question {clock.questionIndex + 1} / {session.totalQuestions}
                  </span>

                  {/* Category Pill with Icon */}
                  <span className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-extrabold ${categoryMeta.badgeBg}`}>
                    <span className="text-base">{categoryMeta.icon}</span>
                    <span>{categoryMeta.labelAr}</span>
                    <span className="mx-1 h-3.5 w-px bg-current/25" />
                    <span className="text-xs font-semibold opacity-85">{categoryMeta.labelEn}</span>
                  </span>

                  <span className="h-px flex-1 bg-primary/15" />

                  {/* Intermission banner during reveal */}
                  {clock.isRevealing && (
                    <span className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-black text-white shadow-md animate-in fade-in slide-in-from-top-1 duration-200">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>الإجابة الصحيحة · Correct Answer</span>
                    </span>
                  )}
                </div>

                {/* Question title */}
                <h2
                  dir={/[\u0600-\u06FF]/.test(question.question) ? "rtl" : "ltr"}
                  className="max-w-6xl text-[clamp(26px,3.5vw,56px)] font-extrabold leading-[1.3] text-primary-deep text-start [unicode-bidi:isolate]"
                >
                  {question.question}
                </h2>

                {/* Options 2x2 Grid */}
                <div className="mt-[clamp(20px,3.5vh,48px)] grid grid-cols-2 gap-[clamp(12px,1.4vw,22px)]">
                  {question.options.map((option, index) => {
                    const isCorrect = clock.isRevealing && index === question.correctAnswer;
                    const isOtherWhenRevealed = clock.isRevealing && index !== question.correctAnswer;

                    return (
                      <div
                        key={`${index}-${option}`}
                        dir="auto"
                        className={`flex min-h-[92px] items-center gap-5 rounded-2xl border px-6 py-5 shadow-sm transition-all duration-300 ${
                          isCorrect
                            ? "border-emerald-500 bg-emerald-50 shadow-xl shadow-emerald-500/20 ring-4 ring-emerald-500/35 scale-[1.02]"
                            : isOtherWhenRevealed
                              ? "border-line/60 bg-white/60 opacity-40 grayscale-[25%]"
                              : "border-primary/15 bg-white/90"
                        }`}
                      >
                        <span
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-xl font-extrabold transition-colors ${
                            isCorrect ? "bg-emerald-600 text-white" : "bg-primary text-white"
                          }`}
                        >
                          {isCorrect ? "✓" : String.fromCharCode(65 + index)}
                        </span>
                        <div className="flex flex-1 items-center justify-between gap-3">
                          <span
                            dir={/[\u0600-\u06FF]/.test(option) ? "rtl" : "ltr"}
                            className={`text-[clamp(18px,1.6vw,30px)] font-bold leading-tight text-start [unicode-bidi:isolate] ${
                              isCorrect ? "text-emerald-950 font-extrabold" : "text-ink"
                            }`}
                          >
                            {option}
                          </span>
                          {isCorrect && (
                            <span className="shrink-0 rounded-xl bg-emerald-600 px-3 py-1 text-xs font-black text-white shadow-sm">
                              Correct ✓
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="mx-auto max-w-2xl text-center">
                <Sparkles className="mx-auto h-14 w-14 text-primary" />
                <h2 className="mt-5 text-5xl font-extrabold text-primary-deep">
                  {clock?.ended ? "Quiz stopped" : "Ready for the quiz?"}
                </h2>
                <p className="mt-4 text-xl text-ink-soft">
                  Automatic 5-minute rounds · Interleaved categories · Runs until staff stops it
                </p>
              </div>
            )}
          </div>
        </section>

        <aside className="grid min-h-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-col">
          <section className="paper-panel rounded-[28px] border border-white/70 p-5 text-center shadow-xl shadow-primary/10">
            <div className="flex items-center justify-center gap-2 text-primary">
              <QrCodeIcon className="h-5 w-5" />
              <h2 className="font-extrabold">Scan with your phone</h2>
            </div>
            <div className="mx-auto mt-3 w-fit rounded-[24px] border-4 border-primary bg-white p-2 shadow-lg shadow-primary/20">
              {joinPayload ? (
                <QRCode value={joinPayload} size={210} fgColor="#550055" />
              ) : (
                <div className="h-[210px] w-[210px] animate-pulse rounded-xl bg-primary-tint" />
              )}
            </div>
            <p className="mt-3 text-sm font-semibold text-ink-soft">
              Camera or UniByte scanner → enter your name → answer
            </p>
          </section>

          <section className="paper-panel min-h-0 flex-1 overflow-hidden rounded-[28px] border border-white/70 p-5 shadow-xl shadow-primary/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                <h2 className="font-extrabold">Round Top 10</h2>
              </div>
              <span className="flex items-center gap-1 text-xs font-bold text-success">
                <span className="h-2 w-2 animate-pulse rounded-full bg-success" /> LIVE
              </span>
            </div>
            <ol className="mt-3 space-y-1.5">
              {roundParticipants.map((player, index) => (
                <li key={player.userId} className="flex items-center gap-3 rounded-xl border border-primary/10 bg-white/80 px-3 py-2">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-extrabold ${
                      index < 3 ? "bg-primary text-white" : "bg-primary-tint text-primary"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{player.nickname}</span>
                  <span className="font-mono text-sm font-extrabold text-primary">{player.roundPoints ?? 0}</span>
                </li>
              ))}
              {roundParticipants.length === 0 && (
                <li className="py-8 text-center text-sm text-ink-soft">Answer to enter this round</li>
              )}
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
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold ${
                      index === 0
                        ? "bg-amber-400 text-amber-950"
                        : index === 1
                          ? "bg-slate-200 text-slate-700"
                          : "bg-orange-200 text-orange-800"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{player.nickname}</span>
                  <span className="font-mono text-sm font-extrabold text-primary">{player.totalXP} XP</span>
                </li>
              ))}
              {allTime.length === 0 && (
                <li className="py-3 text-center text-xs text-ink-soft">No overall scores yet</li>
              )}
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}
