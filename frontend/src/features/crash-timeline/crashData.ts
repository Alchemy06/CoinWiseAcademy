import type { CrashScenario } from "./types";

export const CRASHES: CrashScenario[] = [
  {
    id: "covid",
    number: 1,
    navLabel: "COVID Crash",
    title: "The COVID Crash",
    subtitle: "Black Thursday and the bull run that followed.",
    asset: "BTC/GBP",
    dateRangeLabel: "Feb 2020 – Dec 2020",
    openingQuote:
      "On March 12, 2020, a 28-year-old nurse in Manchester who had invested £2,000 in Bitcoin three months earlier opened her phone and saw her balance had dropped to £1,100. By the end of the day it was £940. She had done nothing wrong. The world had simply changed.",
    dropPercent: "-47%",
    priceRange: "£7,900 → £4,230",
    timeframe: "in 4 months · March 12, 2020",
    recoveryPill: { text: "Recovered: +441% by Dec 2020", type: "green" },
    stages: [
      {
        number: 1,
        title: "The Setup",
        dateRange: "Oct 2019 – Feb 2020",
        narrative:
          "Bitcoin had been climbing steadily since the lows of 2018. By February 2020 it was sitting at approximately £7,500 — up from a low of around £2,700 eighteen months earlier. The mainstream financial press was starting to pay attention again. A new narrative was forming around Bitcoin as a hedge against monetary debasement — a story that would eventually drive the 2020-2021 bull run.\n\nMost retail investors who bought during this period felt like they had made a smart decision. The chart was going up. Nothing felt dangerous.",
        timestamp: {
          date: "February 14, 2020",
          context: "BTC at £7,920 · Sentiment: Cautiously bullish · Fear & Greed: 61 (Greed)",
        },
        isClimax: false,
      },
      {
        number: 2,
        title: "The Trigger",
        dateRange: "Feb 24 – Mar 11, 2020",
        narrative:
          "COVID-19 had been spreading since January but Western markets were treating it as a distant problem. On February 24 the S&P 500 fell 3.4% in a single day as Italy reported a surge in cases. Bitcoin fell in sympathy — down 5% to around £7,100. Over the following two weeks global equity markets entered the fastest correction in financial history. The Dow Jones fell 10% in a single week. Investors began to panic.\n\nMost retail Bitcoin investors did not understand why Bitcoin was falling. They believed Bitcoin was uncorrelated with traditional markets — a safe haven that would rise when stocks fell. What they did not know was that Bitcoin is extremely liquid and that in a genuine financial panic, liquidity is exactly what people need. When everyone needs cash simultaneously, they sell whatever they can sell quickly. Bitcoin was easy to sell.",
        timestamp: {
          date: "March 11, 2020",
          context: "WHO declares pandemic · FTSE 100 falls 11% in one day · BTC at £6,500 · Fear & Greed: 8 (Extreme Fear)",
        },
        isClimax: false,
      },
      {
        number: 3,
        title: "Black Thursday",
        dateRange: "March 12, 2020",
        narrative:
          "This is the day. Bitcoin fell from approximately £7,000 to £3,920 in a single 24-hour period — a 44% intraday decline. It is now known as Black Thursday in crypto markets.\n\nThree specific things happened simultaneously that made this crash uniquely severe for crypto. First, a global margin call cascade. Investors who had borrowed money to buy Bitcoin were automatically liquidated when prices fell below maintenance margin. These forced liquidations created more selling pressure which triggered more liquidations in a self-reinforcing spiral.\n\nSecond, the BitMEX exchange — one of the largest crypto derivatives platforms at the time — suffered a network overload during the panic. Order books became unreliable. Some liquidations executed at prices far below market rates. Approximately $700 million in positions were liquidated in a single hour.\n\nThird, stablecoin redemptions. Investors trying to exit crypto were converting to USDT and USDC. The surge in redemption demand created temporary price dislocations across every major exchange.\n\nSomeone who had put their £5,000 Christmas bonus into Bitcoin in January had £2,760 left by the end of the day. These are not hypothetical figures — they are the mathematical outcome of the real price movement applied to common retail investment amounts.",
        timestamp: {
          date: "March 12, 2020",
          context: "BTC crashes to £3,920 · The single worst day in Bitcoin's history to that point",
        },
        isClimax: true,
      },
      {
        number: 4,
        title: "The Recovery",
        dateRange: "Mar 13 – Dec 2020",
        narrative:
          "The day after Black Thursday, Bitcoin bounced to approximately £4,355. Over the following weeks it continued recovering as governments around the world announced stimulus packages at historically unprecedented scale.\n\nThe Bank of England cut rates to 0.1% — the lowest in its 325-year history. The US Federal Reserve announced unlimited quantitative easing. The US Congress passed a $2.2 trillion stimulus bill. The European Central Bank launched a €750 billion emergency bond programme. In total, governments and central banks created approximately $15 trillion in new money in 2020.\n\nMicroStrategy put £250 million of corporate treasury into Bitcoin. Square purchased 4,709 Bitcoin. PayPal announced it would allow its 346 million users to buy, hold, and sell crypto. By December 31, 2020, Bitcoin closed the year at £21,215 — a 441% gain from the March crash low.",
        timestamp: {
          date: "December 31, 2020",
          context: "BTC at £21,215 · Up 441% from the crash low · Fear & Greed: 79 (Greed)",
        },
        isClimax: false,
      },
    ],
    whatWentWrong:
      "The primary mistake was selling during the crash. Watching a number fall while every headline said the world was ending was psychologically unbearable. Investors who sold on March 12 at £4,230 locked in their loss — then watched Bitcoin recover to £21,215 just months later.\n\nA second mistake was misunderstanding the asset. Many had seen Bitcoin as a safe haven. When it fell faster than stocks and gold, they lost confidence and sold. What they missed: the safe-haven narrative was just beginning to be tested.\n\nA third mistake was position sizing. Investors who had put more money into Bitcoin than they could emotionally afford to lose were forced out by psychological pressure rather than financial necessity.",
    whenToSell:
      "There was no clean, obvious exit signal. The investors who came out well either bought at the low or held through it — not those who tried to time the exit and re-entry.\n\nThe one signal that existed: the BitMEX basis — the premium between Bitcoin futures and spot prices — went deeply negative in the days before the crash. This indicated large-scale hedging by sophisticated investors. Most retail investors do not track this metric.\n\nWhat you could have done differently was not a timing decision but a sizing decision. If you had invested only an amount you could genuinely afford to lose — psychologically and financially — you would not have needed to sell.",
    consequences: {
      scenarios: [
        { label: "Sold at crash low", value: "£2,760", type: "red", caption: "from £5,200" },
        { label: "Held through", value: "£13,384", type: "green", caption: "from £5,200" },
        { label: "Bought at low", value: "£16,068", type: "green", caption: "from £2,000" },
      ],
      summary:
        "The difference between selling and holding: £10,624. Created by a single tap on a phone screen.",
    },
    whatToDoRight: [
      {
        number: 1,
        bold: "Stay your position",
        text: "to your emotional tolerance, not your financial tolerance. Invest only the amount where you can watch it fall 50% without feeling compelled to act.",
      },
      {
        number: 2,
        bold: "Understand what you own before you invest.",
        text: "Investors who held had a thesis. The stimulus narrative strengthened their case — it did not weaken it. A thesis you can articulate is the only thing that survives a panic.",
      },
      {
        number: 3,
        bold: "Write down what would make you sell before",
        text: "you invest. The conditions should be about the thesis, not the price. Selling because the price fell is selling on emotion.",
      },
      {
        number: 4,
        bold: "Do not check the price every hour.",
        text: "Frequent checking increases pressure to act. Most panic sells were from people watching in real time.",
      },
    ],
    marketReplayScenarioId: "covid",
  },

  {
    id: "luna",
    number: 2,
    navLabel: "Luna Collapse",
    title: "The Luna Collapse",
    subtitle: "An algorithmic stablecoin and a six-day death spiral.",
    asset: "LUNA/GBP",
    dateRangeLabel: "Apr 2022 – May 2022",
    openingQuote:
      "On May 7, 2022, a software developer in Birmingham had £34,000 of savings in LUNA — an amount that represented two years of careful investing. By May 13 it was worth £1.48. He had not made a bad decision in the traditional sense. He had made a decision that was rational given what he knew — and then the ground disappeared beneath him.",
    dropPercent: "-99.97%",
    priceRange: "£91.22 → £0.024",
    timeframe: "in 6 days · May 7-13, 2022",
    recoveryPill: { text: "Did not recover", type: "red" },
    stages: [
      {
        number: 1,
        title: "The Setup",
        dateRange: "Jan – Apr 2022",
        narrative:
          "Terra was a blockchain ecosystem built around an algorithmic stablecoin called UST. UST was designed to maintain a $1 peg through an arbitrage mechanism with a sister token called LUNA. If UST fell below $1, holders could swap 1 UST for $1 worth of LUNA — burning UST and minting new LUNA — which was supposed to reduce UST supply and restore the peg.\n\nAnchor Protocol — built on Terra — was offering 19.5% annual yield on UST deposits. The protocol existed, the smart contracts were audited, and the yield was paid consistently for over a year. The problem was that the yield was funded by subsidies rather than by real lending revenue.\n\nBy April 2022, LUNA had reached an all-time high of £91.22. UST was the third-largest stablecoin. The Luna Foundation Guard had accumulated $3.5 billion in Bitcoin reserves specifically to defend the peg. Everything looked robust.",
        timestamp: {
          date: "April 5, 2022",
          context: "LUNA at £91.22 (all-time high) · Anchor TVL above £11 billion · Fear & Greed: 56 (Neutral)",
        },
        isClimax: false,
      },
      {
        number: 2,
        title: "The Warning Signs",
        dateRange: "Apr – May 6, 2022",
        narrative:
          "LUNA fell from £91 to approximately £62 over April — a 33% decline that looked identical to every other asset in the market. Bitcoin was also down. Ethereum was also down. There was nothing obviously wrong with Terra specifically.\n\nTwo things were visible to careful observers but not to most retail investors. First, the Anchor yield was being reduced. The protocol moved from a fixed 19.5% to a dynamic model. This reduced the primary incentive for holding UST. Second, several credible voices had raised concerns about the mathematical sustainability of the UST-LUNA mechanism. Vitalik Buterin had published a blog post questioning algorithmic stablecoins. These warnings were dismissed by the Terra community as people who did not understand the model.",
        timestamp: {
          date: "May 6, 2022",
          context: "LUNA at £61.79 · Down 33% from peak · Looks like a normal correction · Anchor still paying yield",
        },
        isClimax: false,
      },
      {
        number: 3,
        title: "The Depeg",
        dateRange: "May 7 – 9, 2022",
        narrative:
          "On May 7, two large wallet addresses withdrew 375 million UST from Anchor Protocol in a single transaction. This was the equivalent of a bank run beginning in slow motion. UST liquidity in decentralised exchange pools began to thin.\n\nOn May 8, UST briefly fell to $0.985 — losing its dollar peg for the first time. The Luna Foundation Guard began selling Bitcoin reserves to buy UST and defend the peg. The defence worked temporarily. UST recovered to $0.995.\n\nOn May 9, the peg broke decisively. UST fell to $0.72. This triggered the death spiral. The mechanism designed to defend UST was also the mechanism that destroyed LUNA. When UST falls below $1, the protocol allows holders to swap 1 UST for $1 worth of LUNA — regardless of the current LUNA price. New LUNA tokens must be minted continuously. More LUNA supply means lower price. Lower price means each minting creates more tokens. The spiral accelerates automatically.\n\nThis was the moment to sell. This was the signal most investors missed.",
        timestamp: {
          date: "May 9, 2022",
          context: "UST at $0.72 · LUNA at £49.19 · Death spiral begins · The last reasonable exit point",
        },
        isClimax: true,
      },
      {
        number: 4,
        title: "The Spiral",
        dateRange: "May 10 – 12, 2022",
        narrative:
          "May 10: LUNA falls from £49 to £24. A 51% single-day decline. UST is at $0.60. Do Kwon tweets \"Deploying more capital — steady lads.\" The Luna Foundation Guard's Bitcoin reserve is nearly exhausted.\n\nMay 11: LUNA falls to £4. The Terra team passes Proposal 1164, accelerating the UST-to-LUNA minting rate. This makes the spiral worse. LUNA supply has increased 2,000% in 48 hours. Binance briefly suspends LUNA trading due to extreme volatility.\n\nMay 12: LUNA falls below £1 for the first time. LUNA at £0.244. UST at $0.15. BBC News and Reuters run front-page stories about retail investors losing life savings. Reddit and Twitter are full of accounts of people who lost £50,000 to £500,000.",
        timestamp: {
          date: "May 12, 2022",
          context: "LUNA at £0.244 · Down 99.7% from peak · UST at $0.15 · Most retail investors are still holding",
        },
        isClimax: false,
      },
      {
        number: 5,
        title: "The Floor",
        dateRange: "May 13, 2022",
        narrative:
          "LUNA reaches £0.024 — 2.4 pence per token. The Terra blockchain is temporarily halted to prevent governance attacks while the token supply is hyperinflated. Approximately £35 billion in market capitalisation has been destroyed in six days. This is one of the largest single wealth destruction events in financial history.\n\nThe Terra team announces a hard fork. The original chain becomes Terra Classic. A new LUNA token is created and distributed to holders. Most retail investors who held through the collapse received new tokens worth a tiny fraction of their original investment.",
        timestamp: {
          date: "May 13, 2022",
          context: "LUNA at £0.024 · Blockchain halted · £35 billion destroyed · £10,000 at peak now worth £2.63",
        },
        isClimax: false,
      },
    ],
    whatWentWrong:
      "Mistake 1: Applying the COVID lesson to a completely different situation. \"Buy the dip\" — wrong, the dip went to zero. \"Have conviction\" — wrong, conviction in a failing mechanism is a commitment to a larger loss. The COVID crash was a market panic. The Luna collapse was a structural failure.\n\nMistake 2: Confusing yield with safety. The 19.5% Anchor yield made UST feel safe. Any yield substantially above what the global financial system can generate — global bond yields were 2-3% — is subsidised by someone. That subsidy ends.\n\nMistake 3: Not understanding the mechanism. The defence of UST required minting new LUNA — meaning in stress the mechanism itself would destroy LUNA's value. The defence was the attack.",
    whenToSell:
      "The unambiguous signal: May 9, 2022 — UST loses its peg decisively to $0.72.\n\nThis was the equivalent of a bank announcing it cannot return depositors' money. The entire LUNA price was predicated on UST functioning as a stablecoin. When UST stopped being stable at scale, the investment thesis was over. Selling at £49.19 on May 9 meant accepting a 46% loss — painful, but survivable.\n\nMost people did not sell because they did not understand UST's depeg was mechanically fatal. They thought it was a temporary dip. Selling at 46% felt worse than hoping for recovery. And the Terra community — particularly Do Kwon himself — was publicly insisting the situation was manageable.",
    consequences: {
      scenarios: [
        { label: "Held to end", value: "£2.63", type: "red", caption: "from £10,000" },
        { label: "Sold at depeg", value: "£5,393", type: "green", caption: "from £10,000" },
        { label: "Stayed in cash", value: "£10,000", type: "green", caption: "no exposure" },
      ],
      summary:
        "The difference between holding and reading one data point: £5,390. The data point was UST falling below $1.",
    },
    whatToDoRight: [
      {
        number: 1,
        bold: "Understand what backs the yield.",
        text: "If the answer is subsidies, protocol incentives, or token inflation — rather than real revenue from real lending — the yield will eventually stop. When it stops, demand evaporates.",
      },
      {
        number: 2,
        bold: "Read structural signals, not just price signals.",
        text: "A 33% price drop might be a buying opportunity. A stablecoin losing its peg is structural — the mechanism that was supposed to prevent that has failed.",
      },
      {
        number: 3,
        bold: "Do not let community sentiment override mechanism analysis.",
        text: "The Terra community was loud and confident right up until the collapse. Confidence is not evidence the mechanism is sound — it is evidence the community believes it is sound.",
      },
      {
        number: 4,
        bold: "Decide in advance what event would cause you to exit.",
        text: "If you had decided to sell when UST lost its peg — a specific, mechanical event — you would have sold on May 9. Price-based stops would have held you all the way down.",
      },
    ],
    marketReplayScenarioId: "luna",
  },

  {
    id: "ftx",
    number: 3,
    navLabel: "FTX Collapse",
    title: "The FTX Collapse",
    subtitle: "A bank run, a balance-sheet leak, and one million missing customers.",
    asset: "BTC/GBP",
    dateRangeLabel: "Oct 2022 – Mar 2023",
    openingQuote:
      "On November 8, 2022, approximately one million people around the world discovered that the crypto they thought they owned was not theirs. It was sitting in an exchange that had lent it out, lost it, and was now unable to return it. The coins existed. The exchange did not have them.",
    dropPercent: "Bankrupt",
    priceRange: "$32B → $0",
    timeframe: "in 10 days · November 2022",
    recoveryPill: { text: "Customers in bankruptcy", type: "red" },
    stages: [
      {
        number: 1,
        title: "The Setup",
        dateRange: "2019 – Oct 2022",
        narrative:
          "FTX was founded in 2019 by Sam Bankman-Fried — known as SBF — a 27-year-old MIT graduate who had previously worked at Jane Street Capital. By 2022 it was the second-largest crypto exchange by trading volume, valued at $32 billion. SBF appeared on the cover of Fortune. FTX bought the naming rights to the Miami Heat's arena for $135 million. It ran Super Bowl ads.\n\nSBF positioned himself as the responsible face of crypto. He supported regulation, testified before Congress, and donated hundreds of millions to charitable causes. He was treated as credible by senators, journalists, and institutional investors. Sequoia Capital invested $150 million and published a profile describing him as potentially the world's first trillionaire.\n\nFTX offered competitive trading fees, a yield product on deposited crypto, a slick mobile app. Everything looked legitimate.",
        timestamp: {
          date: "October 2022",
          context: "FTX valued at $32B · 1 million active users · BTC at ~£17,000",
        },
        isClimax: false,
      },
      {
        number: 2,
        title: "The Leak",
        dateRange: "November 2, 2022",
        narrative:
          "On November 2, 2022, the crypto news outlet CoinDesk published a leaked balance sheet for Alameda Research — FTX's sister trading firm, also owned by SBF. The balance sheet showed that Alameda's largest asset was FTT — FTX's own exchange token — and that a significant portion of Alameda's collateral was also FTT.\n\nThis was a structural problem of the first order. FTX and Alameda were, in effect, backing each other's balance sheets with a token they had created themselves. FTX had been lending its customers' deposited funds to Alameda, Alameda had been trading with them, and the entire arrangement was backed by a token that FTX itself controlled.\n\nMost retail FTX users did not read the article or understand its implications. Those who did were already withdrawing.",
        timestamp: {
          date: "November 2, 2022",
          context: "Signal 1 · CoinDesk publishes the balance sheet · FTT begins falling",
        },
        isClimax: false,
      },
      {
        number: 3,
        title: "The Bank Run",
        dateRange: "Nov 6 – 8, 2022",
        narrative:
          "On November 6, Changpeng Zhao — CEO of Binance, the world's largest crypto exchange — announced on Twitter that Binance would be selling all of its FTT holdings, approximately $530 million worth. He cited \"recent revelations.\" When the CEO of your competitor publicly announces he is selling your token because he has doubts about your solvency, that is not a neutral piece of news.\n\nFTT began falling rapidly. FTX users started withdrawing their funds. The withdrawals accelerated. On November 7, FTX processed approximately $6 billion in withdrawals — in a single day. By November 8, FTX suspended all withdrawals. Users trying to access their funds received an error message.\n\nThe bank run had happened. The withdrawal freeze confirmed insolvency. The question was no longer whether FTX had a problem. The question was how big the hole was.",
        timestamp: {
          date: "November 8, 2022",
          context: "FTX freezes withdrawals · BTC falls 15% in 24 hours on contagion fear",
        },
        isClimax: true,
      },
      {
        number: 4,
        title: "The Collapse",
        dateRange: "Nov 9 – 11, 2022",
        narrative:
          "On November 8, Binance announced it had signed a letter of intent to acquire FTX. This briefly stabilised the market. On November 9, Binance withdrew from the deal after reviewing FTX's finances. The statement cited \"mishandled customer funds\" and \"alleged US agency investigations.\"\n\nOn November 10, reports emerged that FTX had an $8 billion shortfall in customer funds. The funds had been lent to Alameda Research, which had lost them through trading.\n\nOn November 11, 2022, FTX filed for bankruptcy. SBF resigned. A new CEO — John Ray III, who had previously overseen the Enron bankruptcy — was appointed. His first statement called the situation \"a complete failure of corporate controls.\"\n\nUsers who had funds on FTX had no way to access them. The bankruptcy process began.",
        timestamp: {
          date: "November 11, 2022",
          context: "FTX files for bankruptcy · $8 billion in customer funds missing · BTC at ~£13,500",
        },
        isClimax: false,
      },
      {
        number: 5,
        title: "The Aftermath",
        dateRange: "Nov 2022 – Mar 2023",
        narrative:
          "The FTX collapse triggered broader contagion. Three Arrows Capital — already stressed by the Luna collapse — confirmed insolvency. Genesis Global suspended withdrawals. BlockFi filed for bankruptcy. The interconnectedness of crypto lending meant that one failure created losses elsewhere.\n\nBTC fell from approximately £17,000 before the collapse to approximately £13,000 in the aftermath — a further 23% decline on top of the 70% decline already experienced since the November 2021 peak.\n\nSBF was arrested in the Bahamas in December 2022 and extradited to the US. He was convicted of fraud in November 2023 and sentenced to 25 years in prison. It was confirmed during the trial that customer funds had been misappropriated to fund Alameda's trading losses, political donations, and personal expenses including luxury real estate in the Bahamas.",
        timestamp: {
          date: "March 2023",
          context: "BTC begins recovering · Confidence in centralised exchanges at historical low",
        },
        isClimax: false,
      },
    ],
    whatWentWrong:
      "The FTX collapse is unique because the mistake was not an investment decision. It was a custody decision.\n\nThe investors who lost money did not make a bad trade. They chose a platform that appeared reputable, regulated, and well-capitalised — and that platform turned out to be committing fraud. The investment that failed was the decision to trust an intermediary with custody.\n\nThe specific mistake: keeping crypto on a centralised exchange rather than withdrawing to a self-custody wallet. When your crypto is in self-custody — where you hold the private keys — nobody can lend it, lose it, or freeze it. When it is on an exchange, you have a claim against the exchange. If the exchange becomes insolvent, your claim becomes a creditor claim that typically returns cents on the pound over years.\n\n\"Not your keys, not your coins\" is not crypto philosophy. It is a literal description of the legal relationship.",
    whenToSell:
      "Signal 1 — November 2: Move your assets when the CoinDesk article publishes. This required understanding what the balance sheet meant — that FTX and Alameda were circularly backed.\n\nSignal 2 — November 6: Move your assets when CZ announces he is selling FTT. This required no financial literacy. When the CEO of the world's largest competing exchange publicly announces he is selling your exchange's token citing solvency concerns, the rational response is to withdraw.\n\nSignal 3 — November 8: Too late. Once FTX suspended withdrawals, user funds were inaccessible. The decision window had closed.\n\nFor users who did not see or understand the first two signals, there was nothing they could have done. They were not negligent in the conventional sense. They had trusted a platform that presented itself as trustworthy.",
    consequences: {
      scenarios: [
        { label: "Held on FTX", value: "Frozen", type: "red", caption: "~90p/£ paid in cash, years later" },
        { label: "Moved Nov 6", value: "£10,000", type: "green", caption: "self-custody, kept BTC upside" },
        { label: "Never on FTX", value: "£10,000", type: "green", caption: "no exposure" },
      ],
      summary:
        "The difference is not the bankruptcy haircut. It is owning Bitcoin that recovered to £60,000 versus being a creditor in a bankrupt estate.",
    },
    whatToDoRight: [
      {
        number: 1,
        bold: "Do not keep more on an exchange than you need for active trading.",
        text: "Exchanges are for buying and selling, not safe storage. Withdraw to self-custody as soon as you have made your purchase.",
      },
      {
        number: 2,
        bold: "Learn how to use a self-custody wallet before you need one.",
        text: "Hardware wallets cost £50–£200. Setting one up takes about an hour. The intimidation that keeps people from learning is expensive.",
      },
      {
        number: 3,
        bold: "Understand what exchange yield means.",
        text: "When an exchange offers yield on deposited crypto, it is lending that crypto to someone else. The rate is compensation for the risk of losing your principal.",
      },
      {
        number: 4,
        bold: "Watch for institutional actions, not price moves.",
        text: "CZ announcing he was selling FTT was a signal. A 5% price drop is not. Specific public actions by major participants are actionable. Daily noise is not.",
      },
    ],
    marketReplayScenarioId: "",
  },

  {
    id: "gamestop",
    number: 4,
    navLabel: "GameStop",
    title: "The GameStop Short Squeeze",
    subtitle: "A subreddit, a struggling retailer, and the limits of retail power.",
    asset: "GME/GBP",
    dateRangeLabel: "Jan 2021 – Feb 2021",
    openingQuote:
      "In January 2021, a group of retail investors on Reddit decided to buy a video game retailer's stock. Within two weeks they had caused hedge funds to lose approximately $19 billion, triggered a congressional hearing, and demonstrated that the rules of financial markets could be rewritten by a sufficiently large and coordinated crowd — until the people running the infrastructure of those markets decided they could not.",
    dropPercent: "-85%",
    priceRange: "£253 → £39",
    timeframe: "in 2 weeks · January 28 – February 2021",
    recoveryPill: { text: "Permanent peak losses", type: "red" },
    stages: [
      {
        number: 1,
        title: "The Setup",
        dateRange: "2019 – Dec 2020",
        narrative:
          "GameStop was a struggling American video game retailer. Several large hedge funds — including Melvin Capital and Citron Research — had built enormous short positions. By late 2020, GameStop's short interest was approximately 140% of its available shares — meaning more shares had been borrowed and sold short than actually existed. This was unusual and precarious.\n\nOn Reddit's WallStreetBets forum, a user named Roaring Kitty (Keith Gill) had been posting analysis arguing GameStop was undervalued and that the extreme short interest created a potential short squeeze. The community began buying GameStop shares and call options in large quantities in early January 2021.",
        timestamp: {
          date: "December 31, 2020",
          context: "GME at ~£12 · Short interest at 140% · WallStreetBets has 2 million members",
        },
        isClimax: false,
      },
      {
        number: 2,
        title: "The Squeeze Begins",
        dateRange: "Jan 11 – 22, 2021",
        narrative:
          "On January 11, Ryan Cohen — founder of Chewy — joined the GameStop board. Cohen was seen as someone who could transform GameStop into an e-commerce business. The stock began rising on genuine fundamental interest.\n\nThe WallStreetBets community accelerated buying. Retail buying combined with short covering — hedge funds buying shares to close their losing positions — drove the price rapidly higher. GME went from £12 to £35 in one week. New members flooded into WallStreetBets — the subreddit grew from 2 million to 8 million members in days.\n\nSocial media was saturated with screenshots of trading accounts. Rocket emojis. The language of the community — \"diamond hands\" for holding, \"paper hands\" for selling — became briefly part of mainstream internet culture.",
        timestamp: {
          date: "January 22, 2021",
          context: "GME at ~£35 · Up 192% in three weeks · Mainstream coverage begins",
        },
        isClimax: false,
      },
      {
        number: 3,
        title: "The Peak",
        dateRange: "Jan 25 – 28, 2021",
        narrative:
          "Elon Musk tweeted \"Gamestonk!!\" with a link to WallStreetBets on January 26. This drove retail buying to fever pitch. GME reached approximately £250 on January 27 — up from £12 three weeks earlier.\n\nMelvin Capital required a $2.75 billion emergency bailout from Citadel and Point72 to stay solvent. The hedge fund that had bet against GameStop was being destroyed by retail investors on Reddit.\n\nOn January 28 — at precisely the moment the squeeze appeared to be reaching its peak — Robinhood restricted trading in GameStop. Users could not buy new shares. They could only sell. The decision was made without warning, without public explanation, and with immediate effect.\n\nThe price began falling the moment the restriction was announced.",
        timestamp: {
          date: "January 28, 2021",
          context: "GME peaks near £253 · Robinhood restricts buying · Price begins falling immediately",
        },
        isClimax: true,
      },
      {
        number: 4,
        title: "The Restriction and the Fall",
        dateRange: "Jan 28 – Feb 2021",
        narrative:
          "The Robinhood restriction became a political crisis. Alexandria Ocasio-Cortez and Ted Cruz both demanded a congressional hearing. The question was whether Robinhood had acted to protect hedge funds at the expense of retail investors.\n\nRobinhood's explanation was financial. As a brokerage, it was required to post collateral with the Depository Trust and Clearing Corporation based on the volatility and volume of trades. The GME volumes had pushed Robinhood's collateral requirement to a level it could not immediately meet.\n\nWhether this is fully accurate remains disputed. What is certain is that the restriction ended the squeeze. Without the ability to buy, the self-reinforcing upward pressure stopped. Short sellers covered in a falling market rather than a rising one. By February 2021, GME had fallen from £253 to approximately £39.\n\nInvestors who had bought between £100 and £253 had lost between 60% and 85% of their investment within weeks.",
        timestamp: {
          date: "February 2021",
          context: "GME at ~£39 · Down 85% from peak · Congressional hearings begin · Keith Gill testifies",
        },
        isClimax: false,
      },
    ],
    whatWentWrong:
      "Mistake 1: Confusing a social movement with an investment. WallStreetBets framed the trade as a battle between retail investors and hedge funds. For some this was accurate — they understood it was a momentum trade and sized accordingly. For many others, selling felt like betraying the cause. Treating a stock trade as solidarity overrode the financial logic of taking profits.\n\nMistake 2: Buying at the peak driven by social media. The investors who suffered the largest losses bought between January 25 and 28 — after the story became mainstream news. By the time something is on television as a financial opportunity, the easy money has been made.\n\nMistake 3: Not understanding broker dependency. The trade depended on retail investors being able to buy continuously. When Robinhood removed that ability, the upward pressure stopped immediately. The broker was part of the trade whether the investors knew it or not.\n\nMistake 4: Using margin. Many were liquidated automatically when the price fell, at exactly the moment they could not buy back in.",
    whenToSell:
      "The honest signal: January 27, the day before the restriction. GME at £200–£250. The squeeze had been running for three weeks. Mainstream media was covering it. Elon Musk had tweeted. These are late-cycle signals in any mania — when a speculative trade becomes mainstream news it is usually near its peak.\n\nThe structural signal: January 28, the moment Robinhood announced restrictions. The restriction removed the key mechanism driving prices higher. This was the same type of structural signal as the UST depeg — the mechanism sustaining the price had been removed. Selling immediately on the restriction announcement — accepting whatever price was available — was the rational response.",
    consequences: {
      scenarios: [
        { label: "Sold at £200", value: "£166,667", type: "green", caption: "from £10,000 at £12" },
        { label: "Held through peak", value: "£32,500", type: "neutral", caption: "down 85% from peak" },
        { label: "Bought at peak", value: "£1,950", type: "red", caption: "from £10,000 at £200" },
      ],
      summary:
        "The same starting capital, three different exits. The decisions that made the difference took seconds.",
    },
    whatToDoRight: [
      {
        number: 1,
        bold: "Momentum trades are not investments — treat them differently.",
        text: "A momentum trader who bought at £35 and planned to sell at £150 made extraordinary money. A momentum trader with no exit plan held through £250 to £39.",
      },
      {
        number: 2,
        bold: "When something becomes mainstream news, the best of the trade is over.",
        text: "Informed early buyers, then social media, then mainstream financial press, then television. By the time you are seeing it on television, you are late.",
      },
      {
        number: 3,
        bold: "Understand your broker's role in any trade.",
        text: "Your broker has its own capital requirements and regulatory constraints. In extreme conditions it can restrict your ability to trade. Most retail investors had never considered this.",
      },
      {
        number: 4,
        bold: "Never invest borrowed money in a speculative trade.",
        text: "The combination of high volatility, rapid price movement, and broker-imposed restrictions is precisely the environment where margin calls happen at the worst possible moment.",
      },
    ],
    marketReplayScenarioId: "",
  },

  {
    id: "gfc",
    number: 5,
    navLabel: "GFC 2008",
    title: "The Great Financial Crisis",
    subtitle: "Multi-asset · System failure · The crash that taught the rules.",
    asset: "FTSE · RBS · BP · Gold · Gilts",
    dateRangeLabel: "Sep 2008 – Jun 2009",
    openingQuote:
      "In September 2008 the question was not which investment would make you money. It was which investment would not destroy you. For the first time in a generation, the risk was not that you had picked the wrong stock. It was that the financial system itself — the infrastructure through which all investments are made and settled — was under threat of complete failure.",
    dropPercent: "-36%",
    priceRange: "FTSE 5,500 → 3,512",
    timeframe: "in 6 months · September 2008 – March 2009",
    recoveryPill: { text: "FTSE recovered by 2013", type: "green" },
    stages: [
      {
        number: 1,
        title: "The Setup",
        dateRange: "2003 – 2007",
        narrative:
          "From 2003 to 2007, US house prices rose continuously. Banks created increasingly complex mortgage products that allowed people who could not traditionally qualify — no income verification, no down payment, adjustable rates — to buy homes. These mortgages were packaged into Collateralised Debt Obligations and sold to investors around the world.\n\nThe fundamental assumption underlying the entire system was that US house prices would continue rising. By 2006 they had peaked and begun falling. By 2007 mortgage defaults were rising sharply. The securities backed by those mortgages began losing value. But the losses were hidden inside complex products distributed through the global financial system. Nobody knew exactly where the losses were — only that they were somewhere.",
        timestamp: {
          date: "July 2007",
          context: "Bear Stearns closes two hedge funds exposed to MBS · First sign · FTSE 100 at 6,700",
        },
        isClimax: false,
      },
      {
        number: 2,
        title: "Northern Rock",
        dateRange: "Sep 2007 – Jan 2008",
        narrative:
          "In September 2007, Northern Rock — a UK mortgage lender that had relied heavily on short-term wholesale funding rather than traditional deposits — applied to the Bank of England for emergency support. When this became public, customers queued outside branches to withdraw their savings. It was the first bank run in the UK in 150 years.\n\nThe Bank of England and the UK government guaranteed all Northern Rock deposits. The bank was eventually nationalised in February 2008. The cost to UK taxpayers was approximately £27 billion.\n\nThis established two things. First, that the mortgage crisis was not confined to the US. Second, that the UK government would intervene to prevent bank failures — creating an implicit guarantee that made subsequent bailouts politically complex.",
        timestamp: {
          date: "September 2007",
          context: "First UK bank run in 150 years · Government guarantees deposits · FTSE begins falling",
        },
        isClimax: false,
      },
      {
        number: 3,
        title: "Bear Stearns",
        dateRange: "March 2008",
        narrative:
          "In March 2008 Bear Stearns — the fifth-largest US investment bank — faced a liquidity crisis. Within 72 hours it was unable to fund its daily operations. The US Federal Reserve arranged an emergency sale to JPMorgan Chase at $2 per share — down from $170 per share one year earlier. The Fed provided a $30 billion guarantee.\n\nThis established a precedent: the US government would intervene to prevent systemically important banks from failing. Markets stabilised briefly. Many investors concluded the worst was over. The FTSE 100 recovered somewhat through summer 2008. This recovery was the last buying opportunity before the catastrophe.",
        timestamp: {
          date: "March 2008",
          context: "Bear Stearns collapses · Fed provides $30B guarantee · Markets briefly recover",
        },
        isClimax: false,
      },
      {
        number: 4,
        title: "Lehman Brothers",
        dateRange: "September 15, 2008",
        narrative:
          "On September 15, 2008, Lehman Brothers — the fourth-largest US investment bank — filed for bankruptcy. Unlike Bear Stearns, the US government did not arrange a rescue. Lehman had $639 billion in assets and $619 billion in debts. Its failure was the largest bankruptcy in US history.\n\nThe consequences were immediate and global. Money market funds — considered the safest possible investment after government bonds — began \"breaking the buck.\" Banks stopped lending to each other. The interbank lending rate spiked as no institution was willing to trust another's solvency. Credit markets froze.\n\nIn the UK, HBOS required an emergency takeover by Lloyds TSB, arranged by the government. Royal Bank of Scotland required the largest bank bailout in history — £45 billion from UK taxpayers.",
        timestamp: {
          date: "September 15, 2008",
          context: "Lehman bankruptcy · FTSE falls 4% in one day · RBS falls 39% in two days · The centre of the storm",
        },
        isClimax: true,
      },
      {
        number: 5,
        title: "The Bailout",
        dateRange: "Oct 2008 – Jun 2009",
        narrative:
          "Governments responded with unprecedented intervention. The US passed the $700 billion TARP. The UK government injected £500 billion in bank guarantees and direct capital. Central banks cut interest rates to near zero and began quantitative easing.\n\nThe FTSE 100 fell from approximately 5,500 before the Lehman collapse to approximately 3,500 by March 2009 — a 36% decline in six months. It then began a slow recovery as the bailouts stabilised the banking system.\n\nNot all assets fell equally. Gold rose during the crisis as investors sought safe havens with no counterparty risk. UK Gilts rose as investors moved to the safest possible assets. RBS fell from £3.20 to £0.10 — a 97% decline. The diversification of your portfolio determined almost everything about your outcome.",
        timestamp: {
          date: "March 2009",
          context: "FTSE 100 at 3,512 (lowest point) · Bailouts beginning to stabilise · Gold up 25% since Lehman",
        },
        isClimax: false,
      },
    ],
    whatWentWrong:
      "The GFC is fundamentally different from every other crash on this timeline. Every other crash involves an asset class falling. The GFC is a story about the infrastructure of finance itself failing.\n\nMistake 1: Assuming diversification provided protection. Before 2008 most advisers told clients that a diversified portfolio of stocks, bonds, and cash was the safest possible long-term strategy. The GFC demonstrated that in a genuine systemic crisis, correlations increase dramatically. Assets that normally move independently fell together.\n\nMistake 2: Treating financial stocks as stable investments. UK retail investors with significant holdings in RBS, HBOS, Lloyds, and Barclays — all considered blue-chip British stocks — suffered catastrophic losses. RBS fell 97%.\n\nMistake 3: Keeping large cash balances in banks and money market funds. In a banking crisis, the safety of deposits depends on government guarantees. Customers with more than the FSCS limit in a single institution faced real losses on what they had assumed was safe cash.",
    whenToSell:
      "Most retail investors had no realistic chance of anticipating the Lehman collapse. The signals were visible only in hindsight.\n\nBut the specific decisions that caused the most damage — holding RBS shares, having large deposits in a single institution, being heavily invested in financial stocks — could have been avoided by applying general principles that had nothing to do with predicting the crisis.\n\nWhat you could have controlled: position concentration (no single stock above 5–10%), sector concentration (avoid heavy weighting in financials), gold allocation (10–15% provides meaningful protection in systemic events). A 10–15% allocation to gold rose 25% during the worst of the crisis.",
    consequences: {
      scenarios: [
        { label: "100% RBS", value: "£313", type: "red", caption: "from £10,000" },
        { label: "100% FTSE 100", value: "£6,380", type: "neutral", caption: "from £10,000" },
        { label: "50/25/25 mix", value: "£9,090", type: "green", caption: "FTSE/Gilts/Gold" },
      ],
      summary:
        "Concentration risk in financial stocks vs. diversification across asset classes: a £8,777 difference.",
    },
    whatToDoRight: [
      {
        number: 1,
        bold: "Systemic crises correlate everything.",
        text: "Diversify across asset classes, not just within them. Bonds, gold, and international equities reduce correlation that destroys equities-only portfolios in systemic events.",
      },
      {
        number: 2,
        bold: "Know your deposit protection limits.",
        text: "In the UK, FSCS protects up to £85,000 per institution per person. If you have more, spread across institutions. Not exciting — but one of the few free protections retail investors have.",
      },
      {
        number: 3,
        bold: "No single stock should be more than 10% of a portfolio.",
        text: "RBS was a blue-chip with decades of stable dividends. It fell 97%. Past stability does not protect against unprecedented events. Position limits are insurance, not pessimism.",
      },
      {
        number: 4,
        bold: "Understand the difference between paper losses and permanent losses.",
        text: "The FTSE recovered by 2013. An investor who held a diversified index, did not sell, and reinvested dividends recovered fully. An investor who sold at the bottom locked in losses permanently.",
      },
    ],
    marketReplayScenarioId: "",
  },
];
