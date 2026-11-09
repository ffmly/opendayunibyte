"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, Lock, Sparkles, XCircle } from "lucide-react";
import { call } from "@/lib/supabase/callable";
import { useI18n } from "@/components/providers/i18n-provider";
import { submitQuizAnswer } from "@/lib/services/game-services";
import { getQuizClock } from "@/lib/quiz/timing";
import type { QuizSession } from "@shared/models";
import { LockedActivity } from "@/components/game/locked-activity";
import { Card } from "@/components/ui/card";
import { FullPageLoader } from "@/components/ui/feedback";
import { cn } from "@/lib/utils/cn";
import { BackButton } from "@/components/navigation/back-button";
import { getCategoryMeta } from "@/lib/quiz/categories";

type QuestionPublic = {
  question: string;
  options: string[];
  points: number;
  correctAnswer?: number;
  category?: string;
};

interface RecordedAnswer {
  questionKey: string;
  picked: number;
  result: boolean | null;
  points: number;
  questionNumber: number;
  roundNumber: number;
}

function QuizInner() {
  const { t, locale } = useI18n();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const [session, setSession] = useState<QuizSession | null>(null);
  const [questionState, setQuestionState] = useState<{ id: string; value: QuestionPublic } | null>(null);
  const [answersHistory, setAnswersHistory] = useState<Record<string, RecordedAnswer>>({});
  const [myPoints, setMyPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [live, mine] = await Promise.all([
          call<unknown, { session: (QuizSession & { id: string }) | null }>("getQuizLiveState", { participantLimit: 10, leaderboardLimit: 3 }),
          call<{ sessionId: string }, { participant: { points: number } | null }>("getQuizParticipantState", { sessionId }),
        ]);
        if (!cancelled) {
          setSession(live.session?.id === sessionId ? live.session : null);
          setMyPoints(live.session?.id === sessionId ? (mine.participant?.points ?? 0) : 0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(load, 1_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [sessionId]);

  const clock = useMemo(() => (session ? getQuizClock(session, now) : null), [session, now]);
  const questionId = clock?.ended ? null : clock?.questionId;
  const questionKey = questionId && clock ? `${clock.roundNumber}:${questionId}` : null;

  useEffect(() => {
    if (!questionId) return;
    let cancelled = false;

    const fetchQuestion = () => {
      call<{ questionId: string }, QuestionPublic>("getQuizDisplayQuestion", { questionId })
        .then((value) => {
          if (!cancelled && value) {
            setQuestionState({ id: questionId, value });
            setError("");
          }
        })
        .catch(() => {});
    };

    fetchQuestion();

    // Auto-retry every 2.5s if question hasn't loaded yet (recovers from WiFi blinks)
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

  const answer = useCallback(async (answerIndex: number) => {
    if (!sessionId || !questionId || !questionKey || answersHistory[questionKey] || clock?.ended || clock?.isRevealing) return;
    const initialEntry: RecordedAnswer = {
      questionKey,
      picked: answerIndex,
      result: null,
      points: 0,
      questionNumber: clock ? clock.questionIndex + 1 : 1,
      roundNumber: clock ? clock.roundNumber : 1,
    };
    setAnswersHistory((prev) => ({ ...prev, [questionKey]: initialEntry }));
    try {
      const response = await submitQuizAnswer({ sessionId, questionId, answerIndex });
      setAnswersHistory((prev) => ({
        ...prev,
        [questionKey]: {
          ...initialEntry,
          result: response.correct,
          points: response.points ?? 0,
        },
      }));
    } catch (cause) {
      setAnswersHistory((prev) => {
        const next = { ...prev };
        delete next[questionKey];
        return next;
      });
      setError((cause as Error).message || t.errors.generic);
    }
  }, [sessionId, questionId, questionKey, answersHistory, clock, t.errors.generic]);

  const question = questionState && questionState.id === questionId ? questionState.value : null;
  const currentAnswer = questionKey ? answersHistory[questionKey] : null;
  const picked = currentAnswer?.picked ?? null;

  // Reveal state: when isRevealing is true or questionRemainingSec === 0 or ended
  const isRevealing = clock ? clock.isRevealing || clock.questionRemainingSec === 0 || clock.ended : false;
  const correctAnswer = question?.correctAnswer ?? null;
  const isCorrectPick = picked !== null && correctAnswer !== null && picked === correctAnswer;

  const categoryMeta = getCategoryMeta(question?.category);

  if (!sessionId) return <LockedActivity title={t.activities.quiz} />;
  if (loading) return <FullPageLoader />;

  return (
    <div className="space-y-4" dir="ltr">
      <BackButton fallback="/dashboard" />
      <header className="paper-panel rounded-2xl p-4 shadow-lg shadow-primary/5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">UniByte Open Day</p>
            <h1 className="text-2xl font-extrabold text-primary-deep">Live Quiz</h1>
          </div>
          <span className="rounded-full bg-primary px-4 py-2 text-sm font-extrabold text-white">{myPoints} pts</span>
        </div>
      </header>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>}

      {session && clock && !clock.ended && question ? (
        <Card className="overflow-hidden border-primary/15 bg-white/92 shadow-xl shadow-primary/10">
          {/* Progress bar */}
          <div className="h-2 bg-primary-tint">
            <div
              className={`h-full transition-[width] duration-200 ${isRevealing ? "bg-emerald-500" : "bg-primary"}`}
              style={{
                width: isRevealing
                  ? `${((clock.revealRemainingSec || 5) / 5) * 100}%`
                  : `${(clock.questionRemainingSec / 25) * 100}%`,
              }}
            />
          </div>

          <div className="p-5">
            {/* Category and round info */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-primary">
                  Round {clock.roundNumber} · Q{clock.questionIndex + 1}/{session.totalQuestions}
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${categoryMeta.badgeBg}`}>
                  <span>{categoryMeta.icon}</span>
                  <span>{locale === "ar" ? categoryMeta.labelAr : categoryMeta.labelEn}</span>
                </span>
              </div>

              {/* Countdown or Reveal badge */}
              <div
                className={`flex items-center gap-1 font-mono text-sm font-extrabold px-3 py-1 rounded-xl transition-all ${
                  isRevealing
                    ? "bg-emerald-100 text-emerald-800"
                    : clock.questionRemainingSec <= 5
                      ? "bg-red-100 text-danger animate-pulse"
                      : "bg-primary/10 text-primary"
                }`}
              >
                <Clock3 className="h-4 w-4" />
                <span>{isRevealing ? `${clock.revealRemainingSec}s (Reveal)` : `${clock.questionRemainingSec}s`}</span>
              </div>
            </div>

            {/* Question Text */}
            <h2
              dir={/[\u0600-\u06FF]/.test(question.question) ? "rtl" : "ltr"}
              className="mt-4 text-xl sm:text-2xl font-extrabold leading-relaxed text-primary-deep text-start [unicode-bidi:isolate]"
            >
              {question.question}
            </h2>

            {/* Answer Options */}
            <div className="mt-5 grid gap-3">
              {question.options.map((option, index) => {
                const isPicked = picked === index;
                const isRightOption = isRevealing && correctAnswer === index;
                const isWrongPicked = isRevealing && isPicked && !isRightOption;

                return (
                  <button
                    key={`${index}-${option}`}
                    dir="auto"
                    disabled={picked !== null || isRevealing || clock.questionRemainingSec === 0}
                    onClick={() => answer(index)}
                    className={cn(
                      "flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 text-left font-bold transition-all",
                      // Idle state
                      picked === null &&
                        !isRevealing &&
                        "border-primary/15 bg-white hover:border-primary hover:bg-primary-tint active:scale-[0.99]",
                      // Locked state while answering (neutral purple)
                      isPicked &&
                        !isRevealing &&
                        "border-primary bg-primary-tint/80 text-primary-deep ring-2 ring-primary/30 shadow-md",
                      // Correct option revealed
                      isRightOption &&
                        "border-emerald-500 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500/40 shadow-md",
                      // Picked wrong option revealed
                      isWrongPicked &&
                        "border-red-400 bg-red-50 text-danger shadow-md",
                      // Other unpicked options
                      !isPicked &&
                        !isRightOption &&
                        (picked !== null || isRevealing) &&
                        "border-line/60 opacity-40 cursor-not-allowed bg-slate-50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white transition-colors",
                        isRightOption
                          ? "bg-emerald-600"
                          : isWrongPicked
                            ? "bg-danger"
                            : isPicked && !isRevealing
                              ? "bg-primary"
                              : "bg-primary",
                      )}
                    >
                      {isRightOption ? "✓" : String.fromCharCode(65 + index)}
                    </span>

                    <span
                      dir={/[\u0600-\u06FF]/.test(option) ? "rtl" : "ltr"}
                      className="flex-1 text-sm sm:text-base font-bold leading-snug text-start [unicode-bidi:isolate]"
                    >
                      {option}
                    </span>

                    {/* Locked badge during answering */}
                    {isPicked && !isRevealing && (
                      <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-extrabold text-primary">
                        <Lock className="h-3.5 w-3.5" />
                        <span>{locale === "ar" ? "مثبت" : "Locked"}</span>
                      </span>
                    )}

                    {/* Revealed icons */}
                    {isRightOption && (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    )}
                    {isWrongPicked && (
                      <XCircle className="h-5 w-5 text-danger shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Status Feedback Message */}
            {picked !== null && !isRevealing && (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary-tint/50 px-4 py-2.5 text-xs font-bold text-primary">
                <Lock className="h-4 w-4 shrink-0" />
                <span>
                  {locale === "ar"
                    ? "تم تسجيل إجابتك · انتظر انتهاء الوقت لمعرفة النتيجة..."
                    : "Answer locked · Results reveal when the timer ends..."}
                </span>
              </div>
            )}

            {/* Intermission Result Announcement */}
            {isRevealing && (
              <div
                className={cn(
                  "mt-4 rounded-xl border p-3.5 text-center text-sm font-black shadow-sm animate-in fade-in zoom-in-95 duration-200",
                  isCorrectPick
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : picked !== null
                      ? "border-red-300 bg-red-50 text-red-900"
                      : "border-amber-300 bg-amber-50 text-amber-900",
                )}
              >
                {isCorrectPick ? (
                  <p>
                    🎉 {locale === "ar" ? "إجابة صحيحة! أحسنت (+100 نقطة)" : "Correct answer! (+100 pts)"}
                  </p>
                ) : picked !== null ? (
                  <p>
                    ❌ {locale === "ar"
                      ? `إجابة خاطئة · الإجابة الصحيحة هي: (${correctAnswer !== null ? String.fromCharCode(65 + correctAnswer) : "—"})`
                      : `Incorrect · The correct answer was (${correctAnswer !== null ? String.fromCharCode(65 + correctAnswer) : "—"})`}
                  </p>
                ) : (
                  <p>
                    ⏰ {locale === "ar"
                      ? `انتهى الوقت · الإجابة الصحيحة هي: (${correctAnswer !== null ? String.fromCharCode(65 + correctAnswer) : "—"})`
                      : `Time's up · The correct answer was (${correctAnswer !== null ? String.fromCharCode(65 + correctAnswer) : "—"})`}
                  </p>
                )}
                <p className="mt-1 text-xs font-semibold opacity-75">
                  {locale === "ar" ? "السؤال التالي سيبدأ خلال ثوانٍ..." : "Next question starts in a few seconds..."}
                </p>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card className="p-8 text-center bg-white/92 shadow-xl shadow-primary/10">
          <Sparkles className="mx-auto h-12 w-12 text-primary" />
          <h2 className="mt-4 text-2xl font-extrabold text-primary-deep">
            {clock?.ended ? (locale === "ar" ? "انتهت جولة الكويز" : "Quiz Round Ended") : (locale === "ar" ? "بانتظار بدء السؤال..." : "Waiting for next question...")}
          </h2>
          <p className="mt-2 text-sm text-ink-soft">
            {locale === "ar" ? "تابع الشاشة الكبيرة للمزيد من التفاصيل" : "Look at the main screen for details."}
          </p>
        </Card>
      )}
    </div>
  );
}

export default function QuizPage() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <QuizInner />
    </Suspense>
  );
}
