/**
 * PriceStrip.tsx — Prominent price display for the COVID Crash scenario.
 *
 * Shows:
 *   • Current BTC/GBP price (large)
 *   • Change from the start of this round's candles (%)
 *   • Mini SVG sparkline of close prices across the current round
 */

import type { CrashRound } from "../../../types/covidCrash";
import { formatGBP } from "../lib/format";
import { useI18n } from "../../../i18n/provider";

// ── Mini sparkline ────────────────────────────────────────────────────────────

function Sparkline({ closes, isUp }: { closes: number[]; isUp: boolean }) {
  if (closes.length < 2) return null;

  const W = 100;
  const H = 36;
  const PAD = 3;

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = (max - min) || (min * 0.001) || 1;

  const points = closes
    .map((v, i) => {
      const x = PAD + (i / (closes.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const color = isUp ? "#0ECB81" : "#E8354A";

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last price dot */}
      {(() => {
        const lastIdx = closes.length - 1;
        const lx = PAD + (lastIdx / (closes.length - 1)) * (W - PAD * 2);
        const ly = H - PAD - ((closes[lastIdx] - min) / range) * (H - PAD * 2);
        return <circle cx={lx} cy={ly} r="3" fill={color} />;
      })()}
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PriceStripProps {
  currentRound: CrashRound;
}

export function PriceStrip({ currentRound }: PriceStripProps) {
  const { tx } = useI18n();
  const { price_pence, candles } = currentRound;

  // Compute change across this round's candles (first open → last close)
  let changePct: number | null = null;
  let isUp = true;
  const closes = candles.map((c) => c.c);

  if (candles.length >= 2) {
    const first = candles[0].o;
    const last  = candles[candles.length - 1].c;
    changePct   = ((last - first) / first) * 100;
    isUp        = changePct >= 0;
  }

  const changeStr =
    changePct !== null
      ? `${isUp ? "+" : ""}${changePct.toFixed(1)}%`
      : null;

  return (
    <div className="cc-price-strip">
      {/* Left: asset identity */}
      <div className="cc-price-strip-asset">
        <span className="cc-price-strip-icon" aria-hidden="true">₿</span>
        <div className="cc-price-strip-names">
          <span className="cc-price-strip-pair">BTC/GBP</span>
          <span className="cc-price-strip-full">{tx("Bitcoin · British Pound")}</span>
        </div>
      </div>

      {/* Centre: current price */}
      <div className="cc-price-strip-main">
        <span className="cc-price-strip-value">{formatGBP(price_pence)}</span>
        {changeStr && (
          <span className={`cc-price-strip-change ${isUp ? "is-up" : "is-down"}`}>
            {isUp ? "▲" : "▼"} {tx("{change} this round", { change: changeStr })}
          </span>
        )}
      </div>

      {/* Right: sparkline */}
      {closes.length >= 2 && (
        <div className="cc-price-strip-right">
          <Sparkline closes={closes} isUp={isUp} />
        </div>
      )}
    </div>
  );
}
