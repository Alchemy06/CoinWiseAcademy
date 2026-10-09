// Profile page — user stats, learning journey, badges, decision portrait
import { useI18n } from "../i18n/provider";

interface Badge {
  id: string;
  name: string;
  icon: string;
  earned: boolean;
  rule: string;
}

const BADGES: Badge[] = [
  { id: "b1", name: "First Lesson",     icon: "📖", earned: true,  rule: "Finish any lesson" },
  { id: "b2", name: "Steady Hand",      icon: "🛡️", earned: true,  rule: "Hold through a red-week scenario" },
  { id: "b3", name: "Pattern Spotter",  icon: "👁️", earned: true,  rule: "Identify 5 scam patterns" },
  { id: "b4", name: "Well Calibrated",  icon: "🎯", earned: false, rule: "Brier score below 0.15" },
  { id: "b5", name: "Historian",        icon: "📊", earned: false, rule: "Complete all crash cards" },
  { id: "b6", name: "Vocabulary",       icon: "📚", earned: false, rule: "Look up 25 terms" },
];

const RECENT_ACTIVITY = [
  { icon: "✓", tone: "var(--ds-success)", label: "Aced Quiz · Unit 1",           when: "2h ago" },
  { icon: "📈", tone: "var(--ds-brand)",  label: "Made BTC prediction · 70% up", when: "3h ago" },
  { icon: "🧭", tone: "var(--ds-brand)",  label: "Finished scenario · Steady",   when: "1d ago" },
  { icon: "📖", tone: "var(--ds-muted)",  label: "Lesson · Why prices swing",    when: "2d ago" },
];

const UNITS = [
  { name: "Unit 1 · Foundations",        pct: 100, color: "var(--ds-success)" },
  { name: "Unit 2 · Market forces",      pct:  50, color: "var(--ds-brand)"   },
  { name: "Unit 3 · Behavioural finance", pct:   0, color: "var(--ds-muted-2, #9096a4)" },
];

const DECISION_PORTRAIT = [
  { lbl: "Patience",     v: 78, positive: true  },
  { lbl: "Risk-managed", v: 64, positive: true  },
  { lbl: "FOMO",         v: 22, positive: false },
  { lbl: "Panic",        v: 18, positive: false },
];

function StatCard({ label, value, delta, sub }: { label: string; value: string; delta?: string; sub?: string }) {
  const isUp = delta && !delta.startsWith("-");
  return (
    <div className="ds-card">
      <div className="ds-stat-label">{label}</div>
      <div className="ds-stat-value ds-mt-2">{value}</div>
      {(delta || sub) && (
        <div className="ds-row ds-mt-2" style={{ fontSize: 12.5, gap: 8 }}>
          {delta && (
            <span className={`ds-stat-delta ${isUp ? "up" : "down"}`}>
              {isUp ? "▲" : "▼"} {delta.replace(/^-/, "")}
            </span>
          )}
          {sub && <span className="ds-text-muted">{sub}</span>}
        </div>
      )}
    </div>
  );
}

