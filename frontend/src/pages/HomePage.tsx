import { Link } from "react-router-dom";
import { useI18n } from "../i18n/provider";
import homeCoverDictionary from "../assets/home-covers/home-cover-dictionary.png";
import homeCoverJudgment from "../assets/home-covers/home-cover-judgment.png";
import homeCoverLearn from "../assets/home-covers/home-cover-learn.png";
import homeCoverMarket from "../assets/home-covers/home-cover-market.png";
import homeHeroComposite from "../assets/home-hero/home-hero-composite.png";
import scenarioTimelineCover from "../assets/home-scenarios/timeline-cover-new.png";
import scenarioCrashLabCover from "../assets/home-scenarios/crash-lab-cover-new.png";
import scenarioMarketReplayCover from "../assets/home-scenarios/market-replay-cover-new.png";

// Keep homepage chapters data-driven so copy, destination, and crop tuning can evolve without touching layout markup.
const CHAPTERS = [
  {
    title: "Understand the market",
    body:
      "Track relative performance, spot price moves, and short-term context across major assets in one place.",
    href: "/market",
    coverSrc: homeCoverMarket,
    coverAlt: "Abstract market structure cover",
    coverScale: 1.16,
    coverPosition: "50% 51%"
  },
  {
    title: "Learn before risk",
    body:
      "Move chapter by chapter through the core learning path, keep the reading flow calm and focused, then head into quiz when you are ready.",
    href: "/learn",
    coverSrc: homeCoverLearn,
    coverAlt: "Abstract learning path cover",
    coverScale: 1.11,
    coverPosition: "50% 50%"
  },
  {
    title: "Test your judgment",
    body:
      "Use short quizzes to test core concepts, recognise common risk patterns, and build more reliable market judgement step by step.",
    href: "/quiz",
    coverSrc: homeCoverJudgment,
    coverAlt: "Abstract judgment and evaluation cover",
    coverScale: 1.15,
    coverPosition: "50% 50%"
  },
  {
    title: "Build your dictionary",
    body:
      "Look up any word — crypto jargon, finance terms, or everyday language.",
    href: "/dictionary",
    coverSrc: homeCoverDictionary,
    coverAlt: "Abstract dictionary and term-mapping cover",
    coverScale: 1.14,
    coverPosition: "50% 50%"
  }
] as const;

const SCENARIOS = [
  {
    title: "Timeline",
    body: "Step through major crashes and how they unfolded.",
    href: "/crashes",
    coverSrc: scenarioTimelineCover,
    coverAlt: "Timeline scenario cover",
    coverScale: 1.05,
    coverFit: "cover",
    coverPosition: "left top"
  },
  {
    title: "Crash Lab",
    body: "Trade through a selloff and test your decisions.",
    href: "/covid-crash",
    coverSrc: scenarioCrashLabCover,
    coverAlt: "Crash Lab scenario cover",
    coverScale: 1.05,
    coverFit: "cover",
    coverPosition: "left top"
  },
  {
    title: "Market Replay",
    body: "Replay a historical market in simulated real time.",
    href: "/market-replay",
    coverSrc: scenarioMarketReplayCover,
    coverAlt: "Market Replay scenario cover",
    coverScale: 1.05,
    coverFit: "cover",
    coverPosition: "center"
  }
] as const;

