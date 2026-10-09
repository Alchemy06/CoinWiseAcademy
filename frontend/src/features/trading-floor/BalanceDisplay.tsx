interface BalanceDisplayProps {
  balance: number;
  initialBalance: number;
  currency?: string;
  label?: string;
}

function fmtCurrency(n: number, currency: string): string {
  return n.toLocaleString("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

export function BalanceDisplay({
  balance,
  initialBalance,
  currency = "USD",
  label,
}: BalanceDisplayProps) {
  const pnl = balance - initialBalance;
  const pnlPct = initialBalance > 0 ? (pnl / initialBalance) * 100 : 0;
  const isPositive = pnl > 0;
  const isNegative = pnl < 0;

  return (
    <div className="tf-balance">
      <span className="tf-balance-label">{label ?? "Portfolio"}</span>
      <span className="tf-balance-value">{fmtCurrency(balance, currency)}</span>
      {pnl !== 0 && (
        <span
          className={`tf-balance-pnl ${isPositive ? "is-up" : ""} ${isNegative ? "is-down" : ""}`}
        >
          {isPositive ? "▲" : "▼"} {fmtCurrency(Math.abs(pnl), currency)} (
          {isPositive ? "+" : ""}
          {pnlPct.toFixed(1)}%)
        </span>
      )}
    </div>
  );
}
