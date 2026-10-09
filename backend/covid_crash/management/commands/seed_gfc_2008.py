
from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.db import transaction

from covid_crash.models import (
    LessonNarrative,
    Scenario,
    ScenarioFinale,
    ScenarioRound,
)
from covid_crash.services import generate_intraday_ticks, generate_multi_asset_candles

ASSETS = ['FTSE', 'RBS', 'BP', 'GOLD', 'GILT']

ROUND_ANCHORS = [
    (0, date(2008, 9, 12), {'FTSE': 5416, 'RBS': 220, 'BP': 502, 'GOLD': 430, 'GILT': 100}),
    (1, date(2008, 9, 29), {'FTSE': 4898, 'RBS': 175, 'BP': 480, 'GOLD': 455, 'GILT': 102}),
    (2, date(2008, 10, 7), {'FTSE': 4670, 'RBS':  90, 'BP': 445, 'GOLD': 510, 'GILT': 104}),
    (3, date(2008, 10, 27),{'FTSE': 3883, 'RBS':  55, 'BP': 410, 'GOLD': 515, 'GILT': 105}),
    (4, date(2009, 1, 19), {'FTSE': 4015, 'RBS':  11, 'BP': 478, 'GOLD': 605, 'GILT': 108}),
    (5, date(2009, 3, 3),  {'FTSE': 3512, 'RBS':  18, 'BP': 420, 'GOLD': 650, 'GILT': 108}),
]

END_PRICES = {'FTSE': 4387, 'RBS': 41, 'BP': 510, 'GOLD': 645, 'GILT': 107}

CHART_START_DATE = date(2008, 9, 1)
CHART_START_PRICES = {'FTSE': 5530, 'RBS': 230, 'BP': 510, 'GOLD': 415, 'GILT': 99}

ROUND_CONTEXTS = [
    (
        "September 12, 2008. The FTSE closed at 5,416 today. Over the weekend, Lehman Brothers "
        "will attempt to find a buyer — Bank of America and Barclays are reportedly in talks. "
        "Most analysts expect a deal to be announced before Asian markets open on Monday. The "
        "financial press is nervous but not panicked. Government officials in the US, UK, and "
        "Eurozone are coordinating but publicly playing down the risk of contagion.",
        "",
        [],
    ),
    (
        "September 29, 2008. Lehman Brothers filed for bankruptcy two weeks ago. AIG was rescued "
        "by an $85bn Federal Reserve loan. WaMu has been seized. The US House just rejected the "
        "$700bn TARP bailout — markets are crashing on the news. Today the FTSE is down 5% to "
        "4,898. The Dow is down 778 points — the largest single-day point fall in history.",
        "⚠ Systemic stress: TARP rejected, Lehman bankrupt, AIG rescued.",
        [
            {
                "trigger_offset_seconds": 30,
                "headline": "BREAKING: US House rejects $700bn TARP bill",
                "body": "Treasury Secretary Hank Paulson says he is returning to the negotiating table. Markets continue to fall.",
            },
        ],
    ),
    (
        "October 7, 2008. RBS opened at 138p this morning. As CEO Fred Goodwin gave a presentation "
        "about the bank’s strategy, the share price fell 35% in real time during his speech. The bank "
        "is reported to be running out of money. Chancellor Darling is being briefed at the Treasury. "
        "The FTSE is down 3% on the news. Gold has risen 19% in GBP terms over the past month as "
        "investors flee to safety.",
        "⚠ Major UK bank near failure. Government emergency measures expected.",
        [
            {
                "trigger_offset_seconds": 15,
                "headline": "BREAKING: RBS share price down 35% mid-presentation",
                "body": "Bank reportedly may run out of money today. Government emergency measures expected within hours.",
            },
            {
                "trigger_offset_seconds": 60,
                "headline": "BREAKING: Coordinated central bank rate cut",
                "body": "Bank of England, Federal Reserve, and ECB cut rates by 0.5% in synchronised action. First coordinated cut since 2001.",
            },
        ],
    ),
    (
        "October 27, 2008. The UK government announced a £25bn bailout package on October 8. RBS was "
        "effectively nationalised on October 13 at 65.7p/share — Fred Goodwin has resigned. The FTSE has "
        "fallen to 3,883, down 28% from where you started this scenario six weeks ago. Iceland’s banking "
        "system collapsed last week — UK depositors with Icelandic bank accounts have had their funds frozen.",
        "",
        [
            {
                "trigger_offset_seconds": 20,
                "headline": "ALERT: Icelandic bank Landsbanki collapses",
                "body": "UK Treasury invokes Anti-Terrorism, Crime and Security Act 2001 to freeze Icelandic assets in the UK. Thousands of UK savers and councils affected.",
            },
        ],
    ),
    (
        "January 19, 2009. The market is in a holding pattern after the October panic. Today, RBS "
        "announced its 2008 results: a £28 billion loss, the largest in UK corporate history. The "
        "government will increase its stake from 58% to 70%. RBS shares opening down 67% — falling to "
        "11p. Lloyds Banking Group is in serious trouble. Gold has continued rising and is now at £605/oz.",
        "⚠ Blue Monday: RBS announces record corporate loss. Shares collapse 67%.",
        [
            {
                "trigger_offset_seconds": 10,
                "headline": "BREAKING: RBS announces £28bn loss for 2008",
                "body": "Largest in UK corporate history. RBS shares opening down 67% — falling to 11p. Government to take 70% ownership.",
            },
            {
                "trigger_offset_seconds": 50,
                "headline": "BLOOMBERG ALERT: Lloyds Banking Group requests emergency funding",
                "body": "Citizens of UK now collectively own 84% of RBS and 41% of Lloyds. The scale of state intervention in British banking is without precedent.",
            },
        ],
    ),
    (
        "March 3, 2009. The FTSE 100 has fallen to 3,512 — the bottom of the crisis (although nobody "
        "knows that yet). The S&P 500 is at 700. Citigroup is trading at $1.05/share. AIG has lost 99% "
        "of its market cap. The UK economy is contracting at the fastest rate in 30 years. Most retail "
        "investors have either sold or stopped looking at their portfolios.",
        "⚠ Markets at multi-year lows. Maximum fear.",
        [
            {
                "trigger_offset_seconds": 30,
                "headline": "BREAKING: Federal Reserve announces $1.15 trillion QE programme",
                "body": "Direct purchase of long-term Treasuries and mortgage-backed securities. First time the Fed has done this at this scale. Analysts say this could mark the beginning of the recovery.",
            },
        ],
    ),
]

