import time
from datetime import date, datetime, timezone

import requests
from django.core.management.base import BaseCommand

from market_replay.models import ReplayCandle, ReplayNewsEvent, ReplayScenario


COVID_NEWS_EVENTS = [
    {
        "date": "2020-01-09",
        "headline": "WHO reports cluster of pneumonia cases in Wuhan, China",
        "body": (
            "The World Health Organisation reports a cluster of pneumonia cases in Wuhan, "
            "Hubei Province. Chinese authorities report no evidence of significant "
            "human-to-human transmission."
        ),
        "impact": "low",
        "btc_context": "Bitcoin trading near £5,800. No crypto market reaction.",
    },
    {
        "date": "2020-01-20",
        "headline": "China confirms human-to-human transmission of new coronavirus",
        "body": (
            "Chinese officials confirm the novel coronavirus can spread between humans. "
            "First cases outside China confirmed in Thailand, Japan and South Korea."
        ),
        "impact": "low",
        "btc_context": "Bitcoin dips slightly but crypto markets largely unaffected.",
    },
    {
        "date": "2020-01-31",
        "headline": "WHO declares global health emergency. UK confirms first cases.",
        "body": (
            "The World Health Organisation declares a Public Health Emergency of International "
            "Concern. The UK confirms its first two cases of COVID-19. Global equity markets fall."
        ),
        "impact": "medium",
        "btc_context": "Bitcoin drops 3% on the news but recovers within 48 hours.",
    },
    {
        "date": "2020-02-14",
        "headline": "Bitcoin at £7,920. Crypto press bullish. COVID still seen as contained.",
        "body": (
            "Bitcoin has risen 44% from £5,500 in October to £7,920 today. The crypto press is "
            "broadly bullish. COVID-19 is spreading in Italy and Iran but most Western investors "
            "are not yet treating it as a systemic risk."
        ),
        "impact": "medium",
        "btc_context": "THIS IS ROUND 1 — the first decision moment.",
    },
    {
        "date": "2020-02-24",
        "headline": "Global stocks fall sharply as COVID-19 spreads to Europe",
        "body": (
            "The Dow Jones falls 1,000 points — its largest single-day point drop at the time. "
            "Italy reports 219 cases and 7 deaths. S&P 500 has its worst week since 2008. "
            "Bitcoin falls 5% in sympathy."
        ),
        "impact": "high",
        "btc_context": "Bitcoin drops from £7,500 to £7,100. First signs of correlation with equity markets.",
    },
    {
        "date": "2020-02-28",
        "headline": "S&P 500 enters correction territory — fastest correction in history",
        "body": (
            "The S&P 500 falls 10% from its all-time high in just 6 trading days — the fastest "
            "correction in stock market history. Global markets in freefall. Bitcoin falls 15% in a week."
        ),
        "impact": "high",
        "btc_context": "Bitcoin drops to £6,800. Investors beginning to sell liquid assets for cash.",
    },
    {
        "date": "2020-03-05",
        "headline": "UK government activates emergency coronavirus plan",
        "body": (
            "The UK government activates its emergency coronavirus action plan. Italy puts 16 million "
            "people in quarantine. The number of global cases passes 100,000."
        ),
        "impact": "high",
        "btc_context": "Bitcoin drops to £6,800 from £7,500 two weeks ago.",
    },
    {
        "date": "2020-03-09",
        "headline": "Oil price crashes 30% as Saudi Arabia and Russia launch price war",
        "body": (
            "In a single day, Brent crude falls 30% after Saudi Arabia and Russia fail to agree "
            "production cuts. This is the second-largest single-day oil price fall in history. "
            "Global stock markets collapse. Bitcoin falls 10% on the same day."
        ),
        "impact": "high",
        "btc_context": "Bitcoin drops from £7,000 to £6,200. Liquidity panic beginning.",
    },
    {
        "date": "2020-03-11",
        "headline": "WHO DECLARES COVID-19 A PANDEMIC",
        "body": (
            "The World Health Organisation officially declares COVID-19 a pandemic — the first "
            "pandemic since H1N1 in 2009. This is the trigger event for global financial market "
            "collapse. The Dow Jones falls 2,352 points — its worst day since 1987."
        ),
        "impact": "critical",
        "btc_context": "Bitcoin begins rapid decline from £6,500. The crash is beginning.",
    },
    {
        "date": "2020-03-12",
        "headline": "BLACK THURSDAY — Bitcoin falls 44% in 24 hours",
        "body": (
            "March 12, 2020 is now known as Black Thursday in crypto markets. Bitcoin falls from "
            "£7,000 to £3,920 in a single 24-hour period — a 44% intraday decline. This is not "
            "driven by crypto fundamentals. Global investors needed emergency cash and sold whatever "
            "was liquid. Bitcoin was extremely liquid and was sold heavily. The BitMEX derivatives "
            "exchange liquidated over $700 million in positions in a single hour."
        ),
        "impact": "critical",
        "btc_context": "Bitcoin crashes to £3,920 — the lowest point of the entire COVID event. This is the panic bottom.",
    },
    {
        "date": "2020-03-13",
        "headline": "Bitcoin bounces to £4,355. Markets still in shock.",
        "body": (
            "Bitcoin has bounced slightly from yesterday's £3,920 low to £4,355. The FTSE 100 had "
            "its worst day since 1987 yesterday, falling 11%. Headlines are about hospital capacity "
            "and lockdowns. Crypto is barely mentioned in mainstream financial news."
        ),
        "impact": "high",
        "btc_context": "THIS IS ROUND 2 — the panic bottom decision moment.",
    },
    {
        "date": "2020-03-18",
        "headline": "UK enters national lockdown. Chancellor announces £330bn support package.",
        "body": (
            "The UK government announces a national lockdown — the most significant restriction on "
            "movement since World War Two. Chancellor Rishi Sunak announces a £330 billion "
            "government-backed loan guarantee scheme and £20 billion in direct support for businesses."
        ),
        "impact": "high",
        "btc_context": "Bitcoin stabilises around £4,500–£5,000. Stimulus narrative beginning to form.",
    },
    {
        "date": "2020-03-19",
        "headline": "Bank of England cuts rates to 0.1% — lowest in 325-year history",
        "body": (
            "The Bank of England cuts its base interest rate to 0.1% — the lowest level in its "
            "325-year history. It also launches £200 billion of additional quantitative easing. "
            "The Fed announces unlimited QE in the United States. Central banks are printing money "
            "at historic scale."
        ),
        "impact": "high",
        "btc_context": "Bitcoin recovers to £5,390. The stimulus narrative is beginning to support prices.",
    },
    {
        "date": "2020-03-27",
        "headline": "US passes $2.2 trillion CARES Act — largest stimulus package in American history",
        "body": (
            "The US Congress passes the CARES Act — a $2.2 trillion economic stimulus package "
            "including direct payments of $1,200 to most American adults. Combined with Fed "
            "unlimited QE, approximately $6 trillion in new money is being created. Bitcoin starts rising."
        ),
        "impact": "high",
        "btc_context": "Bitcoin rises above £5,500 as investors begin recognising the inflation hedge narrative.",
    },
    {
        "date": "2020-04-30",
        "headline": "Bitcoin recovers to £7,063 — almost back to pre-crash levels",
        "body": (
            "Bitcoin has fully recovered from the March crash, returning to £7,063 — almost "
            "exactly where it was before COVID hit in February. Governments worldwide have announced "
            "unprecedented stimulus packages totalling over $10 trillion. The narrative that Bitcoin "
            "is a hedge against currency debasement is gaining significant traction in financial media."
        ),
        "impact": "medium",
        "btc_context": "THIS IS ROUND 3 — the recovery decision moment.",
    },
    {
        "date": "2020-05-11",
        "headline": "Bitcoin Halving — miner reward cut in half for third time in history",
        "body": (
            "Bitcoin undergoes its third halving event. The reward for mining a new block drops "
            "from 12.5 BTC to 6.25 BTC. This reduces the new supply of Bitcoin entering the market "
            "by 50%. Historically, Bitcoin price has risen significantly in the 12–18 months "
            "following each halving."
        ),
        "impact": "medium",
        "btc_context": "Bitcoin holds above £7,000. Halving is widely seen as a positive long-term catalyst.",
    },
    {
        "date": "2020-07-21",
        "headline": "EU agrees €750 billion pandemic recovery fund",
        "body": (
            "EU leaders agree on a historic €750 billion pandemic recovery fund — the largest "
            "stimulus package in EU history. Combined with US and UK stimulus, the total global "
            "monetary response to COVID now exceeds $15 trillion. Hard-money advocates argue "
            "Bitcoin is the only asset that cannot be inflated away."
        ),
        "impact": "medium",
        "btc_context": "Bitcoin breaks out from consolidation, rising above £8,000 for the first time since the crash.",
    },
    {
        "date": "2020-07-31",
        "headline": "MicroStrategy announces first Bitcoin treasury allocation — a corporate first",
        "body": (
            "MicroStrategy, a publicly listed US business intelligence company, announces it has "
            "purchased £250 million of Bitcoin as its primary treasury reserve asset. CEO Michael "
            "Saylor describes Bitcoin as 'a dependable store of value and an attractive investment "
            "asset with more long-term appreciation potential than holding cash.' This is the first "
            "major publicly listed corporation to hold Bitcoin as a treasury asset."
        ),
        "impact": "high",
        "btc_context": "THIS IS ROUND 4 — Bitcoin at £8,625. Institutional adoption narrative begins.",
    },
    {
        "date": "2020-08-11",
        "headline": "MicroStrategy buys another $175 million of Bitcoin",
        "body": (
            "MicroStrategy announces a second Bitcoin purchase, bringing its total holdings to over "
            "$425 million. Michael Saylor tweets: 'Bitcoin is a swarm of cyber hornets serving the "
            "goddess of wisdom, feeding on the fire of truth, exponentially growing ever smarter, "
            "harder, and faster.' The institutional adoption narrative is accelerating."
        ),
        "impact": "medium",
        "btc_context": "Bitcoin holds above £8,500 despite summer consolidation.",
    },
    {
        "date": "2020-09-14",
        "headline": "Square purchases $50 million of Bitcoin for its corporate treasury",
        "body": (
            "Square, the payments company co-founded by Twitter CEO Jack Dorsey, announces it has "
            "purchased approximately 4,709 Bitcoin — representing 1% of its total assets — as an "
            "investment. MicroStrategy and now Square are establishing a pattern of corporate "
            "Bitcoin treasury allocation."
        ),
        "impact": "medium",
        "btc_context": "Bitcoin recovers from September dip, back above £8,000.",
    },
    {
        "date": "2020-10-08",
        "headline": "PayPal announces Bitcoin buying and selling for all US users",
        "body": (
            "PayPal announces it will allow its 346 million users to buy, hold and sell Bitcoin "
            "and other cryptocurrencies directly through its platform. This is the largest mainstream "
            "financial platform to offer crypto to date. PayPal will also enable Bitcoin payments "
            "at its 26 million merchants."
        ),
        "impact": "high",
        "btc_context": "Bitcoin surges above £9,000 on the PayPal news.",
    },
    {
        "date": "2020-10-21",
        "headline": "PayPal officially launches crypto service. Bitcoin breaks £10,000.",
        "body": (
            "PayPal officially launches its cryptocurrency service for US users. Bitcoin breaks "
            "above £10,000 for the first time since the 2017 bull market — a major psychological "
            "level. The combination of institutional buyers, PayPal, and the halving is creating "
            "a perfect storm for price appreciation."
        ),
        "impact": "high",
        "btc_context": "Bitcoin breaks £10,000 — its highest level since the 2017 all-time high.",
    },
    {
        "date": "2020-10-31",
        "headline": "Bitcoin holds above £10,000. Institutional demand accelerating.",
        "body": (
            "Bitcoin is holding firmly above £10,000 — the first sustained break of this level "
            "since the 2017 bull market. Grayscale Bitcoin Trust is buying Bitcoin at a rate that "
            "exceeds daily mining production. The narrative has shifted from 'digital gold' to "
            "'institutional asset class.' Retail FOMO is beginning to build."
        ),
        "impact": "high",
        "btc_context": "THIS IS ROUND 5 — Bitcoin at £10,615. Final decision moment before the parabolic run.",
    },
    {
        "date": "2020-11-03",
        "headline": "Joe Biden wins US presidential election",
        "body": (
            "Joe Biden wins the US presidential election, defeating incumbent Donald Trump. Markets "
            "rally on expectations of additional fiscal stimulus. Bitcoin continues its bull run — "
            "political uncertainty resolved."
        ),
        "impact": "medium",
        "btc_context": "Bitcoin holds above £10,500. Political uncertainty removed.",
    },
    {
        "date": "2020-11-20",
        "headline": "Bitcoin surpasses its 2017 all-time high for the first time",
        "body": (
            "Bitcoin surpasses $20,000 — its all-time high from the 2017 bull market — for the "
            "first time. This is a historic milestone. Every person who has ever bought Bitcoin is "
            "now in profit for the first time since December 2017. Mainstream media coverage "
            "explodes. Retail FOMO is at maximum."
        ),
        "impact": "critical",
        "btc_context": "Bitcoin exceeds £14,810 — new all-time high in GBP terms.",
    },
    {
        "date": "2020-12-16",
        "headline": "MicroStrategy issues $650 million bonds to buy more Bitcoin",
        "body": (
            "MicroStrategy issues $650 million in convertible senior notes specifically to buy more "
            "Bitcoin. The company now holds over 70,000 Bitcoin. This is the first time a public "
            "company has issued debt specifically to buy a digital asset."
        ),
        "impact": "medium",
        "btc_context": "Bitcoin accelerates above £16,000. Institutional buying at scale.",
    },
    {
        "date": "2020-12-31",
        "headline": "Bitcoin ends 2020 at £21,215 — up 300% on the year",
        "body": (
            "Bitcoin closes 2020 at £21,215 — a 168% gain from its February pre-COVID level of "
            "£7,920, and a 441% gain from its March crash low of £3,920. The year that started "
            "with a pandemic-induced 44% crash has ended with Bitcoin at its highest price ever. "
            "Anyone who bought at the March low and held has nearly quintupled their money in "
            "nine months."
        ),
        "impact": "critical",
        "btc_context": "SCENARIO END — Bitcoin at £21,215. The final reference price.",
    },
]


