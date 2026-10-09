import { useI18n } from "../i18n/provider";

export function RisksPage() {
  const { tx } = useI18n();
  return (
    <div className="risks-page">
      <header className="risks-header">
        <p className="risks-kicker">{tx("Know before you go")}</p>
        <h1 className="risks-title">{tx("Understanding Crypto Risks")}</h1>
        <p className="risks-subtitle">
          {tx("Cryptocurrency can be rewarding — but it carries unique dangers that don't exist in traditional finance. Read this before you invest.")}
        </p>
      </header>

      <div className="risks-grid">
        <article className="risk-card risk-card--volatility">
          <div className="risk-card-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <h2>Extreme Volatility</h2>
          <p>
            Crypto prices can swing 20–50% in a single day. A portfolio worth
            $10,000 today could be worth $5,000 tomorrow — or vice versa. Never
            invest more than you can afford to lose entirely.
          </p>
          <ul className="risk-card-list">
            <li>Bitcoin has dropped over 80% multiple times in its history</li>
            <li>Altcoins can lose 90%+ of value and never recover</li>
            <li>Leverage trading amplifies losses rapidly</li>
          </ul>
        </article>

        <article className="risk-card risk-card--scams">
          <div className="risk-card-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2>Scams &amp; Fraud</h2>
          <p>
            The crypto space is rife with scams designed to steal your funds.
            Rug pulls, phishing attacks, and fake exchanges cost investors
            billions every year.
          </p>
          <ul className="risk-card-list">
            <li>Rug pulls: developers abandon projects after raising funds</li>
            <li>Phishing sites mimic real exchanges to steal credentials</li>
            <li>&ldquo;Too good to be true&rdquo; yields are almost always scams</li>
            <li>Celebrity endorsements are frequently fake or paid</li>
          </ul>
        </article>

        <article className="risk-card risk-card--security">
          <div className="risk-card-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2>Key &amp; Wallet Security</h2>
          <p>
            Unlike a bank, there is no customer support line when crypto is lost
            or stolen. If you lose your private key or seed phrase, your funds
            are gone forever.
          </p>
          <ul className="risk-card-list">
            <li>Never share your seed phrase with anyone, ever</li>
            <li>Store backups offline in multiple secure locations</li>
            <li>Hardware wallets are safer than exchange-held funds</li>
            <li>Exchange hacks have wiped out billions in user funds</li>
          </ul>
        </article>

        <article className="risk-card risk-card--regulatory">
          <div className="risk-card-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <h2>Regulatory Risk</h2>
          <p>
            Governments worldwide are still defining crypto regulations. A
            single policy change can crash an asset&apos;s price or make it
            illegal to hold in your country.
          </p>
          <ul className="risk-card-list">
            <li>Some countries have outright banned crypto ownership</li>
            <li>Tax rules vary widely and change frequently</li>
            <li>Exchanges can freeze accounts due to compliance orders</li>
            <li>DeFi protocols may face retroactive regulatory action</li>
          </ul>
        </article>

        <article className="risk-card risk-card--liquidity">
          <div className="risk-card-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
          </div>
          <h2>Liquidity Risk</h2>
          <p>
            Smaller tokens may be nearly impossible to sell when you want to
            exit. Thin order books mean your sale could crash the price — or not
            fill at all.
          </p>
          <ul className="risk-card-list">
            <li>Low-cap tokens can have huge bid/ask spreads</li>
            <li>Market makers can disappear during crashes</li>
            <li>Lock-up periods in staking prevent quick exits</li>
          </ul>
        </article>

        <article className="risk-card risk-card--tech">
          <div className="risk-card-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </div>
          <h2>Smart Contract Risk</h2>
          <p>
            DeFi protocols run on code. Bugs in smart contracts can be exploited
            by hackers to drain entire protocols, with no recourse for users.
          </p>
          <ul className="risk-card-list">
            <li>Over $3 billion was stolen via smart contract exploits in 2022</li>
            <li>Audits reduce but do not eliminate risk</li>
            <li>New protocols carry the highest unaudited risk</li>
          </ul>
        </article>
      </div>

      <aside className="risks-disclaimer">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p>
          This page is for educational purposes only and does not constitute
          financial or investment advice. Always do your own research and
          consult a qualified financial adviser before investing.
        </p>
      </aside>
    </div>
  );
}