NARRATIVES = [
    (
        "cash_through_crisis",
        "You stayed in cash.",
        "You held cash through the Great Financial Crisis. Your {starting_balance} is intact. "
        "The FTSE 100 fell 35% from where you started; RBS fell 95% and stayed there; gold rose "
        "50% in GBP terms. By staying in cash, you avoided every loss and missed every gain. "
        "There’s a serious case for cash during a crisis: in October 2008, nobody knew where the "
        "bottom was, and capital preservation was rational. The case against: by March 2009, even "
        "ordinary equity funds had bottomed and were beginning to recover. By staying in cash "
        "through the recovery as well as the crisis, you transformed a defensible defensive "
        "position into a missed opportunity. The skill at this point in a cycle is recognising "
        "the transition from preservation to deployment — and that takes confidence in something "
        "other than the news flow.",
        "Cash is a position. Like every position, it has an opportunity cost — and that cost is "
        "highest exactly when cash feels safest.",
    ),
    (
        "rbs_holder",
        "You bought RBS.",
        "You concentrated {pct_in_rbs}% of your portfolio in RBS during the scenario. Your final "
        "RBS position is worth {final_rbs_value} — about {rbs_loss_pct}% of what you put in. RBS "
        "did not just fall in the crisis; it never recovered to anything resembling its pre-crisis "
        "level. The UK government still owns over half the bank as of 2024. The temptation to buy "
        "RBS at 11p in January 2009 was understandable — a safe UK bank trading at a fraction of "
        "its pre-crisis price felt like a once-in-a-generation opportunity. But this scenario is "
        "exactly where the lesson from mechanism failure applies: when an asset has had its "
        "underlying business model break, the price is not discounted — it is repricing to reflect "
        "a different, smaller business. RBS is a bank with a business model that was permanently "
        "impaired. Buying its shares post-crisis was buying a story, not a discount.",
        "When a business has fundamentally failed, the share price is not ‘discounted’ — it’s "
        "correctly priced for a smaller business.",
    ),
    (
        "gold_bull",
        "You read the panic correctly.",
        "You concentrated {pct_in_gold}% of your portfolio in gold. By the end of the scenario, "
        "gold had risen from £430/oz to £645/oz — a {gold_return_pct}% gain in GBP terms. Your "
        "final portfolio is {final_value}, a {delta_pct_signed}% return from start. Gold’s behaviour "
        "during the GFC was a textbook safe-haven response: when investors panic about the "
        "financial system itself, they look for assets that do not depend on counterparties — "
        "and gold is the canonical example. The fact that gold rose in GBP terms was partly "
        "because sterling collapsed during the crisis from $1.85 to $1.40 — meaning a UK investor "
        "in gold benefited from both gold’s nominal rise and sterling’s fall. You either understood "
        "this or got lucky; either way, the outcome was correct.",
        "Gold is not ‘always safe.’ It is specifically the asset that does well when investors "
        "lose faith in counterparties. That’s a bet, not a bond.",
    ),
    (
        "balanced_portfolio",
        "You diversified.",
        "You allocated across multiple assets without concentrating heavily in any one. Your final "
        "portfolio composition: {portfolio_breakdown}. Your final value is {final_value}, a "
        "{delta_pct_signed}% return from start. Diversification works when assets do not all move "
        "together — and during the GFC, the diversification that mattered was between equities "
        "and safe havens, not within equities. A portfolio of FTSE, RBS, and BP looked diversified "
        "before the crisis but was actually 100% exposed to UK equity market risk, which collapsed "
        "as a unit. A portfolio of FTSE, gold, and gilts was genuinely diversified across asset "
        "classes. Your portfolio fell in the {category} bucket. The lesson of the GFC for retail "
        "investors is that the diversification that works in normal markets is not necessarily the "
        "same diversification that protects you in a crisis.",
        "Diversification across stocks is not diversification. Diversification across asset classes is.",
    ),
    (
        "safe_haven_seeker",
        "You went for safety.",
        "You put {safe_haven_pct}% of your portfolio into safe haven assets — gold and gilts. "
        "Your final value is {final_value}, a {delta_pct_signed}% return from start. During the "
        "GFC, gilts and gold moved in opposite directions to equities. Gilts rose as the Bank of "
        "England cut rates aggressively — each 0.5% cut made existing fixed-rate bonds more "
        "valuable. Gold rose as investors lost faith in the financial system itself and sought "
        "assets with no counterparty risk. By concentrating in both, you effectively bet that the "
        "crisis would be severe and prolonged — and you were right. The trade-off is that if the "
        "crisis had resolved quickly (as some expected in October 2008), this allocation would have "
        "underperformed a more balanced one. Correctly diagnosing the severity of a crisis, early, "
        "is one of the hardest things to do in markets.",
        "Recognising when the regime has changed is half of investing. Acting on that recognition "
        "is the other half.",
    ),
    (
        "active_rotator",
        "You traded actively.",
        "You made {trade_count} trades across multiple assets during the scenario. Your final "
        "value is {final_value}, a {delta_pct_signed}% return from start. Active rotation during "
        "a crisis is intellectually appealing: buy the assets falling the slowest, sell the ones "
        "falling fastest, catch the bottoms. The problem is execution — in real markets, the "
        "spreads are wide, the news is chaotic, and every instinct you have was already shared by "
        "thousands of professional traders with faster systems. The data on retail investor "
        "performance during the GFC is consistent: frequent traders significantly underperformed "
        "buy-and-hold strategies in the same assets. The exceptions are traders who got out early "
        "(before the worst) or got in early (at the very bottom). Everything in between tends to "
        "hurt. This is not a rule — it is a tendency. But it is a strong one.",
        "Active trading in a crisis can work — but the data suggests most investors who try it "
        "underperform a simpler defensive allocation.",
    ),
    (
        "bottom_picker",
        "You bought near the bottom.",
        "You made significant equity purchases in the final rounds of the scenario — near the "
        "bottom of the crisis. You invested {bought_at_bottom} in equity positions at that point. "
        "Your final value is {final_value}, a {delta_pct_signed}% return from start. Buying "
        "equities in March 2009 required a belief, in the face of total consensus pessimism, that "
        "the financial system was not actually going to collapse — that the Fed and the "
        "Treasury’s interventions would work, eventually, even if they had not worked yet. This "
        "is counter-cyclical investing: doing the unpopular thing at the moment it feels most "
        "dangerous. It is also extremely hard to do in practice, because the news flow at the "
        "bottom is always maximally negative. The signal that distinguishes a bottom from a "
        "continuation of the fall is not visible in the price; it is visible only in understanding "
        "the intervention architecture — what the central banks and governments were doing and "
        "why. You either had that understanding or acted on conviction. Either way, the outcome "
        "rewarded you.",
        "Buying low is easy in retrospect and brutally hard in the moment. You did it.",
    ),
    (
        "panic_seller",
        "You sold during the panic.",
        "You sold {total_sold_panic} worth of positions during the sharpest phase of the crisis "
        "— rounds 2 or 3, when prices were falling fastest. Your final value is {final_value}, "
        "a {delta_pct_signed}% return from start. Panic selling is not irrational. In October "
        "2008, there was genuine uncertainty about whether the financial system would survive. "
        "RBS’s CEO told the Chancellor his bank would run out of money that afternoon. The FTSE "
        "fell 11% in a single day. In that environment, selling feels like the only sensible "
        "option. The problem is that selling locks in the loss and removes the possibility of "
        "recovery. Investors who sold in October 2008 and never re-entered the market are still "
        "sitting on losses relative to investors who simply did nothing. The cost of panic selling "
        "is not just the loss at the moment of sale — it is the compounded gain from the "
        "subsequent recovery that was also surrendered.",
        "Selling on the way down is the most expensive single decision retail investors make. "
        "The instinct is human; the cost is real.",
    ),
]