export function ProfilePage() {
  const { tx } = useI18n();
  return (
    <div className="ds-page ds-page-enter">
      {/* ── Header ── */}
      <div className="ds-page-header ds-between" style={{ alignItems: "flex-start" }}>
        <div className="ds-row" style={{ gap: 20 }}>
          <div
            className="ds-avatar"
            style={{ width: 72, height: 72, fontSize: 26, background: "linear-gradient(135deg, var(--ds-brand), #f59e0b)" }}
          >
            AR
          </div>
          <div>
            <span className="ds-pill ds-pill-brand ds-mb-2">Lvl 8 · Rank #5</span>
            <h1 className="ds-page-title" style={{ fontSize: 34 }}>Alex R.</h1>
            <p className="ds-text-muted">{tx("Joined 2 months ago · Honest about uncertainty.")}</p>
          </div>
        </div>
        <div className="ds-row" style={{ gap: 12, flexShrink: 0 }}>
          <button className="ds-btn ds-btn-ghost">⚙ {tx("Settings")}</button>
          <button className="ds-btn ds-btn-primary">{tx("Share profile")}</button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="ds-grid ds-grid-4 ds-mb-6">
        <StatCard label="Calibration"   value="0.81" delta="+0.03" sub="Top 12% of learners" />
        <StatCard label="XP earned"     value="3,180"              sub="Weekly avg 220" />
        <StatCard label="Current streak" value="12d"               sub="Longest 18d" />
        <StatCard label="Hit rate"       value="64%"               sub="17 predictions" />
      </div>

      {/* ── Main content ── */}
      <div className="ds-grid ds-grid-3" style={{ gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        {/* Left column */}
        <div className="ds-card ds-card-lg">
          <div className="ds-card-title">Learning journey</div>
          <div className="ds-card-sub">Progress across every unit.</div>

          <div className="ds-col ds-mt-3" style={{ gap: 16 }}>
            {UNITS.map(unit => (
              <div key={unit.name}>
                <div className="ds-between ds-mb-2">
                  <span style={{ fontWeight: 600, color: "var(--ds-ink)" }}>{unit.name}</span>
                  <span className="ds-text-sm ds-text-muted ds-num">{unit.pct}%</span>
                </div>
                <div className="ds-progress ds-progress-thick">
                  <div className="ds-progress-bar" style={{ width: unit.pct + "%", background: unit.color }} />
                </div>
              </div>
            ))}
          </div>

          <div className="ds-divider" />

          <div className="ds-card-title">Recent activity</div>
          <div className="ds-col ds-mt-3" style={{ gap: 8 }}>
            {RECENT_ACTIVITY.map((a, i) => (
              <div
                key={i}
                className="ds-between"
                style={{ padding: "10px 12px", background: "var(--ds-surface-2)", borderRadius: "var(--ds-radius-sm)" }}
              >
                <div className="ds-row" style={{ gap: 12 }}>
                  <span
                    className="ds-pill"
                    style={{ background: `color-mix(in oklab, ${a.tone} 14%, transparent)`, color: a.tone }}
                  >
                    {a.icon}
                  </span>
                  <span className="ds-text-sm" style={{ color: "var(--ds-ink)" }}>{a.label}</span>
                </div>
                <span className="ds-text-xs ds-text-muted">{a.when}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="ds-col" style={{ gap: 16 }}>
          {/* Badges */}
          <div className="ds-card">
            <div className="ds-card-title">Badges</div>
            <div className="ds-card-sub">3 of 6 earned</div>
            <div className="ds-grid ds-grid-3 ds-mt-3" style={{ gap: 10 }}>
              {BADGES.map(b => (
                <div
                  key={b.id}
                  title={b.rule}
                  style={{
                    textAlign: "center", padding: "14px 8px",
                    background: b.earned
                      ? "color-mix(in oklab, #f59e0b 12%, var(--ds-surface))"
                      : "var(--ds-surface-2)",
                    borderRadius: "var(--ds-radius)",
                    opacity: b.earned ? 1 : 0.6,
                    cursor: "default"
                  }}
                >
                  <div style={{
                    width: 36, height: 36, margin: "0 auto 8px", borderRadius: "50%",
                    background: b.earned ? "#f59e0b" : "var(--ds-muted-2, #9096a4)",
                    color: "white", display: "grid", placeItems: "center", fontSize: 18
                  }}>
                    {b.icon}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ds-ink)" }}>{b.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Decision portrait */}
          <div className="ds-card">
            <div className="ds-card-title">Decision portrait</div>
            <div className="ds-card-sub">Your style, across scenarios.</div>
            <div className="ds-col ds-mt-3 ds-text-sm" style={{ gap: 12 }}>
              {DECISION_PORTRAIT.map((r, i) => (
                <div key={i}>
                  <div className="ds-between ds-mb-1">
                    <span style={{ color: "var(--ds-ink)" }}>{r.lbl}</span>
                    <span className="ds-num ds-text-muted">{r.v}</span>
                  </div>
                  <div className="ds-progress">
                    <div
                      className="ds-progress-bar"
                      style={{
                        width: r.v + "%",
                        background: r.positive ? "var(--ds-success)" : "#cf202f"
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Calibration ring */}
          <div className="ds-card" style={{ textAlign: "center" }}>
            <div className="ds-card-title">Calibration score</div>
            <div className="ds-card-sub">Honesty meets accuracy.</div>
            <div style={{ position: "relative", width: 110, height: 110, margin: "8px auto 0" }}>
              <svg width="110" height="110" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="55" cy="55" r="46" fill="none" stroke="var(--ds-surface-2)" strokeWidth="9" />
                <circle cx="55" cy="55" r="46" fill="none" stroke="var(--ds-brand)" strokeWidth="9"
                  strokeDasharray={`${2 * Math.PI * 46}`}
                  strokeDashoffset={`${2 * Math.PI * 46 * (1 - 0.81)}`}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 0.6s" }} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 22, fontFamily: "var(--ds-font-display)", letterSpacing: "-0.02em", color: "var(--ds-ink)" }}>0.81</div>
                  <div style={{ fontSize: 10, color: "var(--ds-muted)", marginTop: -2, letterSpacing: "0.05em", textTransform: "uppercase" }}>score</div>
                </div>
              </div>
            </div>
            <p className="ds-text-sm ds-text-muted ds-mt-3" style={{ lineHeight: 1.5 }}>
              Top <strong style={{ color: "var(--ds-ink)" }}>12%</strong> of this week's learners.
              A 1.0 means perfectly honest confidence.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
