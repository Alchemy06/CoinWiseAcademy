import { useMemo, useState } from "react";
import { IconTrophy, IconFlame } from "../components/icons";
import { useI18n } from "../i18n/provider";

// ─── Data ───────────────────────────────────────────────────

interface LeaderboardEntry {
  name: string;
  xp: number;
  cal: number;
  streak: number;
  lvl: number;
  you: boolean;
}

const LEADERBOARD: LeaderboardEntry[] = [
  { name: "Imani R.",    xp: 4820, cal: 0.91, streak: 31, lvl: 12, you: false },
  { name: "Teo H.",      xp: 4412, cal: 0.88, streak: 22, lvl: 11, you: false },
  { name: "Priya J.",    xp: 4050, cal: 0.86, streak: 19, lvl: 10, you: false },
  { name: "Lars A.",     xp: 3640, cal: 0.83, streak: 14, lvl:  9, you: false },
  { name: "You",         xp: 3180, cal: 0.81, streak: 12, lvl:  8, you: true  },
  { name: "Nadia K.",    xp: 2970, cal: 0.78, streak:  9, lvl:  8, you: false },
  { name: "Marco P.",    xp: 2640, cal: 0.76, streak:  7, lvl:  7, you: false },
  { name: "Ana T.",      xp: 2310, cal: 0.74, streak:  5, lvl:  7, you: false },
  { name: "Yusuf D.",    xp: 2080, cal: 0.71, streak:  4, lvl:  6, you: false },
  { name: "Siobhan M.",  xp: 1870, cal: 0.69, streak:  3, lvl:  6, you: false },
];

type SortMode = "cal" | "xp" | "streak";

function initials(name: string): string {
  return name.split(" ").map(s => s[0]).join("").toUpperCase();
}

