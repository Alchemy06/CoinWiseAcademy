import { useEffect, useState } from "react";
import type { LeaderboardEntry } from "../../types/trading";
import { fetchLeaderboard } from "../../utils/tradingFloor";

export function TradingFloorLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLeaderboard()
      .then((data) => {
        if (!cancelled) {
          setEntries(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load leaderboard");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  if (loading) return <div className="tf-lb-placeholder">Loading leaderboard…</div>;
  if (error) return <div className="tf-lb-placeholder tf-lb-placeholder--error">{error}</div>;
  if (!entries.length)
    return <div className="tf-lb-placeholder">No scores yet — be the first to play!</div>;

  return (
    <div className="tf-leaderboard">
      <h3 className="tf-leaderboard-title">🏆 Leaderboard</h3>
      <table className="tf-lb-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Trader</th>
            <th>Total P&amp;L</th>
            <th>Runs</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const pnl = parseFloat(e.total_pnl);
            const isPositive = pnl >= 0;
            return (
              <tr key={e.rank} className={e.rank === 1 ? "tf-lb-row--gold" : ""}>
                <td className="tf-lb-rank">
                  {e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : e.rank}
                </td>
                <td className="tf-lb-name">{e.display_name}</td>
                <td className={`tf-lb-pnl ${isPositive ? "is-up" : "is-down"}`}>
                  {isPositive ? "+" : ""}
                  {fmt(pnl)}
                </td>
                <td className="tf-lb-runs">{e.scenarios_completed}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