LUNA_NEWS_EVENTS = [
    {
        "date": "2022-01-01",
        "headline": "LUNA/Terra ecosystem soaring — algorithmic stablecoin UST hits $10B market cap",
        "body": (
            "Terra's LUNA token begins 2022 at £62, up 14,000% from its 2020 lows. The Terra "
            "ecosystem's algorithmic stablecoin UST has reached a $10 billion market cap, making "
            "it the 4th largest stablecoin globally. UST maintains its $1 peg through a mint-and-burn "
            "mechanism: to create 1 UST, you burn $1 worth of LUNA; to redeem, you burn 1 UST for "
            "$1 of LUNA. The Anchor Protocol offers a fixed 20% annual yield on UST deposits."
        ),
        "impact": "medium",
        "btc_context": "LUNA at £62. Strong fundamentals narrative. This is the scenario starting position.",
    },
    {
        "date": "2022-01-21",
        "headline": "Broad crypto market correction — LUNA drops 40% with the market",
        "body": (
            "The crypto market experiences a sharp correction driven by US Federal Reserve hawkish "
            "signals and risk-off sentiment. Bitcoin falls 20%, Ethereum 30%, and LUNA follows down "
            "40% from its peak. LUNA quickly recovers as on-chain fundamentals remain strong — "
            "UST stablecoin demand continues to grow despite the price dip."
        ),
        "impact": "medium",
        "btc_context": "LUNA drops to £38 briefly before recovering. Buy-the-dip narrative strong.",
    },
    {
        "date": "2022-02-10",
        "headline": "Luna Foundation Guard established — announces plan for $10B Bitcoin reserve",
        "body": (
            "Do Kwon, founder of Terraform Labs, establishes the Luna Foundation Guard (LFG) as a "
            "non-profit to defend the UST peg in times of stress. LFG announces plans to accumulate "
            "$10 billion in Bitcoin as a reserve backing for UST — a significant confidence signal. "
            "Critics note this is an admission that the algorithmic peg mechanism alone may be "
            "insufficient during extreme market stress."
        ),
        "impact": "high",
        "btc_context": "LUNA at £55. LFG announcement seen as bullish — institutional-grade backing.",
    },
    {
        "date": "2022-03-22",
        "headline": "LUNA near all-time high at £87 — UST market cap reaches $15 billion",
        "body": (
            "LUNA reaches a near all-time high of £87 ($119), making it the 9th largest "
            "cryptocurrency by market cap. The Terra ecosystem's UST stablecoin has reached $15 "
            "billion in market cap. Do Kwon is celebrated as a visionary. The Anchor Protocol "
            "continues paying 20% APY on UST deposits — financed by LFG reserves. "
            "Some economists begin questioning whether 20% yield is sustainable long-term."
        ),
        "impact": "high",
        "btc_context": "THIS IS DECISION 1 — LUNA near ATH. Should you buy in or wait?",
    },
    {
        "date": "2022-04-01",
        "headline": "Terra becomes 2nd largest DeFi ecosystem by Total Value Locked",
        "body": (
            "The Terra ecosystem surpasses BNB Chain to become the 2nd largest DeFi ecosystem "
            "globally, with $28 billion in Total Value Locked. The majority of this is in the "
            "Anchor Protocol. Independent analysts note that Anchor's 20% yield is being subsidised "
            "from reserves rather than generated from real lending demand — a model that requires "
            "constant new capital inflows to sustain."
        ),
        "impact": "medium",
        "btc_context": "LUNA at £75. Growth metrics impressive but sustainability questions growing.",
    },
    {
        "date": "2022-04-07",
        "headline": "Luna Foundation Guard raises $1 billion in BTC for UST reserve",
        "body": (
            "The Luna Foundation Guard announces it has raised over $1 billion worth of Bitcoin "
            "through a private token sale to major crypto investors including Jump Crypto, Three "
            "Arrows Capital, and Alameda Research. LFG now holds approximately 30,000 BTC — "
            "representing the 3rd largest Bitcoin treasury of any organisation globally. "
            "LFG states it will continue accumulating until it holds $10B in reserves."
        ),
        "impact": "high",
        "btc_context": "LUNA at £72. Bitcoin reserve news widely seen as a major legitimacy upgrade.",
    },
    {
        "date": "2022-04-22",
        "headline": "LFG Bitcoin reserve exceeds $3 billion. Do Kwon: 'UST is now the safest stablecoin.'",
        "body": (
            "The Luna Foundation Guard's Bitcoin reserve grows to over $3 billion — 80,000+ BTC. "
            "Do Kwon tweets that UST is now 'the safest and most decentralised stablecoin in "
            "existence.' Anchor Protocol's TVL hits $17 billion. Crypto Twitter is overwhelmingly "
            "bullish. Few voices raise concerns about the circular logic: LUNA price supports UST, "
            "and UST demand supports LUNA price."
        ),
        "impact": "medium",
        "btc_context": "LUNA at £62. Market confident. Reserve build-up seen as unambiguously positive.",
    },
    {
        "date": "2022-05-01",
        "headline": "UST market cap hits $18 billion — now the 3rd largest stablecoin globally",
        "body": (
            "UST reaches $18 billion in market cap, overtaking Binance USD (BUSD) to become the "
            "3rd largest stablecoin, behind only USDT and USDC. Anchor Protocol holds $17 billion "
            "in UST deposits paying 20% yield. This yield is funded by LFG's reserve drawdowns at "
            "a rate of approximately $5 million per day. At the current burn rate, reserves "
            "supporting the yield will be exhausted in months — but inflows are still growing."
        ),
        "impact": "medium",
        "btc_context": "THIS IS DECISION 2 — LUNA at £52. Peak adoption narrative. Warning signs emerging.",
    },
    {
        "date": "2022-05-07",
        "headline": "Large UST withdrawals begin from Anchor — peg shows first stress",
        "body": (
            "Over 72 hours, approximately $2 billion is withdrawn from Anchor Protocol. This is "
            "the largest sustained outflow in UST history. The withdrawals are linked to several "
            "large wallet addresses that researchers later identify as co-ordinated. The UST peg "
            "briefly falls to $0.987 — the first meaningful depeg in months. LFG states it will "
            "defend the peg using its Bitcoin reserve. LUNA falls 10% on the news."
        ),
        "impact": "high",
        "btc_context": "LUNA drops to £34 intraday. This is the first clear warning sign.",
    },
    {
        "date": "2022-05-08",
        "headline": "UST depegs to $0.985. LFG begins deploying Bitcoin reserve.",
        "body": (
            "UST falls to $0.985 — officially triggering LFG's intervention protocol. LFG begins "
            "selling Bitcoin from its $3B reserve to buy UST and restore the peg. Do Kwon tweets: "
            "'Deploying more capital. Hold the line.' The LUNA price falls a further 20% as the "
            "market realises the reserve is limited. Algorithmic traders begin probing the peg "
            "with increasing sell pressure. On-chain data shows UST is being sold faster than "
            "LFG can absorb it."
        ),
        "impact": "critical",
        "btc_context": "LUNA at £28. Peg defence underway but confidence is cracking.",
    },
    {
        "date": "2022-05-09",
        "headline": "UST LOSING PEG — falls to $0.92. LUNA -25%. Death spiral mechanism activating.",
        "body": (
            "UST falls to $0.92. The algorithmic stabilisation mechanism — which mints new LUNA to "
            "buy UST — begins activating at scale. This means LUNA supply is expanding rapidly, "
            "which causes LUNA price to fall further, which means each newly minted LUNA buys less "
            "UST, which causes UST to fall further, which mints more LUNA... The death spiral "
            "dynamic is mathematically confirmed. LFG's Bitcoin reserve is being depleted rapidly. "
            "Crypto Twitter panicking."
        ),
        "impact": "critical",
        "btc_context": "LUNA at £19. STRUCTURAL SIGNAL ACTIVE — algorithmic death spiral beginning.",
    },
    {
        "date": "2022-05-10",
        "headline": "LUNA -65% in 24 hours. UST at $0.72. LFG reserve nearly exhausted.",
        "body": (
            "LUNA falls 65% in a single day. UST has fallen to $0.72. The Luna Foundation Guard "
            "has now deployed almost its entire $3 billion Bitcoin reserve in an attempt to defend "
            "the peg. The Bitcoin reserve is nearly gone — and it made no difference. The "
            "algorithmic mint mechanism has now produced over 1 billion new LUNA tokens, "
            "up from 350 million at the start of the week. The LUNA supply is hyperinflating."
        ),
        "impact": "critical",
        "btc_context": "LUNA at £7. Essentially unsalvageable. The question is when to exit.",
    },
    {
        "date": "2022-05-11",
        "headline": "LUNA supply up 10,000x in 72 hours. UST at $0.40. Death spiral confirmed.",
        "body": (
            "The LUNA token supply has exploded from 350 million to 3.5 trillion tokens in 72 "
            "hours — a 10,000-fold increase — as the algorithm desperately mints LUNA to buy UST. "
            "UST is at $0.40. Do Kwon tweets 'I am heartbroken' and announces the Terra team is "
            "working on a rescue plan. Anchor Protocol is being emptied by panicking depositors. "
            "The rescue plan has no credibility. $40 billion in market value is evaporating."
        ),
        "impact": "critical",
        "btc_context": "LUNA at £0.50. Effectively terminal. DEATH SPIRAL CONFIRMED.",
    },
    {
        "date": "2022-05-12",
        "headline": "Terra halts blockchain. LUNA -99.9% from ATH. UST at $0.10.",
        "body": (
            "The Terra blockchain is halted to prevent governance attacks as LUNA's supply "
            "hyperinflates past 6.5 trillion tokens. UST is at $0.10. The halt lasted several "
            "hours before resuming. $40 billion in combined LUNA and UST market cap has been "
            "destroyed in five days — one of the fastest wealth destructions in financial history. "
            "Celsius Network and Three Arrows Capital, two major institutional crypto firms, "
            "are later revealed to have held massive LUNA/UST positions."
        ),
        "impact": "critical",
        "btc_context": "LUNA at £0.06. Near zero. 99.9% decline from ATH of £87.",
    },
    {
        "date": "2022-05-13",
        "headline": "Terra blockchain halted again. LUNA effectively worthless. Terminal.",
        "body": (
            "Terra halts its blockchain a second time. LUNA is trading at fractions of a penny — "
            "effectively worthless. The entire $18 billion UST stablecoin has been destroyed. "
            "The algorithmic mechanism that was supposed to maintain stability has instead "
            "accelerated collapse. Terraform Labs confirms the protocol has failed. Do Kwon "
            "announces a proposal to fork the blockchain and create Terra 2.0 — abandoning UST "
            "entirely. The original LUNA is over."
        ),
        "impact": "critical",
        "btc_context": "LUNA at sub-penny. TERMINAL — blockchain halted. Algorithm has failed completely.",
    },
    {
        "date": "2022-05-16",
        "headline": "Do Kwon proposes Terra 2.0 — a new chain without the algorithmic stablecoin",
        "body": (
            "Do Kwon publishes a recovery proposal: a new Terra blockchain (Terra 2.0) will be "
            "created without the UST algorithmic stablecoin mechanism. Existing LUNA holders will "
            "receive new LUNA tokens via airdrop. The proposal represents a complete abandonment "
            "of the original Terra thesis. Most serious market participants view the new chain as "
            "having minimal credibility. The original LUNA (to be renamed LUNC) is treated "
            "as effectively dead."
        ),
        "impact": "medium",
        "btc_context": "LUNA sub-penny. Terra 2.0 plan is largely dismissed by major investors.",
    },
    {
        "date": "2022-05-18",
        "headline": "US Senate proposes stablecoin regulation. SEC confirms investigation into Terra.",
        "body": (
            "US senators introduce the Stablecoin Transparency Act, citing the Terra/LUNA collapse "
            "as evidence of the systemic risk posed by unregulated algorithmic stablecoins. The SEC "
            "confirms an active investigation into Terraform Labs and Do Kwon. The collapse has "
            "become a global regulatory flashpoint. Celsius Network freezes withdrawals — its "
            "exposure to LUNA/UST contributes to liquidity problems."
        ),
        "impact": "high",
        "btc_context": "LUNA near zero. Regulatory and legal aftermath beginning.",
    },
    {
        "date": "2022-05-20",
        "headline": "Terra 2.0 proposal passes on-chain community vote",
        "body": (
            "The Terra community votes to approve the Terra 2.0 proposal by 65.5% in favour. "
            "The new chain will airdrop new LUNA tokens to existing holders based on snapshot "
            "dates before and during the collapse. Critics note that the vote is meaningless — "
            "the vast majority of new 'voters' are entities that minted LUNA during the "
            "hyperinflation and therefore hold billions of nearly worthless tokens. The contagion "
            "from the collapse is spreading: Three Arrows Capital is insolvent."
        ),
        "impact": "medium",
        "btc_context": "LUNA near zero. Contagion spreading to 3AC, Celsius, BlockFi.",
    },
    {
        "date": "2022-05-21",
        "headline": "$50 billion in value destroyed. Contagion spreading to major crypto lenders.",
        "body": (
            "Post-mortem analysis confirms over $50 billion in combined LUNA and UST market cap "
            "was destroyed in the collapse — one of the largest financial losses in crypto history. "
            "Three Arrows Capital (3AC) is confirmed to have lost hundreds of millions. Celsius "
            "Network has suspended withdrawals. BlockFi requires emergency financing. The collapse "
            "has triggered a broader crypto bear market. Bitcoin falls below $30,000."
        ),
        "impact": "high",
        "btc_context": "LUNA near zero. The $50B destruction is triggering a broader crypto market collapse.",
    },
    {
        "date": "2022-05-25",
        "headline": "Original Terra chain renamed 'Terra Classic'. LUNC symbol adopted.",
        "body": (
            "The original Terra blockchain is formally renamed 'Terra Classic' as the community "
            "prepares for the Terra 2.0 launch. The original LUNA token is renamed LUNC (Luna "
            "Classic). Terraform Labs effectively ceases to support the original chain. LUNC trades "
            "at a fraction of a penny with a supply of 6.9 trillion tokens. The lesson is stark: "
            "algorithmic stablecoins backed only by reflexive price mechanisms cannot survive a "
            "bank run."
        ),
        "impact": "medium",
        "btc_context": "LUNC (formerly LUNA) sub-penny. Near zero forever.",
    },
    {
        "date": "2022-05-27",
        "headline": "Terra 2.0 (new LUNA) launches. Original LUNA = LUNC, essentially worthless.",
        "body": (
            "Terra 2.0 launches with a new LUNA token distributed via airdrop to former holders. "
            "The new chain has no algorithmic stablecoin. The original LUNA (now LUNC) is "
            "effectively abandoned by Terraform Labs and trades at near zero. "
            "Investors who held LUNA through the collapse have lost nearly everything. "
            "Those who sold before May 9 preserved their capital. The lesson: when the "
            "fundamental mechanism of an asset depends on reflexive demand, collapse can be "
            "total and instantaneous."
        ),
        "impact": "critical",
        "btc_context": "SCENARIO END — Original LUNA (LUNC) near zero. A complete loss from ATH.",
    },
]


