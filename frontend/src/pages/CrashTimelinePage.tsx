import { useMemo, useState } from "react";

// ─── Data ───────────────────────────────────────────────────

interface CrashEvent {
  id: string;
  name: string;
  dateLabel: string;
  category: string;
  categoryTone: "warn" | "danger" | "brand" | "success";
  asset: string;
  peak: string;
  trough: string;
  drop: string;
  peakNum: number;
  troughNum: number;
  todayNum: number;
  recovered: boolean;
  duration: string;
  summary: string;
  cause: string;
  warning: string;
  reaction: string;
  lesson: string;
  redFlags: string[];
}

const CRASHES: CrashEvent[] = [
  {
    id: "mtgox", name: "Mt. Gox collapse", dateLabel: "Feb 2014",
    category: "Exchange failure", categoryTone: "warn", asset: "BTC",
    peak: "$1,150", trough: "$170", drop: "-85%", peakNum: 1150, troughNum: 170, todayNum: 68420, recovered: true,
    duration: "18 months of decline",
    summary: "The largest Bitcoin exchange at the time lost 850,000 BTC and filed for bankruptcy.",
    cause: "Mt. Gox handled around 70% of all Bitcoin trades. Over years, roughly 850,000 BTC was stolen or lost — partly to hackers, partly to sloppy internal controls — and the company was quietly insolvent while still taking deposits. When the truth surfaced, withdrawals froze and the exchange collapsed within weeks.",
    warning: "One private company held most of the industry's volume with no audits, no public reserves, and a CEO who admitted he couldn't explain the accounting.",
    reaction: "BTC fell 50% inside a month. Tens of thousands of users were locked out of their funds — many are still waiting for partial reimbursement a decade later.",
    lesson: "A major exchange is not automatically a safe exchange. Money on an exchange is an IOU that depends entirely on the issuer staying solvent and honest.",
    redFlags: [
      "Withdrawal delays grew from hours to weeks over several months.",
      "No public proof-of-reserves; accounting was reportedly done on a spreadsheet.",
      "The CEO publicly admitted the company didn't know how much BTC it actually held."
    ]
  },
  {
    id: "ico", name: "ICO bubble pop", dateLabel: "Jan–Dec 2018",
    category: "Market panic", categoryTone: "danger", asset: "Altcoins",
    peak: "$19,800", trough: "$3,200", drop: "-83%", peakNum: 19800, troughNum: 3200, todayNum: 68420, recovered: true,
    duration: "~12 months, the 'crypto winter'",
    summary: "Thousands of token launches raised $22B in 2017. Most went to zero within 18 months.",
    cause: "The 2017 ICO boom let anyone raise millions by publishing a PDF whitepaper. Projects with no product, no accountability, and cartoon roadmaps attracted billions. When BTC turned, the music stopped — 80% of the 2017 cohort was effectively dead by the end of 2018.",
    warning: "Whitepapers promised 'guaranteed' returns. Celebrities endorsed tokens on Instagram. Team pages were stock photos.",
    reaction: "The total crypto market cap fell from $830B to $100B in a year. The SEC began treating most ICOs as unregistered securities.",
    lesson: "A great story is not a product. Fundraising is easy; building something people actually use is the hard part — and most projects never reach that part.",
    redFlags: [
      "Vague whitepapers with finance jargon but no working prototype.",
      "Celebrity endorsements instead of technical explanations.",
      "Token price depended entirely on new buyers, not actual usage."
    ]
  },
  {
    id: "covid", name: "The Covid liquidity shock", dateLabel: "Mar 2020",
    category: "Market panic", categoryTone: "danger", asset: "All assets",
    peak: "$10,500", trough: "$3,850", drop: "-63%", peakNum: 10500, troughNum: 3850, todayNum: 68420, recovered: true,
    duration: "~2 weeks down, months to recover",
    summary: "Global markets seized up in March 2020. Crypto fell as hard as everything else — faster, actually.",
    cause: "When Covid lockdowns hit, investors everywhere sold anything liquid to raise cash. Crypto, which advocates had pitched as 'uncorrelated', dropped 50% in two days alongside stocks and gold. Forced liquidations on leveraged traders amplified the move.",
    warning: "Crypto had been marketed as a hedge against the traditional financial system. In a real crisis, it traded like the riskiest asset in your portfolio, not the safest.",
    reaction: "BTC fell from ~$7,900 to ~$3,850 in 48 hours. But central bank intervention and retail interest drove a rapid recovery — BTC was above $10,000 by August.",
    lesson: "In a real panic, everything correlates. 'Uncorrelated' is a feature of calm markets; in a real crisis, the only asset class is 'cash'.",
    redFlags: [
      "High leverage in crypto futures markets going into a macro uncertainty event.",
      "Narratives about decoupling from stocks that were never actually tested.",
      "Investors believing 'digital gold' would behave like actual gold."
    ]
  },
  {
    id: "china", name: "China mining ban", dateLabel: "May–Jul 2021",
    category: "Regulation shock", categoryTone: "brand", asset: "BTC",
    peak: "$64,800", trough: "$29,800", drop: "-54%", peakNum: 64800, troughNum: 29800, todayNum: 68420, recovered: true,
    duration: "~3 months, sharp recovery",
    summary: "China banned Bitcoin mining, forcing half the network offline almost overnight.",
    cause: "In May 2021, Chinese authorities announced a sweeping crackdown on crypto mining and trading. At the time, ~65% of global Bitcoin mining was based in China. Miners scrambled to relocate hardware — mostly to the US and Kazakhstan — and the network's hash rate halved within weeks.",
    warning: "A single country's policy stance could cut the network in half. 'Decentralised' is a spectrum, not a promise.",
    reaction: "BTC fell from $64k to $30k in two months. But the network held; mining redistributed globally, and prices recovered to new all-time highs later that year.",
    lesson: "Regulation is a market-moving force, not a sideshow. Even networks designed to be 'censorship-resistant' are deeply affected by where power and electricity physically live.",
    redFlags: [
      "Geographic concentration of mining infrastructure in one jurisdiction.",
      "Assumption that 'code is law' makes government policy irrelevant.",
      "Media narratives dismissing earlier Chinese warnings as empty threats."
    ]
  },
  {
    id: "luna", name: "Terra / Luna implosion", dateLabel: "May 2022",
    category: "Stablecoin failure", categoryTone: "danger", asset: "UST · LUNA",
    peak: "$119", trough: "$0.00005", drop: "-99.99%", peakNum: 119, troughNum: 0.00005, todayNum: 0.16, recovered: false,
    duration: "72 hours from peg to zero",
    summary: "A $40B algorithmic stablecoin lost its peg and went to zero in 72 hours.",
    cause: "UST was meant to hold a $1 peg via a mint-and-burn loop with its sister token LUNA. The design assumed market confidence would always hold. When a large coordinated sell hit thin weekend liquidity, arbitrage flipped into a death spiral: to defend UST, the system minted billions of LUNA, which crashed LUNA's price, which required even more minting.",
    warning: "The Anchor protocol offered a 'stable' 19.5% yield on UST deposits. The yield was subsidised — not earned — and the math was public.",
    reaction: "UST fell to $0.02 and LUNA to effectively zero in three days. An estimated $60B of value was destroyed. The collapse triggered 3AC's failure two weeks later.",
    lesson: "'Stable' is a marketing word, not a guarantee. If a yield feels free, you are the yield — read the mechanism, not the brochure.",
    redFlags: [
      "A 19.5% 'risk-free' savings rate when global rates were near zero.",
      "The peg was defended by a sister token, not real collateral.",
      "Prominent critics had published detailed threads explaining the death spiral months ahead."
    ]
  },
  {
    id: "ftx", name: "FTX bankruptcy", dateLabel: "Nov 2022",
    category: "Fraud", categoryTone: "warn", asset: "FTT · Funds",
    peak: "$25.9B valuation", trough: "$0", drop: "Bankrupt", peakNum: 25900000000, troughNum: 0, todayNum: 0, recovered: false,
    duration: "10 days from headline to Chapter 11",
    summary: "The second-largest crypto exchange collapsed in a week when a leaked balance sheet revealed $8B missing.",
    cause: "FTX had secretly been lending customer deposits to its sister trading firm Alameda Research, which had lost most of it in the 2022 downturn. When CoinDesk leaked Alameda's balance sheet — showing it was mostly FTX's own token — Binance's CEO announced he would sell his FTT. A classic bank run followed and FTX couldn't meet withdrawals.",
    warning: "Auditors had resigned. Reserves were never independently verified. Executives lived together in a Bahamas penthouse. Sports sponsorships and celebrity ads were everywhere.",
    reaction: "FTX filed for bankruptcy within a week. 1M+ customers were affected. The founder was convicted of fraud and sentenced to 25 years in prison.",
    lesson: "Charisma, glossy offices, and stadium naming rights are not a substitute for audits, board oversight, and basic segregation of customer funds.",
    redFlags: [
      "Audit firm was a tiny, then-unknown shop for a supposed $30B business.",
      "Executives lived and worked together with no independent oversight.",
      "The exchange's own token (FTT) was used as collateral by its sister hedge fund."
    ]
  }
];