class Command(BaseCommand):

    @transaction.atomic
    def handle(self, *args, **opts):
        Scenario.objects.filter(order=5).delete()
        scenario = self._create_scenario()
        self._create_rounds(scenario)
        self._create_finale(scenario)
        self._create_narratives(scenario)
        self.stdout.write(self.style.SUCCESS(
            f"GFC 2008 scenario seeded. "
            f"{scenario.rounds.count()} rounds, "
            f"{'finale OK' if hasattr(scenario, 'finale') else 'NO FINALE'}, "
            f"{scenario.narratives.count()} narratives."
        ))


    def _create_scenario(self) -> Scenario:
        prereq = (
            Scenario.objects.filter(order=4).first()
            or Scenario.objects.filter(order=3).first()
            or Scenario.objects.filter(order=1).first()
        )
        return Scenario.objects.create(
            order=5,
            title="The Great Financial Crisis",
            subtitle="September 2008 — when the system itself was the bet",
            historical_period="Sep 2008 – Jun 2009",
            lesson_tag="Multi-asset crisis management",
            accent_color="#1F2937",
            asset_symbol="MULTI",
            asset_name="Multiple assets",
            is_multi_asset=True,
            available_assets=ASSETS,
            chart_log_scale=False,
            uses_broker_mechanics=False,
            uses_custody_split=False,
            starting_balance_pence=1_000_000,
            recommended_prerequisite=prereq,
        )


    def _create_rounds(self, scenario: Scenario) -> None:
        prev_date = CHART_START_DATE
        prev_prices = dict(CHART_START_PRICES)

        for round_index, scenario_date, round_prices in ROUND_ANCHORS:
            context, signal, news_flashes = ROUND_CONTEXTS[round_index]


            candles = generate_multi_asset_candles(
                prev_date,
                scenario_date,
                prev_prices,
                round_prices,
                rng_seed=500 + round_index,
            )


            ticks = generate_intraday_ticks(
                prev_prices,
                round_prices,
                rng_seed=100 + round_index,
            )

            round_obj = ScenarioRound.objects.create(
                scenario=scenario,
                round_index=round_index,
                scenario_date=scenario_date,
                price_pence=round_prices['FTSE'],
                context_paragraph=context,
                structural_signal_text=signal,
                candles=candles,
                asset_closing_prices=round_prices,
                intraday_ticks=ticks,
                news_flashes=news_flashes,
            )

            self.stdout.write(
                f"  Round {round_index} ({scenario_date}): "
                f"{len(candles)} candles, "
                f"FTSE={round_prices['FTSE']}p RBS={round_prices['RBS']}p "
                f"GOLD={round_prices['GOLD']}p GILT={round_prices['GILT']}p, "
                f"{len(ticks)} ticks, {len(news_flashes)} news flashes"
            )

            prev_date = scenario_date + timedelta(days=1)
            prev_prices = dict(round_prices)


    def _create_finale(self, scenario: Scenario) -> None:
        last_round_date = date(2009, 3, 3)
        last_round_prices = ROUND_ANCHORS[-1][2]
        end_date = date(2009, 6, 1)

        candles = generate_multi_asset_candles(
            last_round_date + timedelta(days=1),
            end_date,
            last_round_prices,
            END_PRICES,
            rng_seed=600,
        )

        ScenarioFinale.objects.create(
            scenario=scenario,
            end_date=end_date,
            end_price_pence=END_PRICES['FTSE'],
            candles=candles,
        )
        self.stdout.write(
            f"  Finale ({end_date}): {len(candles)} candles, "
            f"FTSE end={END_PRICES['FTSE']}p GOLD end={END_PRICES['GOLD']}p"
        )


    def _create_narratives(self, scenario: Scenario) -> None:
        for pattern_key, headline, body_template, takeaway in NARRATIVES:
            LessonNarrative.objects.create(
                scenario=scenario,
                pattern_key=pattern_key,
                headline=headline,
                body_template=body_template,
                takeaway=takeaway,
            )
        self.stdout.write(f"  {len(NARRATIVES)} lesson narratives created.")
