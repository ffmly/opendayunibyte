"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Database, ExternalLink, Play, Plus, Search, Square, TimerReset, Trash2 } from "lucide-react";
import { call } from "@/lib/supabase/callable";
import type { QuizQuestion, QuizSession } from "@shared/models";
import { getQuizClock } from "@/lib/quiz/timing";
import { Button } from "@/components/ui/button";

type AdminQuestion = QuizQuestion & { id: string };

const emptyDraft = {
  question: "",
  options: ["", "", "", ""],
  correctAnswer: 0,
  points: 100,
  category: "General tech",
};

export default function AdminQuizPage() {
  const [session, setSession] = useState<(QuizSession & { id: string }) | null>(null);
  const [message, setMessage] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [showQuestions, setShowQuestions] = useState(false);
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = await call<unknown, { sessions: Array<QuizSession & { id: string }> }>("adminQuizState");
      if (!cancelled) setSession(result.sessions.find((item) => item.status !== "ended" && !getQuizClock(item).ended) ?? null);
    };
    void load();
    const timer = window.setInterval(load, 1_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const clock = useMemo(() => (session ? getQuizClock(session, now) : null), [session, now]);
  const filteredQuestions = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return questions;
    return questions.filter((question) =>
      [question.question, question.category, ...question.options]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(term)),
    );
  }, [questions, search]);

  async function run(name: "adminCreateQuizSession" | "adminEndQuizSession", data: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage({});
    try {
      const result = await call<Record<string, unknown>, { bankSize?: number }>(name, data);
      setMessage({
        ok: name === "adminCreateQuizSession"
          ? `Quiz started with ${result.bankSize ?? "the full"} unique questions. No repeats until the bank is complete.`
          : "Quiz stopped.",
      });
    } catch (cause) {
      setMessage({ err: (cause as Error).message || "Failed" });
    } finally {
      setBusy(false);
    }
  }

  async function loadQuestions() {
    setQuestionsLoading(true);
    setMessage({});
    try {
      const result = await call<unknown, { questions: AdminQuestion[]; count: number }>("adminListQuizQuestions");
      setQuestions(result.questions);
    } catch (cause) {
      setMessage({ err: (cause as Error).message || "Could not load questions." });
    } finally {
      setQuestionsLoading(false);
    }
  }

  async function toggleQuestions() {
    const next = !showQuestions;
    setShowQuestions(next);
    if (next && questions.length === 0) await loadQuestions();
  }

  async function addQuestion(event: FormEvent) {
    event.preventDefault();
    setAdding(true);
    setMessage({});
    try {
      const created = await call<typeof draft, AdminQuestion>("adminCreateQuizQuestion", draft);
      setQuestions((current) => [...current, created].sort((a, b) => a.question.localeCompare(b.question)));
      setDraft({ ...emptyDraft, options: ["", "", "", ""] });
      setMessage({ ok: "Question added to the active bank." });
    } catch (cause) {
      setMessage({ err: (cause as Error).message || "Could not add the question." });
    } finally {
      setAdding(false);
    }
  }

  async function deleteQuestion(question: AdminQuestion) {
    if (!window.confirm(`Delete “${question.question}”?`)) return;
    setDeletingId(question.id);
    setMessage({});
    try {
      await call("adminDeleteQuizQuestion", { questionId: question.id });
      setQuestions((current) => current.filter((item) => item.id !== question.id));
      setMessage({ ok: "Question deleted." });
    } catch (cause) {
      setMessage({ err: (cause as Error).message || "Could not delete the question." });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Automatic mode</p>
          <h1 className="text-3xl font-extrabold text-ink">Quiz Control</h1>
          <p className="mt-1 text-sm text-ink-soft">10 questions · 30 seconds each · continuous 5-minute rounds</p>
        </div>
        <a href="/quiz/screen" target="_blank" className="btn btn-outline btn-md">
          Open TV screen <ExternalLink className="h-4 w-4" />
        </a>
      </header>

      {message.ok && <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-success">{message.ok}</p>}
      {message.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-danger">{message.err}</p>}

      {session && clock ? (
        <section className="rounded-3xl border border-primary/15 bg-white p-6 shadow-lg shadow-primary/5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-primary">Round {clock.roundNumber} in progress</p>
              <p className="mt-1 text-4xl font-extrabold text-primary-deep">Question {clock.questionIndex + 1} / {session.questionsPerRound ?? session.totalQuestions}</p>
              <p className="mt-2 text-xs font-semibold text-ink-soft">Unique bank progress {clock.bankQuestionIndex + 1} / {clock.bankSize} · shuffle cycle {clock.bankCycle + 1}</p>
            </div>
            <div className="rounded-2xl bg-primary px-6 py-4 text-center text-white">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Next question</p>
              <p className="font-mono text-4xl font-extrabold">{clock.questionRemainingSec}s</p>
            </div>
          </div>
          <div className="mt-6 h-3 overflow-hidden rounded-full bg-primary-tint">
            <div className="h-full bg-primary transition-[width]" style={{ width: `${((300 - clock.roundRemainingSec) / 300) * 100}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs font-semibold text-ink-soft">
            <span className="flex items-center gap-1"><TimerReset className="h-4 w-4" /> Every bank question appears before a reshuffle</span>
            <span>{Math.floor(clock.roundRemainingSec / 60)}:{String(clock.roundRemainingSec % 60).padStart(2, "0")} remaining</span>
          </div>
          <Button variant="danger" className="mt-6" loading={busy} onClick={() => run("adminEndQuizSession", { sessionId: session.id })}>
            <Square className="h-4 w-4" /> Stop quiz
          </Button>
        </section>
      ) : (
        <section className="rounded-3xl border border-primary/15 bg-white p-8 text-center shadow-lg shadow-primary/5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-tint text-primary"><Play className="h-7 w-7" /></div>
          <h2 className="mt-4 text-2xl font-extrabold text-ink">Ready to start the quiz</h2>
          <p className="mt-2 text-sm text-ink-soft">The full active question bank is shuffled. Nothing repeats until every question has appeared.</p>
          <Button className="mt-5" loading={busy} onClick={() => run("adminCreateQuizSession")}><Play className="h-4 w-4" /> Start continuous quiz</Button>
        </section>
      )}

      <section className="overflow-hidden rounded-3xl border border-primary/15 bg-white shadow-lg shadow-primary/5">
        <button type="button" onClick={toggleQuestions} className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-primary-tint/40" aria-expanded={showQuestions}>
          <span className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-tint text-primary"><Database className="h-5 w-5" /></span>
            <span>
              <span className="block font-extrabold text-ink">Question bank</span>
              <span className="block text-sm text-ink-soft">View, search, add or delete questions</span>
            </span>
          </span>
          <span className="flex items-center gap-2 text-sm font-bold text-primary">
            {questions.length > 0 && `${questions.length} questions`}
            {showQuestions ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </span>
        </button>

        {showQuestions && (
          <div className="space-y-5 border-t border-line p-5">
            <form onSubmit={addQuestion} className="space-y-4 rounded-2xl border border-primary/15 bg-primary-tint/35 p-4">
              <div>
                <p className="font-extrabold text-ink">Add a new question</p>
                <p className="text-xs text-ink-soft">It will be available the next time you start the quiz.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                <div>
                  <label className="label" htmlFor="question">Question</label>
                  <input id="question" className="input" value={draft.question} onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))} required minLength={5} maxLength={240} />
                </div>
                <div>
                  <label className="label" htmlFor="category">Category</label>
                  <input id="category" className="input" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} maxLength={60} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {draft.options.map((option, index) => (
                  <div key={index}>
                    <label className="label" htmlFor={`option-${index}`}>Option {String.fromCharCode(65 + index)}</label>
                    <input id={`option-${index}`} className="input" value={option} onChange={(event) => setDraft((current) => ({ ...current, options: current.options.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} required maxLength={120} />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="label" htmlFor="correct-answer">Correct answer</label>
                  <select id="correct-answer" className="input min-w-40" value={draft.correctAnswer} onChange={(event) => setDraft((current) => ({ ...current, correctAnswer: Number(event.target.value) }))}>
                    {draft.options.map((_, index) => <option key={index} value={index}>Option {String.fromCharCode(65 + index)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="points">Points</label>
                  <input id="points" type="number" min={1} max={1000} className="input w-28" value={draft.points} onChange={(event) => setDraft((current) => ({ ...current, points: Number(event.target.value) }))} />
                </div>
                <Button type="submit" loading={adding}><Plus className="h-4 w-4" /> Add question</Button>
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="relative min-w-64 flex-1" htmlFor="question-search">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
                <input id="question-search" className="input pl-10" placeholder="Search questions, answers or categories…" value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
              <span className="text-sm font-bold text-primary">{filteredQuestions.length} of {questions.length}</span>
            </div>

            {questionsLoading ? (
              <p className="py-10 text-center text-sm text-ink-soft">Loading question bank…</p>
            ) : (
              <div className="max-h-[720px] space-y-2 overflow-y-auto pr-1">
                {filteredQuestions.map((question, index) => (
                  <article key={question.id} className="flex items-start gap-3 rounded-2xl border border-line p-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-xs font-extrabold text-primary">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-ink">{question.question}</h3>
                        {question.category && <span className="rounded-full bg-primary-tint px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">{question.category}</span>}
                      </div>
                      <p className="mt-1 text-xs text-ink-soft">Correct: {String.fromCharCode(65 + question.correctAnswer)} — {question.options[question.correctAnswer]} · {question.points} pts</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" disabled={Boolean(session)} loading={deletingId === question.id} onClick={() => deleteQuestion(question)} title={session ? "Stop the quiz before deleting questions" : "Delete question"} aria-label={`Delete ${question.question}`}>
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  </article>
                ))}
                {filteredQuestions.length === 0 && <p className="py-10 text-center text-sm text-ink-soft">No questions match your search.</p>}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