def _fetch_raw_hourly(coin_symbol: str, tsym: str, start_unix: int, end_unix: int, stdout=None, prefix="") -> list:
    url = "https://min-api.cryptocompare.com/data/v2/histohour"
    rows = []
    current_to = end_unix
    request_count = 0

    while True:
        params = {
            "fsym": coin_symbol,
            "tsym": tsym,
            "limit": 2000,
            "toTs": current_to,
        }
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if data.get("Response") != "Success":
            raise ValueError(f"CryptoCompare error: {data.get('Message', 'Unknown error')}")

        page = data["Data"]["Data"]
        request_count += 1

        if stdout and page:
            s = datetime.fromtimestamp(page[0]["time"],  tz=timezone.utc).strftime("%Y-%m-%d")
            e = datetime.fromtimestamp(page[-1]["time"], tz=timezone.utc).strftime("%Y-%m-%d")
            stdout.write(f"  {prefix}Request {request_count}: {s} to {e} ({len(page)} candles)")

        for row in page:
            ts = int(row["time"])
            if ts < start_unix or ts > end_unix:
                continue
            rows.append({
                "ts":         ts,
                "open":       float(row["open"]),
                "high":       float(row["high"]),
                "low":        float(row["low"]),
                "close":      float(row["close"]),
                "volumefrom": float(row.get("volumefrom", 0)),
            })

        earliest_ts = data["Data"].get("TimeFrom", current_to)
        if earliest_ts <= start_unix:
            break

        current_to = earliest_ts - 3600
        if current_to < start_unix:
            break

        time.sleep(0.8)

    rows.sort(key=lambda r: r["ts"])
    return rows