const PATTERNS = [
  { title: "Hype hides structural weakness", body: "By the time something is a mainstream narrative, the fragility is already baked in.", tone: "var(--ds-danger, #cf202f)" },
  { title: "Leverage amplifies fragility", body: "A 5% move with 10× leverage is a 50% move. That's not a trade — that's a fuse.", tone: "var(--ds-warn)" },
  { title: "'Stable' is marketing", body: "Read the mechanism, not the brochure. The word stable describes intent, not outcome.", tone: "var(--ds-brand)" },
  { title: "Opacity creates risk", body: "If you can't see the reserves, audits, or counterparty, you are the counterparty.", tone: "var(--ds-success)" },
  { title: "Emotion drives losses", body: "Panic sells at the low. FOMO buys at the high. Rules written in calm beat reflexes in chaos.", tone: "var(--ds-danger, #cf202f)" },
  { title: "Recovery isn't guaranteed", body: "Bitcoin recovered. Most crashed coins didn't. Survivorship bias warps what we remember.", tone: "var(--ds-ink-2, #31343a)" }
];

const CATEGORIES = ["All", "Exchange failures", "Market panics", "Stablecoin failures", "Regulation shocks", "Fraud"];

const CATEGORY_TO_FILTER: Record<string, string> = {
  "Exchange failure":   "Exchange failures",
  "Market panic":       "Market panics",
  "Stablecoin failure": "Stablecoin failures",
  "Regulation shock":   "Regulation shocks",
  "Fraud":              "Fraud",
};