export function LeaderboardPage() {
  const { tx } = useI18n();
  const [mode, setMode] = useState<SortMode>("cal");

  const sorted = useMemo(() => {
    const copy = [...LEADERBOARD];
    if (mode === "xp") copy.sort((a, b) => b.xp - a.xp);
    else if (mode === "cal") copy.sort((a, b) => b.cal - a.cal);
    else copy.sort((a, b) => b.streak - a.streak);
    return copy.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [mode]);

  const top3 = sorted.slice(0, 3);
  const podiumMedals = ["🥇", "🥈", "🥉"];
  const podiumOrder = [1, 0, 2]; // center gold, left silver, right bronze

  return (
    <div className="ds-page ds-page-enter">
      {/* ── Header ── */}
      <div className="ds-page-header">
        <span className="ds-pill ds-pill-brand" style={{ marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <IconTrophy size={13} stroke={1.7} /> {tx("Rewarding learning, not luck")}
        </span>
        <h1 className="ds-page-title ds-mt-3">{tx("Leaderboard")}</h1>
        <p className="ds-page-sub">{tx("We rank by calibration first. Not who made money — who made honest calls.")}</p>
      </div>

      {/* ── Sort tabs ── */}
      <div className="ds-between ds-mb-6">
        <div className="ds-tabs">
          <button className={`ds-tab ${mode === "cal" ? "active" : ""}`} onClick={() => setMode("cal")}>{tx("Calibration")}</button>
          <button className={`ds-tab ${mode === "xp" ? "active" : ""}`} onClick={() => setMode("xp")}>XP</button>
          <button className={`ds-tab ${mode === "streak" ? "active" : ""}`} onClick={() => setMode("streak")}>{tx("Streak")}</button>
        </div>
        <span className="ds-text-sm ds-text-muted">{tx("Updated 6 min ago · weekly reset")}</span>
      </div>

      {/* ── Podium ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
        {podiumOrder.map(idx => {
          const r = top3[idx];
          if (!r) return null;
          const isGold = idx === 0;
          const bgGrad = isGold
            ? "linear-gradient(135deg, #f59e0b, #0052ff)"
            : idx === 1
              ? "linear-gradient(135deg, #9ca3af, #6b7280)"
              : "linear-gradient(135deg, #d97706, #92400e)";
          const borderColor = isGold ? "#f59e0b" : idx === 1 ? "#9ca3af" : "#d97706";
          return (
            <div
              key={r.name}
              className="ds-card ds-card-lg"
              style={{
                textAlign: "center",
                transform: isGold ? "translateY(-10px)" : undefined,
                borderTop: `3px solid ${borderColor}`,
                paddingTop: 24
              }}
            >
              <div style={{
                width: 64, height: 64, margin: "0 auto",
                borderRadius: "50%", background: bgGrad,
                display: "grid", placeItems: "center",
                color: "white", fontWeight: 800, fontSize: 22,
                fontFamily: "var(--ds-font-display)"
              }}>
                {initials(r.name)}
              </div>
              <h3 style={{ marginTop: 12, marginBottom: 0, fontFamily: "var(--ds-font-display)", color: "var(--ds-ink)", fontSize: 17 }}>
                {podiumMedals[idx]} {r.name}
              </h3>
              <div className="ds-row ds-mt-3" style={{ justifyContent: "center", color: "var(--ds-muted)", fontSize: 13, gap: 8 }}>
                <span>Cal {r.cal.toFixed(2)}</span>
                <span>·</span>
                <span className="ds-num">{r.xp.toLocaleString()} XP</span>
              </div>
              <div className="ds-row ds-mt-3" style={{ justifyContent: "center", flexWrap: "wrap", gap: 6 }}>
                <span className="ds-pill ds-pill-muted">Lvl {r.lvl}</span>
                <span className="ds-pill ds-pill-warn" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <IconFlame size={12} stroke={1.8} /> {r.streak}d
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Full table ── */}
      <div className="ds-card ds-card-flush">
        <table className="ds-tbl">
          <thead>
            <tr>
              <th style={{ width: 48 }}>#</th>
              <th>Learner</th>
              <th>Level</th>
              <th className="text-right">Calibration</th>
              <th className="text-right">XP</th>
              <th className="text-right">Streak</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.name} style={{ background: r.you ? "var(--ds-brand-soft)" : undefined }}>
                <td style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--ds-ink)" }}>
                  {r.rank <= 3 ? podiumMedals[r.rank - 1] : r.rank}
                </td>
                <td>
                  <div className="ds-row" style={{ gap: 12 }}>
                    <div
                      className="ds-avatar"
                      style={{
                        width: 32, height: 32, fontSize: 12,
                        background: r.you
                          ? "var(--ds-brand)"
                          : "linear-gradient(135deg, var(--ds-brand), #f59e0b)"
                      }}
                    >
                      {initials(r.name)}
                    </div>
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--ds-ink)" }}>{r.name}</span>
                      {r.you && (
                        <span className="ds-pill ds-pill-brand" style={{ marginLeft: 8, fontSize: 10.5 }}>You</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="ds-text-muted">Lvl {r.lvl}</td>
                <td className="text-right ds-num" style={{ fontWeight: 600, color: "var(--ds-ink)" }}>{r.cal.toFixed(2)}</td>
                <td className="text-right ds-num" style={{ color: "var(--ds-ink)" }}>{r.xp.toLocaleString()}</td>
                <td className="text-right ds-num" style={{ color: "var(--ds-muted)" }}>{r.streak}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Calibration explainer ── */}
      <div className="ds-card ds-card-lg ds-mt-6" style={{ background: "linear-gradient(135deg, var(--ds-brand-soft), var(--ds-surface))" }}>
        <div className="ds-between">
          <div>
            <h3 style={{ margin: 0, fontFamily: "var(--ds-font-display)", color: "var(--ds-ink)", fontSize: 18 }}>Why calibration, not profit?</h3>
            <p className="ds-text-muted ds-text-sm ds-mt-2" style={{ maxWidth: 560, lineHeight: 1.55 }}>
              Profit rewards luck as much as skill. Calibration rewards <em>honesty</em> — being 70% confident when you're right 70% of the time.
              It's harder to fake, and it's what separates good forecasters from gamblers.
            </p>
          </div>
          <div className="ds-col" style={{ gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
            <div className="ds-stat" style={{ textAlign: "right" }}>
              <div className="ds-stat-label">Perfect score</div>
              <div className="ds-stat-value" style={{ fontSize: 22, color: "var(--ds-success)" }}>1.00</div>
            </div>
            <div className="ds-stat" style={{ textAlign: "right" }}>
              <div className="ds-stat-label">Your score</div>
              <div className="ds-stat-value" style={{ fontSize: 22, color: "var(--ds-brand)" }}>0.81</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