def _rows_to_candle_dicts(rows: list) -> list:
    candles = []
    for row in rows:
        o, h, l, c = row["open"], row["high"], row["low"], row["close"]
        candles.append({
            "date": datetime.fromtimestamp(row["ts"], tz=timezone.utc),
            "open_pence":  max(1, int(o * 100)),
            "high_pence":  max(1, int(h * 100)),
            "low_pence":   max(1, int(l * 100)),
            "close_pence": max(1, int(c * 100)),
            "open_micropence":  int(o * 10_000),
            "close_micropence": int(c * 10_000),
            "volume": int(row["volumefrom"] * 100_000_000),
        })
    return candles


def fetch_hourly_gbp(coin_symbol: str, start_unix: int, end_unix: int, stdout=None) -> list:
    if stdout:
        stdout.write(f"  Trying {coin_symbol}/GBP direct...")

    rows = _fetch_raw_hourly(coin_symbol, "GBP", start_unix, end_unix, stdout=stdout,
                             prefix=f"{coin_symbol}/GBP ")


    non_zero = [r for r in rows if r["close"] > 0]
    if non_zero:
        if stdout:
            stdout.write(f"  Direct GBP data available ({len(non_zero)} non-zero rows).")
        return _rows_to_candle_dicts(rows)


    if stdout:
        stdout.write(f"  No direct GBP data — fetching {coin_symbol}/USD + USD/GBP for conversion...")

    usd_rows  = _fetch_raw_hourly(coin_symbol, "USD", start_unix, end_unix, stdout=stdout,
                                  prefix=f"{coin_symbol}/USD ")
    time.sleep(1)
    gbp_rows  = _fetch_raw_hourly("USD", "GBP", start_unix, end_unix, stdout=stdout,
                                  prefix="USD/GBP ")


    gbp_by_ts: dict[int, dict] = {r["ts"]: r for r in gbp_rows}

    converted = []
    for usd in usd_rows:
        ts = usd["ts"]
        if ts not in gbp_by_ts:
            continue
        fx = gbp_by_ts[ts]

        fx_close = fx["close"] if fx["close"] > 0 else 1.0
        converted.append({
            "ts":         ts,
            "open":       usd["open"]  * fx_close,
            "high":       usd["high"]  * fx_close,
            "low":        usd["low"]   * fx_close,
            "close":      usd["close"] * fx_close,
            "volumefrom": usd["volumefrom"],
        })

    if stdout:
        stdout.write(f"  Converted {len(converted)} candles via USD/GBP rate.")

    return _rows_to_candle_dicts(converted)


