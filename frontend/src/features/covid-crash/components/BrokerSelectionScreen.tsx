import { useState } from "react";
import { useI18n } from "../../../i18n/provider";

interface BrokerSelectionScreenProps {
  attemptId: number;
  onSelect: (broker: "trading_forge" | "highford_latham") => void;
  isSubmitting: boolean;
  error: string | null;
}

interface BrokerCard {
  key: "trading_forge" | "highford_latham";
  name: string;
  tagline: string;
  marketing: string;
  features: Array<{ label: string; value: string; highlight?: boolean }>;
  founded: string;
  badge: string;
}

const BROKERS: BrokerCard[] = [
  {
    key: "trading_forge",
    name: "Trading Forge",
    tagline: "Zero commission. Trade smarter.",
    marketing: "Powerful tools for the modern investor.",
    badge: "🔥",
    founded: "Founded 2014",
    features: [
      { label: "Commission per trade", value: "£0", highlight: true },
      { label: "Margin", value: "Up to 2× your cash" },
      { label: "Interface", value: "Mobile-first, slick UX" },
      { label: "Clearing", value: "Retail clearing-house" },
    ],
  },
  {
    key: "highford_latham",
    name: "Highford & Latham",
    tagline: "Trusted by 1.5 million UK investors.",
    marketing: "Transparent fees. No surprises.",
    badge: "🏛️",
    founded: "Founded 1981",
    features: [
      { label: "Commission per trade", value: "£11.95" },
      { label: "Margin", value: "Not available" },
      { label: "Interface", value: "Web-first, conservative" },
      { label: "Clearing", value: "Institutional arrangements" },
    ],
  },
];

export function BrokerSelectionScreen({
  onSelect,
  isSubmitting,
  error,
}: BrokerSelectionScreenProps) {
  const { tx } = useI18n();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="cc-broker-screen">
      <div className="cc-broker-screen-header">
        <h2 className="cc-broker-screen-title">{tx("Choose your broker")}</h2>
        <p className="cc-broker-screen-subtitle">
          {tx("January 2021. Before you start trading GME, you need to pick a broker. Each has different fees, capabilities, and — as you'll find out — different behaviour when things get chaotic.")}
        </p>
        <p className="cc-broker-screen-warning">
          ⚠ {tx("You cannot change brokers during the scenario. Choose carefully.")}
        </p>
      </div>

      <div className="cc-broker-cards">
        {BROKERS.map((broker) => (
          <div
            key={broker.key}
            className={[
              "cc-broker-card",
              hovered === broker.key ? "is-hovered" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onMouseEnter={() => setHovered(broker.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="cc-broker-card-header">
              <span className="cc-broker-badge" aria-hidden="true">
                {broker.badge}
              </span>
              <div>
                <h3 className="cc-broker-name">{tx(broker.name)}</h3>
                <p className="cc-broker-tagline">{tx(broker.tagline)}</p>
              </div>
            </div>

            <p className="cc-broker-marketing">{tx(broker.marketing)}</p>

            <ul className="cc-broker-features">
              {broker.features.map((f) => (
                <li key={f.label} className={`cc-broker-feature ${f.highlight ? "is-highlight" : ""}`}>
                  <span className="cc-broker-feature-label">{tx(f.label)}</span>
                  <span className="cc-broker-feature-value">{tx(f.value)}</span>
                </li>
              ))}
            </ul>

            <p className="cc-broker-founded">{tx(broker.founded)}</p>

            <button
              className="cc-broker-choose-btn"
              onClick={() => !isSubmitting && onSelect(broker.key)}
              disabled={isSubmitting}
              type="button"
            >
              {isSubmitting ? tx("Selecting…") : tx("Choose {broker}", { broker: tx(broker.name) })}
            </button>
          </div>
        ))}
      </div>

      {error && <p className="cc-broker-error">{error}</p>}
    </div>
  );
}
