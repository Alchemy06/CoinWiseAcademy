
from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.db import transaction

from covid_crash.candle_generator import generate_candles
from covid_crash.models import (
    LessonNarrative,
    Scenario,
    ScenarioFinale,
    ScenarioRound,
)


class Command(BaseCommand):

    @transaction.atomic
    def handle(self, *args, **opts):
        Scenario.objects.filter(order=1).delete()
        scenario = self._create_scenario()
        self._create_rounds(scenario)
        self._create_finale(scenario)
        self._create_narratives(scenario)
        self.stdout.write(self.style.SUCCESS(
            f"COVID Crash scenario seeded. "
            f"{scenario.rounds.count()} rounds, "
            f"{'finale OK' if hasattr(scenario, 'finale') else 'NO FINALE'}."
        ))


    def _create_scenario(self) -> Scenario:
        return Scenario.objects.create(
            order=1,
            title="The COVID Crash",
            subtitle="February 2020 to December 2020",
            historical_period="Feb 2020 – Dec 2020",
            lesson_tag="Volatility & Market Behaviour",
            accent_color="#E8354A",
            starting_balance_pence=1_000_000,
        )


    def _create_rounds(self, scenario: Scenario) -> None:

        rounds = [
            (
                0, date(2020, 2, 14), 792_000,
                "Mid-February 2020. Bitcoin has rallied from £5,500 in October "
                "to £7,920 today, a 44% gain in four months. The crypto press is "
                "bullish. There are early reports of a respiratory illness in "
                "China but few people are paying attention.",
            ),
            (
                1, date(2020, 3, 13), 435_500,
                "March 13, 2020. The WHO declared COVID-19 a pandemic two days "
                "ago. Yesterday, the FTSE 100 had its worst day since 1987 — "
                "down 11%. Bitcoin fell from £7,000 to £3,920 in a single 24-hour "
                "period. It has bounced slightly to £4,355. Headlines are about "
                "hospital capacity and lockdowns. Crypto is barely mentioned in "
                "the financial news.",
            ),
            (
                2, date(2020, 4, 30), 706_300,
                "End of April 2020. Bitcoin has recovered to £7,063, almost back "
                "to its pre-crash level. Governments worldwide have announced "
                "unprecedented stimulus packages. The first lockdowns are easing "
                "in some countries. The narrative around Bitcoin as an inflation "
                "hedge is gaining traction in financial media.",
            ),
            (
                3, date(2020, 7, 31), 862_500,
                "End of July 2020. Bitcoin has spent two months consolidating "
                "between £7,000 and £7,500 — a slow, frustrating sideways grind. "
                "In the last two weeks, it has broken out to £8,625. MicroStrategy, "
                "a US-listed software company, has announced a Bitcoin treasury "
                "allocation, the first major corporation to do so.",
            ),
            (
                4, date(2020, 10, 31), 1_061_500,
                "End of October 2020. Bitcoin has just broken £10,000 for the "
                "first time since the 2017 bull market — a major psychological "
                "level. PayPal has announced it will let users buy and sell "
                "Bitcoin. Institutional adoption headlines are accelerating. "
                "The mood is shifting from cautious to euphoric.",
            ),
        ]

        chart_start_date = date(2019, 10, 1)
        chart_start_price = 565_000

        prev_date = chart_start_date
        prev_price = chart_start_price

        for round_index, scenario_date, price_pence, context in rounds:


            needs_black_thursday = (round_index == 1)
            candles = generate_candles(
                prev_date, scenario_date + timedelta(days=1),
                prev_price, price_pence,
                black_thursday=needs_black_thursday,
            )
            ScenarioRound.objects.create(
                scenario=scenario,
                round_index=round_index,
                scenario_date=scenario_date,
                price_pence=price_pence,
                context_paragraph=context,
                candles=candles,
            )
            self.stdout.write(
                f"  Round {round_index} ({scenario_date}): "
                f"{len(candles)} candles, final close {candles[-1]['c']}p (expect {price_pence}p)"
            )

            prev_date = scenario_date + timedelta(days=1)
            prev_price = price_pence


    def _create_finale(self, scenario: Scenario) -> None:
        last_round_date = date(2020, 10, 31)
        last_round_price = 1_061_500
        end_date = date(2020, 12, 31)
        end_price = 2_121_500

        candles = generate_candles(
            last_round_date + timedelta(days=1), end_date + timedelta(days=1),
            last_round_price, end_price,
        )
        ScenarioFinale.objects.create(
            scenario=scenario,
            end_date=end_date,
            end_price_pence=end_price,
            candles=candles,
        )
        self.stdout.write(f"  Finale ({end_date}): {len(candles)} candles, end price {end_price}p")


    def _create_narratives(self, scenario: Scenario) -> None:
        narratives = [
            (
                "missed_it",
                "You stayed out.",
                (
                    "You ended the scenario with {final_value}, the same £10,000 you started with. "
                    "Bitcoin went from £7,920 to £21,215 over those ten months — a 168% gain. "
                    "Sitting in cash protected you from the March crash, but it also meant you missed "
                    "the recovery and the run that followed. There's nothing inherently wrong with cash. "
                    "But understand what you traded: you traded the chance of upside for the certainty "
                    "of nothing happening. In a year that saw Bitcoin nearly triple, doing nothing had "
                    "a real cost — even though no money left your account."
                ),
                "Sitting out a market is itself a position. The cost of that position is what would "
                "have happened if you'd been in it.",
            ),
            (
                "panic_seller",
                "You sold during the panic.",
                (
                    "You bought {total_bought_round_1} of BTC at around £7,920 in February, then sold "
                    "{total_sold_round_2} on March 13 at £4,355 — locking in a loss of {realised_loss_round_2}. "
                    "Bitcoin recovered to £7,063 within six weeks. By the end of the year it was £21,215. "
                    "The {realised_loss_round_2} you locked in as a permanent loss would have been "
                    "{would_have_been_value} of unrealised gain by December if you'd simply held. "
                    "Selling on the way down is the most expensive single decision retail investors make "
                    "in volatile markets. You were not wrong to feel afraid in March 2020 — almost everyone "
                    "did. But fear was not what the situation actually called for."
                ),
                "The price falling is not a reason to sell. It is, at most, a reason to ask whether "
                "your reason for owning has changed.",
            ),
            (
                "dip_buyer",
                "You bought when others were fleeing.",
                (
                    "You bought {total_bought_round_2} of BTC in March 2020 at around £4,355 — close to "
                    "the panic low. Within six weeks, the price had recovered to £7,063. By the end of "
                    "the year, BTC was £21,215. Your final portfolio value is {final_value} ({delta_pence_signed} "
                    "versus start, a {delta_pct_signed}% return). Buying when fear is at its peak is the "
                    "hardest trade in markets, because every signal — the news, your friends, your own body — "
                    "is telling you to do the opposite. The fact that you executed on it under those conditions "
                    "is genuinely uncommon. Note that you also got lucky: the March 2020 low held. It easily "
                    "could have continued lower for months. Conviction is rewarded over the long run, but "
                    "not on every individual trade."
                ),
                "Conviction at the panic bottom is rare. It is also where most of the long-term return is made.",
            ),
            (
                "disciplined_holder",
                "You held.",
                (
                    "You entered with {total_bought} and held through the March crash without selling. "
                    "Your position dropped 45% in six weeks and you didn't act on the fear. By December 31, "
                    "2020, BTC was £21,215 and your final portfolio value is {final_value} — a {delta_pct_signed}% "
                    "return. Holding through a 45% drawdown is harder than it looks on paper. Most retail "
                    "investors don't manage it. Holding requires a thesis that is robust to short-term price "
                    "action — without that thesis, every red candle is a reason to sell. You may have been "
                    "right by luck or right by analysis; either way, the outcome was the one disciplined "
                    "investing tends to produce over time."
                ),
                "Holding through volatility requires conviction based on understanding, not hope.",
            ),
            (
                "active_trader",
                "You traded actively.",
                (
                    "You made trades in {rounds_with_action_count} of the 5 rounds — buying and selling as "
                    "the situation evolved. Your final portfolio value is {final_value} ({delta_pence_signed} "
                    "versus start). In comparison: holding cash throughout would have given you £10,000. "
                    "Buying £10,000 at Round 1 and not touching it would have given you £26,786. Active "
                    "trading can outperform passive holding when the trader is right repeatedly — but the "
                    "data on retail trading is unforgiving. Most active traders underperform a simple "
                    "buy-and-hold approach over time, because each trade is another chance to be wrong, "
                    "another transaction cost, and another moment when emotion can intervene. Your specific "
                    "result here is the result of your specific decisions; it doesn't generalise."
                ),
                "Activity is not the same as alpha. Each additional trade is a chance to be wrong as "
                "much as a chance to be right.",
            ),
        ]

        for pattern_key, headline, body, takeaway in narratives:
            LessonNarrative.objects.create(
                scenario=scenario,
                pattern_key=pattern_key,
                headline=headline,
                body_template=body,
                takeaway=takeaway,
            )
        self.stdout.write(f"  {len(narratives)} lesson narratives created.")