class Command(BaseCommand):

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
        )
        parser.add_argument(
            "--scenario",
            type=int,
            choices=[1, 2],
            default=None,
        )

    def handle(self, *args, **options):
        target = options["scenario"]
        seed_s1 = target is None or target == 1
        seed_s2 = target is None or target == 2

        if seed_s1:
            self._seed_scenario_1(reset=options["reset"])
        if seed_s2:
            self._seed_scenario_2(reset=options["reset"])


    def _seed_scenario_1(self, reset: bool) -> None:
        self.stdout.write("\n=== Scenario 1: The COVID Crash ===")

        if reset:
            deleted, _ = ReplayScenario.objects.filter(order=1).delete()
            self.stdout.write(f"Deleted {deleted} existing scenario(s) and all related data.")

        scenario, created = ReplayScenario.objects.get_or_create(
            order=1,
            defaults={
                "title": "The COVID Crash",
                "subtitle": "February–December 2020: pandemic, panic, and the fastest recovery in Bitcoin's history.",
                "asset_symbol": "BTC",
                "asset_name": "Bitcoin",
                "historical_start_date": date(2019, 10, 1),
                "historical_end_date": date(2020, 12, 31),
                "accent_color": "#E8354A",
                "lesson_tag": "Crisis & Recovery",
                "difficulty": "Intermediate",
                "real_event_reference": (
                    "Bitcoin fell 44% in a single day on March 12, 2020 (Black Thursday) as "
                    "global investors sold liquid assets for cash. It then rose 441% from the low "
                    "by December 31, 2020, driven by unprecedented central bank stimulus and "
                    "institutional adoption."
                ),
                "is_active": True,
            },
        )

        if not created:
            self.stdout.write(
                self.style.WARNING(
                    f"Scenario 1 already exists (id={scenario.id}). Use --reset to re-seed. Skipping."
                )
            )
            return

        self.stdout.write(f"Created scenario: {scenario.title} (id={scenario.id})")


        self.stdout.write("\nFetching real BTC/GBP hourly data from CryptoCompare...")
        self.stdout.write("(Public API, no key required. ~6 requests, ~10 seconds.)\n")

        start_unix = int(datetime(2019, 10, 1, tzinfo=timezone.utc).timestamp())
        end_unix   = int(datetime(2020, 12, 31, 23, tzinfo=timezone.utc).timestamp())

        try:
            hourly_candles = fetch_hourly_gbp("BTC", start_unix, end_unix, stdout=self.stdout)
        except Exception as exc:
            self.stdout.write(self.style.ERROR(f"\nCryptoCompare fetch failed: {exc}"))
            scenario.delete()
            return

        self.stdout.write(f"\nFetched {len(hourly_candles)} hourly candles from CryptoCompare.")

        candle_objects = [
            ReplayCandle(
                scenario=scenario,
                date=c["date"],
                open_pence=c["open_pence"],
                high_pence=c["high_pence"],
                low_pence=c["low_pence"],
                close_pence=c["close_pence"],
                volume=c["volume"],
                open_micropence=c["open_micropence"],
                close_micropence=c["close_micropence"],
            )
            for c in hourly_candles
        ]
        ReplayCandle.objects.bulk_create(candle_objects, ignore_conflicts=True)
        self.stdout.write(f"Seeded {len(candle_objects)} hourly candles.")


        march12_candles = ReplayCandle.objects.filter(
            scenario=scenario,
            date__date=date(2020, 3, 12),
        )
        if march12_candles.exists():
            low = min(c.close_pence for c in march12_candles)
            self.stdout.write(
                f"  March 12 2020 intraday low close: £{low / 100:.2f} "
                f"(expected near £3,920)"
            )


        news_objs = [
            ReplayNewsEvent(
                scenario=scenario,
                date=date.fromisoformat(e["date"]),
                headline=e["headline"],
                body=e["body"],
                impact=e["impact"],
                btc_context=e["btc_context"],
            )
            for e in COVID_NEWS_EVENTS
        ]
        ReplayNewsEvent.objects.bulk_create(news_objs)
        self.stdout.write(f"Seeded {len(news_objs)} news events.")

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone. Scenario 1 seeded: {len(candle_objects)} hourly candles, "
                f"{len(news_objs)} news events."
            )
        )


    def _seed_scenario_2(self, reset: bool) -> None:
        self.stdout.write("\n=== Scenario 2: The Luna Collapse ===")

        if reset:
            deleted, _ = ReplayScenario.objects.filter(order=2).delete()
            self.stdout.write(f"Deleted {deleted} existing scenario(s) and all related data.")

        scenario, created = ReplayScenario.objects.get_or_create(
            order=2,
            defaults={
                "title": "The Luna Collapse",
                "subtitle": "January–May 2022: the $50 billion algorithmic stablecoin death spiral.",
                "asset_symbol": "LUNA",
                "asset_name": "Terra Luna",
                "historical_start_date": date(2022, 1, 1),
                "historical_end_date": date(2022, 5, 27),
                "accent_color": "#F5A623",
                "lesson_tag": "Algorithmic Collapse",
                "difficulty": "Advanced",
                "real_event_reference": (
                    "LUNA fell from £87 to near zero in five days in May 2022. The Terra "
                    "ecosystem's $18 billion algorithmic stablecoin UST lost its $1 peg, "
                    "triggering a death spiral that destroyed $50 billion in value. "
                    "Investors who understood the circular dependency between UST and LUNA "
                    "sold early. Those who did not lost everything."
                ),
                "is_active": True,
            },
        )

        if not created:
            self.stdout.write(
                self.style.WARNING(
                    f"Scenario 2 already exists (id={scenario.id}). Use --reset to re-seed. Skipping."
                )
            )
            return

        self.stdout.write(f"Created scenario: {scenario.title} (id={scenario.id})")


        self.stdout.write("\nFetching real LUNC (Terra Luna) hourly data from CryptoCompare...")
        self.stdout.write("(Public API, no key required. ~6-8 requests, ~15 seconds.)\n")

        start_unix = int(datetime(2022, 1, 1, tzinfo=timezone.utc).timestamp())
        end_unix   = int(datetime(2022, 5, 27, 23, tzinfo=timezone.utc).timestamp())

        try:
            hourly_candles = fetch_hourly_gbp("LUNC", start_unix, end_unix, stdout=self.stdout)
        except Exception as exc:
            self.stdout.write(self.style.ERROR(f"\nLUNC fetch failed: {exc}"))
            self.stdout.write(
                self.style.ERROR(
                    "Tip: check your internet connection and try again in a few minutes."
                )
            )
            scenario.delete()
            return

        self.stdout.write(f"\nFetched {len(hourly_candles)} hourly candles from CryptoCompare.")

        if not hourly_candles:
            self.stdout.write(self.style.ERROR("No candles returned. Aborting."))
            scenario.delete()
            return

        candle_objects = [
            ReplayCandle(
                scenario=scenario,
                date=c["date"],
                open_pence=c["open_pence"],
                high_pence=c["high_pence"],
                low_pence=c["low_pence"],
                close_pence=c["close_pence"],
                volume=c["volume"],
                open_micropence=c["open_micropence"],
                close_micropence=c["close_micropence"],
            )
            for c in hourly_candles
        ]
        ReplayCandle.objects.bulk_create(candle_objects, ignore_conflicts=True)
        self.stdout.write(f"Seeded {len(candle_objects)} hourly candles.")


        may9_candles = ReplayCandle.objects.filter(
            scenario=scenario,
            date__date=date(2022, 5, 9),
        )
        if may9_candles.exists():
            low = min(c.close_pence for c in may9_candles)
            self.stdout.write(
                f"  May 9 2022 intraday low close: £{low / 100:.2f} "
                f"(expected ~£19)"
            )

        may13_candles = ReplayCandle.objects.filter(
            scenario=scenario,
            date__date=date(2022, 5, 13),
        )
        if may13_candles.exists():
            low = min(c.close_micropence for c in may13_candles)
            self.stdout.write(
                f"  May 13 2022 intraday low close (micropence): {low} "
                f"(expected near 0 — sub-penny collapse)"
            )


        news_objs = [
            ReplayNewsEvent(
                scenario=scenario,
                date=date.fromisoformat(e["date"]),
                headline=e["headline"],
                body=e["body"],
                impact=e["impact"],
                btc_context=e["btc_context"],
            )
            for e in LUNA_NEWS_EVENTS
        ]
        ReplayNewsEvent.objects.bulk_create(news_objs)
        self.stdout.write(f"Seeded {len(news_objs)} news events.")

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone. Scenario 2 seeded: {len(candle_objects)} hourly candles, "
                f"{len(news_objs)} news events."
            )
        )