export function HomePage() {
  const { tx } = useI18n();
  // Translate only copy fields here while preserving the static layout and crop metadata defined in the shared chapter config.
  const chapters = [
    {
      ...CHAPTERS[0],
      title: tx("Understand the market"),
      body: tx("Track relative performance, spot price moves, and short-term context across major assets in one place."),
      coverAlt: tx("Abstract market structure cover"),
    },
    {
      ...CHAPTERS[1],
      title: tx("Learn before risk"),
      body: tx("Move chapter by chapter through the core learning path, keep the reading flow calm and focused, then head into quiz when you are ready."),
      coverAlt: tx("Abstract learning path cover"),
    },
    {
      ...CHAPTERS[2],
      title: tx("Test your judgment"),
      body: tx("Use short quizzes to test core concepts, recognise common risk patterns, and build more reliable market judgement step by step."),
      coverAlt: tx("Abstract judgment and evaluation cover"),
    },
    {
      ...CHAPTERS[3],
      title: tx("Build your dictionary"),
      body: tx("Look up any word — crypto jargon, finance terms, or everyday language."),
      coverAlt: tx("Abstract dictionary and term-mapping cover"),
    }
  ] as const;
  // Scenario cards follow the same pattern so one locale switch updates titles/body copy without duplicating visual settings.
  const scenarios = [
    {
      ...SCENARIOS[0],
      title: tx("Timeline"),
      body: tx("Step through major crashes and how they unfolded."),
      coverAlt: tx("Timeline scenario cover"),
    },
    {
      ...SCENARIOS[1],
      title: tx("Crash Lab"),
      body: tx("Trade through a selloff and test your decisions."),
      coverAlt: tx("Crash Lab scenario cover"),
    },
    {
      ...SCENARIOS[2],
      title: tx("Market Replay"),
      body: tx("Replay a historical market in simulated real time."),
      coverAlt: tx("Market Replay scenario cover"),
    }
  ] as const;

  return (
    <div className="home-page">
      <section className="home-hero" aria-labelledby="home-page-title">
        <div className="home-hero-copy">
          <h1 id="home-page-title" className="home-hero-title">
            <span>{tx("A clearer starting point")}</span>
            <span>{tx("for crypto")}</span>
          </h1>
          <p className="home-hero-subtitle">
            {tx("A quieter surface for reading uncertainty, following signals, and staying with the questions a little longer.")}
          </p>
        </div>

        <div aria-hidden="true" className="home-hero-art">
          <img alt="" className="home-hero-composite" src={homeHeroComposite} />
        </div>
      </section>

      <section className="home-interlude" aria-hidden="true">
        <div className="home-interlude-rule" />
      </section>

      <section className="home-chapter-group" aria-labelledby="home-study-title">
        <div className="home-chapter-group-head">
          <h2 id="home-study-title" className="home-chapter-group-title">
            {tx("Study")}
          </h2>
        </div>

        <div className="home-chapters" aria-label={tx("Homepage study chapters")}>
          {chapters.map((chapter, index) => (
            <article
              key={chapter.title}
              className={`home-chapter home-chapter-${index + 1}`}
            >
              <Link className="home-chapter-link" to={chapter.href}>
                <div className="home-chapter-copy">
                  <div className="home-chapter-index">{`0${index + 1}`}</div>
                  <div className="home-chapter-body">
                    <h3>{chapter.title}</h3>
                    <p>{chapter.body}</p>
                  </div>
                </div>
                <div aria-hidden="true" className="home-chapter-cover">
                  <img
                    alt={chapter.coverAlt}
                    className="home-chapter-cover-image"
                    src={chapter.coverSrc}
                    style={{
                      // Per-image scale/position keeps source assets visually aligned inside one shared cover frame.
                      transform: `scale(${chapter.coverScale})`,
                      objectPosition: chapter.coverPosition
                    }}
                  />
                </div>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="home-chapter-group" aria-labelledby="home-scenarios-title">
        <div className="home-chapter-group-head">
          <h2 id="home-scenarios-title" className="home-chapter-group-title">
            {tx("Scenarios")}
          </h2>
        </div>

        <div className="home-scenarios-grid" aria-label={tx("Homepage scenario chapters")}>
          {scenarios.map((scenario) => (
            <article key={scenario.title} className="home-scenario-card">
              <Link className="home-scenario-link" to={scenario.href}>
                <div className="home-scenario-cover">
                  <img
                    alt={scenario.coverAlt}
                  className="home-scenario-cover-image"
                  src={scenario.coverSrc}
                  style={{
                      objectFit: scenario.coverFit,
                      objectPosition: scenario.coverPosition,
                      transform: `scale(${scenario.coverScale})`
                    }}
                  />
                </div>
                <div className="home-scenario-body">
                  <h3>{scenario.title}</h3>
                  <p>{scenario.body}</p>
                </div>
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
