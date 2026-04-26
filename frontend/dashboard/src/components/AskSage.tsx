'use client';

import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { askSage } from '@/lib/api';
import type { AskSageAnswer } from '@/lib/fixtures';

const SUGGESTIONS = [
  'How has her word-finding changed this month?',
  'Was today different from her baseline?',
  'How many sessions this week looked concerning?',
  "What changed in today's session compared to the last three?",
];

export function AskSage() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<AskSageAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const a = await askSage(q);
      setAnswer(a);
      setQuestion(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sage couldn\'t answer that just now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <header className="fade-up flex flex-col gap-2">
        <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
          ask sage
        </span>
        <h1
          className="serif text-[40px] leading-tight tracking-[-0.01em]"
          style={{ color: 'var(--color-ink)', fontWeight: 500 }}
        >
          Ask anything about Eleanor's sessions.
        </h1>
        <p className="serif text-[16px] italic text-[var(--color-ink-soft)]">
          Plain English. We translate, query Snowflake, and answer.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
        className="fade-up flex flex-col gap-3"
      >
        <div
          className="flex items-baseline gap-3 px-1 py-2"
          style={{ borderBottom: '1px solid var(--color-line)' }}
        >
          <span className="serif text-[20px] italic text-[var(--color-amber)]">·</span>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What changed in today's session compared to the last three?"
            disabled={loading}
            className="flex-1 bg-transparent outline-none placeholder:italic"
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 22,
              color: 'var(--color-ink)',
            }}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="rounded-full px-4 py-1.5 text-[12px] tracking-wide transition-opacity disabled:opacity-40"
            style={{
              background: 'var(--color-amber)',
              color: 'var(--color-surface)',
            }}
          >
            {loading ? 'thinking…' : 'ask'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              className="rounded-full px-3 py-1.5 text-[12px] tracking-wide transition-colors hover:bg-[color-mix(in_oklab,var(--color-amber-glow)_24%,transparent)]"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-ink-soft)',
                border: '1px solid var(--color-line)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </form>

      <div>
        {loading && <AnswerSkeleton />}
        {!loading && error && <AnswerError message={error} />}
        {!loading && !error && answer && <AnswerCard answer={answer} />}
      </div>
    </div>
  );
}

function AnswerCard({ answer }: { answer: AskSageAnswer }) {
  return (
    <article
      className="fade-up flex flex-col gap-6 rounded-2xl px-8 py-7"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-line)',
      }}
    >
      <div className="flex flex-col gap-2">
        <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
          answer
        </span>
        <p
          className="serif text-[20px] leading-[1.55]"
          style={{ color: 'var(--color-ink)' }}
        >
          {answer.answer_text}
        </p>
      </div>

      {answer.rows.length > 0 && (
        <div className="-ml-2 h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={answer.rows} margin={{ top: 12, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="0" vertical={false} opacity={0.5} />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'var(--color-ink-faint)' }}
              />
              <YAxis hide domain={[0, 'dataMax + 10']} />
              <Tooltip
                cursor={{ fill: 'color-mix(in oklab, var(--color-amber-glow) 22%, transparent)' }}
                contentStyle={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-line)',
                  borderRadius: 10,
                  padding: '6px 10px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  color: 'var(--color-ink)',
                  boxShadow: '0 12px 28px -12px rgba(0,0,0,0.12)',
                }}
              />
              <Bar
                dataKey="score"
                fill="var(--color-amber)"
                radius={[6, 6, 0, 0]}
                maxBarSize={42}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <details
        className="rounded-lg px-4 py-3"
        style={{
          background: 'color-mix(in oklab, var(--color-bg) 70%, transparent)',
          border: '1px solid var(--color-line)',
        }}
      >
        <summary className="cursor-pointer text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)]">
          show generated SQL
        </summary>
        <pre
          className="mt-3 overflow-x-auto whitespace-pre-wrap text-[12px] leading-[1.55]"
          style={{
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-ink-soft)',
          }}
        >
          {answer.sql}
        </pre>
      </details>
    </article>
  );
}

function AnswerSkeleton() {
  return (
    <article
      className="flex flex-col gap-5 rounded-2xl px-8 py-7"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-line)',
      }}
    >
      <div className="skeleton h-3 w-24" />
      <div className="flex flex-col gap-2">
        <div className="skeleton h-5 w-full" />
        <div className="skeleton h-5 w-11/12" />
        <div className="skeleton h-5 w-2/3" />
      </div>
      <div className="skeleton h-[160px] w-full" />
    </article>
  );
}

function AnswerError({ message }: { message: string }) {
  return (
    <article
      className="rounded-xl px-6 py-4"
      style={{
        background: 'color-mix(in oklab, var(--color-clay) 8%, var(--color-surface))',
        border: '1px solid color-mix(in oklab, var(--color-clay) 24%, transparent)',
      }}
    >
      <p className="text-[14px] text-[var(--color-clay)]">{message}</p>
    </article>
  );
}
