import { useEffect, useState } from "react";

const PEAK_2021 = 53300;
const CRASH_LOW_2022 = 15300;

export function LiveContextStrip() {
  const [livePrice, setLivePrice] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/predictions/live-price/?asset=BTC", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.price === "number") {
          setLivePrice(data.price);
        }
      } catch {}
    };
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const displayPrice = livePrice ?? PEAK_2021;
  const aboveLow = Math.round(((displayPrice - CRASH_LOW_2022) / CRASH_LOW_2022) * 100);
  const isLive = livePrice !== null;

  return (
    <div className="ct-context-strip">
      <div className="ct-ctx-item">
        <span className="ct-ctx-label">BTC today</span>
        <span className={`ct-ctx-value ${isLive ? "is-live" : ""}`}>
          {isLive && <span className="ct-live-dot" aria-hidden="true" />}
          £{displayPrice.toLocaleString("en-GB")}
        </span>
      </div>
      <div className="ct-ctx-divider" aria-hidden="true" />
      <div className="ct-ctx-item">
        <span className="ct-ctx-label">2021 peak</span>
        <span className="ct-ctx-value">£{PEAK_2021.toLocaleString("en-GB")}</span>
      </div>
      <div className="ct-ctx-divider" aria-hidden="true" />
      <div className="ct-ctx-item">
        <span className="ct-ctx-label">2022 crash low</span>
        <span className="ct-ctx-value">£{CRASH_LOW_2022.toLocaleString("en-GB")}</span>
      </div>
      <div className="ct-ctx-spacer" />
      <div className="ct-ctx-item ct-ctx-item--right">
        <span className="ct-ctx-pct">+{aboveLow}%</span>
        <span className="ct-ctx-pct-sub">above crash low</span>
      </div>
    </div>
  );
}
