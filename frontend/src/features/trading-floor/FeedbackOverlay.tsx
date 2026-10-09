import { useEffect, useState } from "react";

interface FeedbackOverlayProps {
  balanceEffect: number;
  label: string;
  currency?: string;
  onDone: () => void;
}

function fmtCurrency(n: number, currency: string): string {
  return n.toLocaleString("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

export function FeedbackOverlay({
  balanceEffect,
  label,
  currency = "USD",
  onDone,
}: FeedbackOverlayProps) {
  const [visible, setVisible] = useState(true);
  const isPositive = balanceEffect > 0;
  const isNegative = balanceEffect < 0;

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      const exitTimer = setTimeout(onDone, 300);
      return () => clearTimeout(exitTimer);
    }, 1600);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      className={`tf-feedback-overlay ${isPositive ? "is-up" : ""} ${isNegative ? "is-down" : ""} ${!visible ? "is-fading" : ""}`}
      aria-live="polite"
    >
      {balanceEffect !== 0 && (
        <span className="tf-feedback-amount">
          {isPositive ? "+" : ""}
          {fmtCurrency(balanceEffect, currency)}
        </span>
      )}
      {label && <span className="tf-feedback-label">{label}</span>}
    </div>
  );
}