// ─── Helpers ────────────────────────────────────────────────

function fmtUSD(v: number, digits = 0): string {
  if (v === 0) return "$0";
  if (v >= 1_000_000_000) return "$" + (v / 1_000_000_000).toFixed(1) + "B";
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(1) + "M";
  return "$" + v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function catTone(tone: CrashEvent["categoryTone"]): string {
  return { warn: "ds-pill-warn", danger: "ds-pill-danger", brand: "ds-pill-brand", success: "ds-pill-success" }[tone] ?? "ds-pill-muted";
}

// ─── Sub-components ──────────────────────────────────────────

function CrashSection({ tone, label, body }: { tone: string; label: string; body: string }) {
  return (
    <div style={{ position: "relative", paddingLeft: 18, marginTop: 20 }}>
      <div style={{
        position: "absolute", left: 0, top: 7, width: 8, height: 8, borderRadius: "50%",
        background: tone
      }} />
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ds-muted)", marginBottom: 6 }}>{label}</div>
      <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--ds-ink-2)", margin: 0 }}>{body}</p>
    </div>
  );
}

function MiniLineChart({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const w = 400, h = 120;
  const min = Math.min(...data), max = Math.max(...data);
  const range = (max - min) || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const d = "M " + pts.join(" L ");
  const areaD = d + ` L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 140 }} preserveAspectRatio="none">
      <path d={areaD} fill={color} opacity="0.1" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Main page ───────────────────────────────────────────────

export function CrashTimelinePage() {
  const [open, setOpen]               = useState<string>("mtgox");
  const [filter, setFilter]           = useState<string>("All");
  const [investAmount, setInvestAmount] = useState<number>(1000);
  const [shareCopied, setShareCopied] = useState<boolean>(false);

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const title = "Crypto Crash Timeline";
    const text = "Major crypto crashes, what caused them, and the warning signs.";
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try { await navigator.share({ title, text, url }); return; } catch { /* fall through to clipboard */ }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 1800);
      } catch { /* no-op */ }
    }
  };

  const active = CRASHES.find(c => c.id === open)!;
  const visible = filter === "All"
    ? CRASHES
    : CRASHES.filter(c => CATEGORY_TO_FILTER[c.category] === filter);

  const multiplier = active.recovered && active.troughNum > 0 ? active.todayNum / active.troughNum : 0;
  const payout     = investAmount * multiplier;

  const trajectoryData = useMemo<number[]>(() => {
    if (active.recovered && active.troughNum > 0) {
      return [
        active.peakNum * 0.15, active.peakNum * 0.35, active.peakNum * 0.65,
        active.peakNum * 0.95, active.peakNum,         active.peakNum * 0.72,
        active.peakNum * 0.42, active.troughNum * 1.5, active.troughNum,
        active.troughNum * 1.8, active.troughNum * 4,  active.troughNum * 8,
        active.troughNum * 20, Math.min(active.todayNum, active.peakNum * 3.5), active.todayNum
      ];
    }
    return [
      active.peakNum * 0.2, active.peakNum * 0.5, active.peakNum * 0.85,
      active.peakNum,       active.peakNum * 0.6,  active.peakNum * 0.25,
      active.peakNum * 0.08, active.peakNum * 0.02, Math.max(active.troughNum, 1)
    ];
  }, [active]);

  return (
    <div className="ds-page ds-page-enter">
      {/* ── Hero ── */}
      <div className="ds-page-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, maxWidth: "100%" }}>
        <div style={{ maxWidth: 820, flex: 1 }}>
          <span className="ds-page-eyebrow">Case studies · 6 events</span>
          <h1 className="ds-page-title" style={{ fontSize: 48, lineHeight: 1.05 }}>Crypto Crash Timeline</h1>
          <p className="ds-page-sub" style={{ fontSize: 17, marginTop: 16, maxWidth: 680 }}>
            Explore major crypto crashes, understand what caused them, and learn the warning signs investors should have noticed.
          </p>
          <div style={{
            marginTop: 20, padding: "14px 18px", borderRadius: 12,
            background: "var(--ds-brand-soft)",
            border: "1px solid color-mix(in oklab, var(--ds-brand) 22%, transparent)",
            fontSize: 13.5, color: "var(--ds-brand-ink)", lineHeight: 1.55, maxWidth: 680,
            display: "flex", gap: 12, alignItems: "flex-start"
          }}>
            <span style={{
              flexShrink: 0, width: 22, height: 22, borderRadius: 6, display: "grid", placeItems: "center",
              background: "var(--ds-brand)", color: "white", fontSize: 12, fontWeight: 700
            }}>i</span>
            <span>Past crashes do not predict the future, but they reveal patterns of risk, hype, and poor decision-making.</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleShare()}
          className="ds-btn ds-btn-ghost"
          aria-label="Share this page"
          style={{ flexShrink: 0, marginTop: 4 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          {shareCopied ? "Copied!" : "Share"}
        </button>
      </div>

      {/* ── Filter pills ── */}
      <div className="ds-row ds-mb-6" style={{ flexWrap: "wrap", gap: 8 }}>
        {CATEGORIES.map(c => (
          <button
            key={c}
            className={`ds-btn ds-btn-sm ${filter === c ? "ds-btn-primary" : "ds-btn-ghost"}`}
            onClick={() => setFilter(c)}
          >{c}</button>
        ))}
      </div>

      {/* ── Two-column layout ── */}
      <div className="ds-grid ds-mb-8" style={{ gridTemplateColumns: "minmax(300px, 360px) 1fr", gap: 28, alignItems: "start" }}>

        {/* LEFT — vertical timeline */}
        <div style={{ position: "sticky", top: 70 }}>
          <div style={{ position: "relative", paddingLeft: 6 }}>
            <div style={{
              position: "absolute", left: 13, top: 12, bottom: 12,
              width: 2, background: "var(--ds-border)", borderRadius: 2
            }} />
            <div className="ds-col" style={{ gap: 6 }}>
              {visible.map(c => {
                const isActive = open === c.id;
                const dotColor = c.categoryTone === "warn"    ? "var(--ds-warn)"
                               : c.categoryTone === "brand"   ? "var(--ds-brand)"
                               : "var(--ds-danger, #cf202f)";
                return (
                  <button
                    key={c.id}
                    onClick={() => setOpen(c.id)}
                    style={{
                      display: "grid", gridTemplateColumns: "28px 1fr", gap: 14,
                      padding: "14px 16px 14px 6px",
                      background: isActive ? "var(--ds-surface)" : "transparent",
                      border: "1px solid " + (isActive ? "var(--ds-border-strong)" : "transparent"),
                      borderRadius: 14, cursor: "pointer", textAlign: "left",
                      transition: "background 0.15s, border-color 0.15s, box-shadow 0.15s",
                      boxShadow: isActive ? "var(--ds-shadow-md)" : "none",
                      fontFamily: "var(--ds-font-display)",
                      position: "relative"
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = "color-mix(in oklab, var(--ds-surface) 60%, transparent)";
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--ds-border)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                        (e.currentTarget as HTMLElement).style.borderColor = "transparent";
                      }
                    }}
                  >
                    <div style={{ display: "grid", placeItems: "center", position: "relative" }}>
                      <div style={{
                        width: isActive ? 14 : 10, height: isActive ? 14 : 10,
                        borderRadius: "50%",
                        background: isActive ? dotColor : "var(--ds-surface)",
                        border: "2px solid " + (isActive ? dotColor : "var(--ds-border-strong)"),
                        boxShadow: isActive ? `0 0 0 5px color-mix(in oklab, ${dotColor} 18%, transparent)` : "none",
                        transition: "all 0.2s", zIndex: 1
                      }} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "var(--ds-muted)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>{c.dateLabel}</div>
                      <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 3, color: "var(--ds-ink)", lineHeight: 1.3 }}>{c.name}</div>
                      <div style={{ fontSize: 12.5, color: "var(--ds-muted)", marginTop: 4, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>{c.summary}</div>
                      <div className="ds-row ds-mt-2" style={{ gap: 6 }}>
                        <span className={`ds-pill ${catTone(c.categoryTone)}`} style={{ fontSize: 10.5, padding: "2px 7px" }}>{c.category}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT — event detail */}
        <div className="ds-col" style={{ gap: 16 }}>
          <div className="ds-card ds-card-lg">
            <div className="ds-row ds-mb-4" style={{ flexWrap: "wrap", gap: 8 }}>
              <span className={`ds-pill ${catTone(active.categoryTone)}`}>{active.category}</span>
              <span className="ds-pill ds-pill-outline">{active.asset}</span>
              <span className="ds-pill ds-pill-outline">{active.dateLabel}</span>
            </div>

            <h2 style={{ fontSize: 36, lineHeight: 1.08, letterSpacing: "-0.025em", margin: 0, fontFamily: "var(--ds-font-display)", color: "var(--ds-ink)" }}>{active.name}</h2>
            <p style={{ marginTop: 12, fontSize: 16.5, color: "var(--ds-muted)", lineHeight: 1.55, maxWidth: 620 }}>{active.summary}</p>

            {/* Stats row */}
            <div className="ds-grid ds-grid-3 ds-mt-6" style={{ gap: 12 }}>
              <div style={{ padding: "16px 18px", background: "var(--ds-surface-2)", borderRadius: 12, border: "1px solid var(--ds-border)" }}>
                <div className="ds-stat-label">Peak</div>
                <div className="ds-num" style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--ds-font-display)", marginTop: 4, letterSpacing: "-0.02em", color: "var(--ds-ink)" }}>{active.peak}</div>
              </div>
              <div style={{ padding: "16px 18px", background: "color-mix(in oklab, #cf202f 6%, var(--ds-surface))", borderRadius: 12, border: "1px solid color-mix(in oklab, #cf202f 18%, var(--ds-border))" }}>
                <div className="ds-stat-label">Crash low</div>
                <div className="ds-num" style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--ds-font-display)", marginTop: 4, letterSpacing: "-0.02em", color: "#cf202f" }}>{active.trough}</div>
              </div>
              <div style={{ padding: "16px 18px", background: "color-mix(in oklab, #cf202f 6%, var(--ds-surface))", borderRadius: 12, border: "1px solid color-mix(in oklab, #cf202f 18%, var(--ds-border))" }}>
                <div className="ds-stat-label">Drawdown</div>
                <div className="ds-num" style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--ds-font-display)", marginTop: 4, letterSpacing: "-0.02em", color: "#cf202f" }}>{active.drop}</div>
              </div>
            </div>

            <div className="ds-mt-2 ds-text-sm ds-text-muted" style={{ padding: "8px 2px" }}>Duration: {active.duration}</div>

            {/* What / Why / Reaction */}
            <div className="ds-mt-5">
              <CrashSection tone="#cf202f"          label="What happened"   body={active.cause} />
              <CrashSection tone="var(--ds-warn)"   label="Why it happened" body={active.warning} />
              <CrashSection tone="var(--ds-muted)"  label="Market impact"   body={active.reaction} />
            </div>

            {/* Lesson callout */}
            <div className="ds-mt-6" style={{
              padding: "22px 24px", borderRadius: 14,
              background: "var(--ds-brand-soft)",
              border: "1px solid color-mix(in oklab, var(--ds-brand) 25%, transparent)",
              display: "flex", gap: 14, alignItems: "flex-start"
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                background: "var(--ds-brand)", color: "white",
                display: "grid", placeItems: "center", fontSize: 16
              }}>✦</div>
              <div>
                <div className="ds-page-eyebrow" style={{ margin: 0, color: "var(--ds-brand)" }}>The key lesson</div>
                <p style={{ fontSize: 16.5, lineHeight: 1.5, color: "var(--ds-brand-ink)", fontWeight: 500, margin: "8px 0 0" }}>{active.lesson}</p>
              </div>
            </div>

            {/* Red flags */}
            <div className="ds-mt-6">
              <div className="ds-between ds-mb-4">
                <h3 style={{ fontSize: 18, margin: 0, fontFamily: "var(--ds-font-display)", color: "var(--ds-ink)" }}>Could you have spotted it?</h3>
                <span className="ds-pill ds-pill-warn">3 red flags</span>
              </div>
              <div className="ds-col" style={{ gap: 8 }}>
                {active.redFlags.map((flag, i) => (
                  <div key={i} style={{
                    display: "grid", gridTemplateColumns: "auto 1fr", gap: 14, alignItems: "flex-start",
                    padding: "14px 16px", background: "var(--ds-surface)", border: "1px solid var(--ds-border)",
                    borderLeft: "3px solid var(--ds-warn)", borderRadius: 10
                  }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: "color-mix(in oklab, var(--ds-warn) 16%, transparent)",
                      color: "var(--ds-warn)", display: "grid", placeItems: "center",
                      fontSize: 12, fontWeight: 700, flexShrink: 0
                    }}>{i + 1}</div>
                    <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0, color: "var(--ds-ink-2)" }}>{flag}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Price trajectory + calculator */}
          <div className="ds-grid ds-grid-2" style={{ gap: 16 }}>
            <div className="ds-card">
              <div className="ds-between">
                <span className="ds-page-eyebrow" style={{ margin: 0 }}>Price trajectory</span>
                {active.recovered
                  ? <span className="ds-pill ds-pill-success">✓ Recovered</span>
                  : <span className="ds-pill ds-pill-danger">Not recovered</span>}
              </div>
              <div className="ds-mt-3">
                <MiniLineChart data={trajectoryData} color={active.recovered ? "var(--ds-ink)" : "#cf202f"} />
              </div>
              <div className="ds-divider" />
              <div className="ds-between"><span className="ds-text-sm ds-text-muted">Peak then</span><span className="ds-num" style={{ fontWeight: 600 }}>{active.peak}</span></div>
              <div className="ds-between ds-mt-2"><span className="ds-text-sm ds-text-muted">Crash low</span><span className="ds-num" style={{ fontWeight: 600, color: "#cf202f" }}>{active.trough}</span></div>
              <div className="ds-between ds-mt-2">
                <span className="ds-text-sm ds-text-muted">Today</span>
                <span className="ds-num" style={{ fontWeight: 600, color: active.recovered ? "var(--ds-success)" : "var(--ds-muted)" }}>
                  {active.recovered ? fmtUSD(active.todayNum) : "—"}
                </span>
              </div>
            </div>

            {active.recovered && active.troughNum > 0 ? (
              <div className="ds-card">
                <span className="ds-page-eyebrow" style={{ margin: 0 }}>If you'd bought the low…</span>
                <label className="ds-text-sm ds-text-muted ds-mt-3" style={{ display: "block", fontWeight: 500 }}>If you invested $</label>
                <input
                  type="number" className="ds-input ds-mt-2"
                  value={investAmount}
                  onChange={e => setInvestAmount(Math.max(0, Number(e.target.value) || 0))}
                  style={{ fontSize: 16, fontWeight: 600, fontFamily: "var(--ds-font-display)" }}
                />
                <div className="ds-divider" />
                <div style={{ fontFamily: "var(--ds-font-display)", fontSize: 28, fontWeight: 700, color: "var(--ds-success)", letterSpacing: "-0.03em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>
                  {fmtUSD(payout)}
                </div>
                <p className="ds-text-sm ds-text-muted ds-mt-1">at today's price · a {multiplier.toFixed(0)}× return</p>
                <p className="ds-text-xs ds-text-muted ds-mt-3" style={{ lineHeight: 1.5 }}>
                  Almost no one bought at the exact low. Most sold into it, in panic.
                </p>
              </div>
            ) : (
              <div className="ds-card" style={{ background: "var(--ds-surface-2)" }}>
                <span className="ds-page-eyebrow" style={{ margin: 0, color: "#cf202f" }}>Never recovered</span>
                <p className="ds-mt-3" style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ds-ink-2)" }}>
                  Unlike BTC, this asset never meaningfully bounced back. For most holders, the loss is permanent.
                </p>
                <div className="ds-divider" />
                <p className="ds-text-xs ds-text-muted" style={{ lineHeight: 1.5 }}>
                  The stories you hear are usually about the assets that recovered. Survivorship bias is a powerful thing.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Pattern insights ── */}
      <div className="ds-mb-8">
        <div className="ds-mb-5" style={{ maxWidth: 640 }}>
          <span className="ds-page-eyebrow">Common patterns</span>
          <h2 style={{ fontSize: 28, margin: 0, fontFamily: "var(--ds-font-display)", color: "var(--ds-ink)" }}>Six things almost every crypto crash has in common.</h2>
          <p className="ds-text-muted ds-mt-3" style={{ fontSize: 15, lineHeight: 1.55 }}>These aren't predictions — they're repeating shapes. Once you recognise them, they're hard to unsee.</p>
        </div>
        <div className="ds-grid ds-grid-3">
          {PATTERNS.map((p, i) => (
            <div key={i} className="ds-card" style={{ position: "relative", paddingTop: 24, overflow: "hidden" }}>
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, ${p.tone} 0%, color-mix(in oklab, ${p.tone} 30%, transparent) 100%)`
              }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 26, height: 22, borderRadius: 6,
                  background: `color-mix(in oklab, ${p.tone} 14%, transparent)`,
                  color: p.tone, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em",
                  fontVariantNumeric: "tabular-nums"
                }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontSize: 10.5, color: "var(--ds-muted)", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>Pattern</span>
              </div>
              <h4 className="ds-mt-3" style={{ fontSize: 16.5, lineHeight: 1.3, margin: 0, fontFamily: "var(--ds-font-display)", color: "var(--ds-ink)", letterSpacing: "-0.015em" }}>{p.title}</h4>
              <p className="ds-text-sm ds-text-muted ds-mt-2" style={{ lineHeight: 1.6 }}>{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
