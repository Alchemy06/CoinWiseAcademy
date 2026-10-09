import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n/provider";
import { type DashboardData, fetchDashboard } from "../utils/dashboard";

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">{label}</span>
      <span className="text-3xl font-bold text-[var(--color-text)]">{value}</span>
      {sub && <span className="text-xs text-[var(--color-text-muted)]">{sub}</span>}
    </div>
  );
}

function ProgressBar({ value, max, color = "bg-blue-500" }: { value: number; max: number; color?: string }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-[var(--color-text-muted)] mb-1">
        <span>{value} passed</span>
        <span>{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--color-border)]">
        <div
          className={`h-2 rounded-full transition-all ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-[var(--color-text-muted)] mt-1">{max} total quizzes</p>
    </div>
  );
}

function levelColor(level: string) {
  if (level === "intermediate") return "bg-amber-400";
  if (level === "advanced") return "bg-red-500";
  return "bg-green-500";
}

function levelLabel(level: string) {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function DashboardPage() {
  const { formatDate, tx } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : tx("Something went wrong."));
      })
      .finally(() => setIsLoading(false));
  }, [tx]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--color-text-muted)]">
        {tx("Loading dashboard...")}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500">
        {error ?? tx("Failed to load dashboard.")}
      </div>
    );
  }

  const passRate = data.quizzesAttempted > 0
    ? Math.round((data.quizzesPassed / data.quizzesAttempted) * 100)
    : 0;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-8">
      <div>
        <Link className="dashboard-home-link" to="/">
          <svg aria-hidden="true" viewBox="0 0 20 20">
            <path
              d="M9 4 3 10l6 6M4 10h13"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
          {tx("Back to home")}
        </Link>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">{tx("Your Dashboard")}</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {tx("Track your quiz progress and learning activity.")}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label={tx("Quizzes Passed")}
          value={`${data.quizzesPassed}/${data.quizzesAttempted}`}
          sub={tx("{rate}% pass rate", { rate: passRate })}
        />
        <StatCard
          label={tx("Avg Score")}
          value={data.averageScore}
          sub={tx("points per quiz")}
        />
        <StatCard
          label={tx("Accuracy")}
          value={`${data.accuracyPercent}%`}
          sub={tx("{correct} of {total} correct", {
            correct: data.correctAnswers,
            total: data.totalQuestionsAnswered
          })}
        />
        <StatCard
          label={tx("Lessons Done")}
          value={data.lessonsCompleted}
          sub={tx("units completed")}
        />
      </div>

      {/* Level breakdown */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--color-text-muted)] mb-4">
          {tx("Progress by Level")}
        </h2>
        <div className="flex flex-col gap-5">
          {(["beginner", "intermediate", "advanced"] as const).map((level) => (
            <div key={level} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${levelColor(level)}`} />
                <span className="text-sm font-bold text-[var(--color-text)]">
                  {levelLabel(level)}
                </span>
              </div>
              <ProgressBar
                value={data.levelBreakdown[level].passed}
                max={data.levelBreakdown[level].attempted}
                color={levelColor(level)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Recent attempts */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <h2 className="text-sm font-bold text-[var(--color-text-muted)] mb-4">
          {tx("Recent Attempts")}
        </h2>
        {data.recentAttempts.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{tx("No quizzes attempted yet.")}</p>
        ) : (
          <div className="flex flex-col divide-y divide-[var(--color-border)]">
            {data.recentAttempts.map((attempt, i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-[var(--color-text)]">
                    {attempt.quizTitle}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {levelLabel(attempt.level)} · {formatDate(attempt.completedAt, {
                      day: "numeric",
                      month: "short",
                      year: "numeric"
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[var(--color-text-muted)]">
                    {attempt.score}/{attempt.passMark} pass mark
                  </span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      attempt.passed
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    {attempt.passed ? tx("Passed") : tx("Failed")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
