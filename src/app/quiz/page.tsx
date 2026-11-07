"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, Lock, Sparkles, XCircle } from "lucide-react";
import { call } from "@/lib/supabase/callable";
import { useI18n } from "@/components/providers/i18n-provider";
import { submitQuizAnswer } from "@/lib/services/game-services";
import { getQuizClock } from "@/lib/quiz/timing";
import type { QuizSession } from "@shared/models";
import { UserShell } from "@/components/layout/user-shell";
import { LockedActivity } from "@/components/game/locked-activity";
import { Card } from "@/components/ui/card";
import { FullPageLoader } from "@/components/ui/feedback";
import { cn } from "@/lib/utils/cn";
import { BackButton } from "@/components/navigation/back-button";

type QuestionPublic = { question: string; options: string[]; points: number };

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
    call<{ questionId: string }, QuestionPublic>("getQuizDisplayQuestion", { questionId })
      .then((value) => !cancelled && setQuestionState({ id: questionId, value }))
      .catch(() => !cancelled && setError(t.errors.generic));
    return () => { cancelled = true; };
  }, [questionId, t.errors.generic]);

  const answer = useCallback(async (answerIndex: number) => {
    if (!sessionId || !questionId || !questionKey || answersHistory[questionKey] || clock?.ended) return;
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

  // Crucial: The player only sees the result AFTER the question timer ends or when the round ends!
  // While clock.questionRemainingSec > 0, the answer is LOCKED, NEVER revealing correct/incorrect!
  const isTimerEnded = clock ? clock.questionRemainingSec === 0 || clock.ended : false;
  const result = isTimerEnded ? (currentAnswer?.result ?? null) : null;

  // Previous question result banner (shows during the first 8 seconds of the new question)
  const previousQuestionNumber = clock ? clock.questionIndex : 0;
  const previousAnswer = useMemo(() => {
    if (!clock || previousQuestionNumber <= 0) return null;
    return Object.values(answersHistory).find(
      (a) =>
        a.roundNumber === clock.roundNumber &&
        a.questionNumber === previousQuestionNumber &&
        a.result !== null,
    );
  }, [clock, previousQuestionNumber, answersHistory]);

  const showPreviousResult = Boolean(previousAnswer && clock && clock.questionRemainingSec > 22);

  if (!sessionId) return <LockedActivity title={t.activities.quiz} />;
  if (loading) return <FullPageLoader />;

  return (
    <div className="space-y-4" dir="ltr">
      <BackButton fallback="/dashboard" />
      <header className="paper-panel rounded-2xl p-4 shadow-lg shadow-primary/5">
        <div className="flex items-center justify-between">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">UniByte Open Day</p><h1 className="text-2xl font-extrabold text-primary-deep">Live Quiz</h1></div>
          <span className="rounded-full bg-primary px-4 py-2 text-sm font-extrabold text-white">{myPoints} pts</span>
        </div>
      </header>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>}

      {session && clock && !clock.ended && question ? (
        <Card className="overflow-hidden border-primary/15 bg-white/92 shadow-xl shadow-primary/10">
          <div className="h-2 bg-primary-tint"><div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${(clock.questionRemainingSec / 30) * 100}%` }} /></div>
          <div className="p-5">
            {showPreviousResult && previousAnswer && (
              <div
                className={cn(
                  "mb-4 flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-extrabold shadow-sm animate-in fade-in slide-in-from-top-1 duration-200",
                  previousAnswer.result
                    ? "border-green-300 bg-green-50 text-green-900"
                    : "border-red-300 bg-red-50 text-red-900",
                )}
              >
                <div className="flex items-center gap-2">
                  {previousAnswer.result ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-danger shrink-0" />
                  )}
                  <span>
                    {previousAnswer.result
                      ? locale === "ar"
                        ? `إجابة السؤال ${previousAnswer.questionNumber} كانت صحيحة! (+${previousAnswer.points} نقطة)`
                        : `Question ${previousAnswer.questionNumber} was Correct! (+${previousAnswer.points} pts)`
                      : locale === "ar"
                        ? `إجابة السؤال ${previousAnswer.questionNumber} كانت خاطئة`
                        : `Question ${previousAnswer.questionNumber} was Incorrect`}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <span className="font-extrabold text-primary">Round {clock.roundNumber} · Question {clock.questionIndex + 1} / {session.totalQuestions}</span>
              <span className="flex items-center gap-1 font-mono text-lg font-extrabold text-primary"><Clock3 className="h-4 w-4" />{clock.questionRemainingSec}s</span>
            </div>
            <h2 className="mt-5 text-2xl font-extrabold leading-tight text-primary-deep">{question.question}</h2>
            <div className="mt-6 grid gap-3">
              {question.options.map((option, index) => {
                const isPicked = picked === index;
                const isOther = picked !== null && !isPicked;
                return (
                  <button
                    key={`${index}-${option}`}
                    disabled={picked !== null || clock.questionRemainingSec === 0}
                    onClick={() => answer(index)}
                    className={cn(
                      "flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 text-left font-bold transition-all",
                      // Idle state
                      picked === null &&
                        "border-primary/15 bg-white hover:border-primary hover:bg-primary-tint active:scale-[0.99]",
                      // Locked state while timer is running (NEUTRAL - NO RED/GREEN)
                      isPicked &&
                        !isTimerEnded &&
                        "border-primary bg-primary-tint/80 text-primary-deep ring-2 ring-primary/30 shadow-md",
                      // Revealed after timer ends: Correct
                      isPicked &&
                        isTimerEnded &&
                        result === true &&
                        "border-green-500 bg-green-50 text-success shadow-md",
                      // Revealed after timer ends: Incorrect
                      isPicked &&
                        isTimerEnded &&
                        result === false &&
                        "border-red-400 bg-red-50 text-danger shadow-md",
                      // Other unpicked options
                      isOther && "border-line opacity-40 cursor-not-allowed bg-slate-50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white transition-colors",
                        isPicked && isTimerEnded && result === true
                          ? "bg-success"
                          : isPicked && isTimerEnded && result === false
                            ? "bg-danger"
                            : "bg-primary",
                      )}
                    >
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className="flex-1 text-sm font-bold leading-snug">{option}</span>

                    {/* While timer is running: Lock badge only */}
                    {isPicked && !isTimerEnded && (
                      <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-extrabold text-primary">
                        <Lock className="h-3.5 w-3.5" />
                        <span>{locale === "ar" ? "مثبت" : "Locked"}</span>
                      </span>
                    )}

                    {/* Revealed after timer ends */}
                    {isPicked && isTimerEnded && result === true && (
                      <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                    )}
                    {isPicked && isTimerEnded && result === false && (
                      <XCircle className="h-5 w-5 text-danger shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
            {picked !== null && !isTimerEnded && (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary-tint/50 px-4 py-2.5 text-xs font-bold text-primary">
                <Lock className="h-4 w-4 shrink-0" />
                <span>
                  {locale === "ar"
                    ? "تم تسجيل إجابتك · انتظر انتهاء الوقت لمعرفة النتيجة..."
                    : "Answer locked · Results reveal when the timer ends..."}
                </span>
              </div>
            )}
            {picked !== null && isTimerEnded && (
              <p className="mt-4 text-center text-sm font-bold text-primary">
                {locale === "ar"
                  ? "انتهى الوقت · السؤال التالي سيبدأ تلقائياً"
                  : "Time's up · Next question starts automatically."}
              </p>
            )}
          </div>
        </Card>
      ) : (
        <Card className="card-pad bg-white/92 py-14 text-center shadow-xl shadow-primary/10">
          <Sparkles className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-4 text-2xl font-extrabold text-primary-deep">{clock?.ended ? "Quiz stopped" : "Waiting for the quiz…"}</h2>
          <p className="mt-2 text-sm text-ink-soft">Your score: {myPoints} points</p>
        </Card>
      )}
    </div>
  );
}

export default function QuizPage() {
  return <UserShell><Suspense fallback={<FullPageLoader />}><QuizInner /></Suspense></UserShell>;
}

