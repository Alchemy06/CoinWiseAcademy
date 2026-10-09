import type { ScenarioNode } from "../../types/trading";

interface PriceStripProps {
  node: ScenarioNode;
  volatilityProfile?: string;
  currency: string;
}

function Sparkline({ data, isUp }: { data: number[]; isUp: boolean }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 34;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const color = isUp ? "#00C896" : "#E8354A";

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function fmt(n: number, currency: string) {
  return n.toLocaleString("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PriceStrip({ node, volatilityProfile = "normal", currency }: PriceStripProps) {
  const data = node.historical_price_data;

  // historical_price_data stores prices in pence (e.g. 4290000 = £42,900).
  // Divide by 100 to get the GBP display value.
  const currentPriceGbp = data.length > 0 ? data[data.length - 1] / 100 : 0;

  // Period change across the node's full price history (first → last entry).
  // The "24h" label is a convention — the actual period matches the scenario node.
  let changePct: number;
  if (data.length >= 2) {
    changePct = ((data[data.length - 1] - data[0]) / data[0]) * 100;
  } else if (volatilityProfile === "euphoric") {
    changePct = 12.4;
  } else if (volatilityProfile === "crash") {
    changePct = -8.5;
  } else {
    changePct = 1.2;
  }

  const isUp = changePct >= 0;
  const changeStr = `${isUp ? "+" : ""}${changePct.toFixed(1)}%`;

  return (
    <div className="tf-price-strip">
      {/* Asset info */}
      <div className="tf-price-asset">
        <div className="tf-price-asset-icon" aria-hidden="true">₿</div>
        <div className="tf-price-asset-names">
          <span className="tf-price-asset-pair">BTC/{currency}</span>
          <span className="tf-price-asset-full">Bitcoin / {currency === "GBP" ? "British Pound" : currency}</span>
        </div>
      </div>

      {/* Current price */}
      <div className="tf-price-main">
        <span className="tf-price-value">
          {currentPriceGbp > 0 ? fmt(currentPriceGbp, currency) : "—"}
        </span>
      </div>

      {/* Period change + sparkline */}
      <div className="tf-price-right">
        <span className={`tf-price-change ${isUp ? "is-up" : "is-down"}`}>{changeStr}</span>
        <span className="tf-price-period">24h</span>
        {/* Sparkline uses raw pence values — shape is identical since we normalise min/max */}
        <Sparkline data={data} isUp={isUp} />
      </div>
    </div>
  );
}

/**
 * Return the current BTC price for a node in GBP (not pence).
 * historical_price_data stores pence integers; this helper divides by 100
 * so callers can use the value directly for display and BTC amount calculations.
 */
export function getCurrentPrice(node: ScenarioNode): number {
  const data = node.historical_price_data;
  return data.length > 0 ? data[data.length - 1] / 100 : 0;
}
