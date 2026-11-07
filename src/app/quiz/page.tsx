"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, Sparkles, XCircle } from "lucide-react";
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

function QuizInner() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const [session, setSession] = useState<QuizSession | null>(null);
  const [questionState, setQuestionState] = useState<{ id: string; value: QuestionPublic } | null>(null);
  const [answerState, setAnswerState] = useState<{ questionKey: string; picked: number; result: boolean | null } | null>(null);
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
    if (!sessionId || !questionId || !questionKey || answerState?.questionKey === questionKey || clock?.ended) return;
    setAnswerState({ questionKey, picked: answerIndex, result: null });
    try {
      const response = await submitQuizAnswer({ sessionId, questionId, answerIndex });
      setAnswerState({ questionKey, picked: answerIndex, result: response.correct });
    } catch (cause) {
      setAnswerState(null);
      setError((cause as Error).message || t.errors.generic);
    }
  }, [sessionId, questionId, questionKey, answerState, clock?.ended, t.errors.generic]);

  const question = questionState && questionState.id === questionId ? questionState.value : null;
  const currentAnswer = answerState?.questionKey === questionKey ? answerState : null;
  const picked = currentAnswer?.picked ?? null;
  const result = currentAnswer?.result ?? null;

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
            <div className="flex items-center justify-between text-sm">
              <span className="font-extrabold text-primary">Round {clock.roundNumber} · Question {clock.questionIndex + 1} / {session.totalQuestions}</span>
              <span className="flex items-center gap-1 font-mono text-lg font-extrabold text-primary"><Clock3 className="h-4 w-4" />{clock.questionRemainingSec}s</span>
            </div>
            <h2 className="mt-5 text-2xl font-extrabold leading-tight text-primary-deep">{question.question}</h2>
            <div className="mt-6 grid gap-3">
              {question.options.map((option, index) => (
                <button key={`${index}-${option}`} disabled={picked !== null || clock.questionRemainingSec === 0} onClick={() => answer(index)} className={cn(
                  "flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 text-left font-bold transition",
                  picked === null && "border-primary/15 bg-white hover:border-primary hover:bg-primary-tint",
                  picked === index && result === true && "border-green-500 bg-green-50 text-success",
                  picked === index && result === false && "border-red-400 bg-red-50 text-danger",
                  picked !== null && picked !== index && "border-line opacity-45",
                )}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm text-white">{String.fromCharCode(65 + index)}</span>
                  <span className="flex-1">{option}</span>
                  {picked === index && result === true && <CheckCircle2 className="h-5 w-5" />}
                  {picked === index && result === false && <XCircle className="h-5 w-5" />}
                </button>
              ))}
            </div>
            {picked !== null && <p className="mt-4 text-center text-sm font-bold text-primary">Answer locked — next question starts automatically.</p>}
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
