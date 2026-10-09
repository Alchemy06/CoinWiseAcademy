
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
        Scenario.objects.filter(order=2).delete()
        scenario = self._create_scenario()
        self._create_rounds(scenario)
        self._create_finale(scenario)
        self._create_narratives(scenario)
        self.stdout.write(self.style.SUCCESS(
            f"Luna Collapse scenario seeded. "
            f"{scenario.rounds.count()} rounds, "
            f"{'finale OK' if hasattr(scenario, 'finale') else 'NO FINALE'}."
        ))


    def _create_scenario(self) -> Scenario:
        prereq = Scenario.objects.filter(order=1).first()
        return Scenario.objects.create(
            order=2,
            title="The Luna Collapse",
            subtitle="May 2022 — when £91 became 2 pence in five days",
            historical_period="Apr 2022 – May 2022",
            lesson_tag="Mechanism Failure & Insolvency",
            accent_color="#7C2D12",
            asset_symbol="LUNA",
            asset_name="Terra (LUNA)",
            chart_log_scale=True,
            recommended_prerequisite=prereq,
            starting_balance_pence=1_000_000,
        )


    def _create_rounds(self, scenario: Scenario) -> None:
        rounds = [
            (
                0, date(2022, 4, 5), 9_122,
                "April 5, 2022. LUNA has just hit an all-time high of £91.22. "
                "Anchor Protocol is offering 19.5% yield on UST deposits. Crypto "
                "Twitter has nicknamed Terra holders 'Lunatics' and they are loud. "
                "The project's founder Do Kwon is a celebrity. UST is the "
                "third-largest stablecoin in the world. Some critics — including "
                "Vitalik Buterin and Binance's Changpeng Zhao — have raised concerns "
                "about the sustainability of the yield, but they are dismissed as "
                "outsiders who don't understand the model.",
                "",
            ),
            (
                1, date(2022, 5, 6), 6_179,
                "May 6, 2022. LUNA has fallen from £91 to £62 over the last month, "
                "in line with the broader crypto market — Bitcoin is also down. The "
                "narrative is that crypto is in a 'cooldown' phase. Anchor Protocol "
                "still offers 19.5% on UST. There are no obvious red flags. The Terra "
                "ecosystem looks healthy from the outside.",
                "",
            ),
            (
                2, date(2022, 5, 9), 4_919,
                "May 9, 2022. LUNA is down to £49 — but the bigger story is UST. "
                "The supposedly dollar-pegged stablecoin has fallen to $0.985 today. "
                "The peg held briefly with Luna Foundation Guard buying support, but "
                "the gap is widening. The Anchor yield is unchanged, but withdrawals "
                "have spiked.",
                "⚠ Structural signal: UST has lost its dollar peg. The LUNA-UST mechanism is breaking.",
            ),
            (
                3, date(2022, 5, 11), 407,
                "May 11, 2022. LUNA is at £4. It was £49 two days ago. UST is at "
                "$0.30. The Terra team has just passed Proposal 1164, accelerating "
                "UST-to-LUNA conversion. This is supposed to defend the peg by "
                "burning UST — but it is flooding the market with newly-minted LUNA. "
                "The supply of LUNA is growing exponentially. Twitter is split between "
                "'Lunatics' insisting on a recovery and analysts saying the project "
                "is over.",
                "⚠ Structural signal: UST is at $0.30. LUNA supply is growing exponentially. The death spiral is active.",
            ),
            (
                4, date(2022, 5, 13), 24,
                "May 13, 2022. LUNA is at £0.24 — about 24 pence per token. UST is "
                "at $0.15. The Terra blockchain has been briefly halted. Reuters and "
                "the BBC are running stories about lost savings. Approximately £35 "
                "billion in market value has been destroyed. The Terra team is "
                "rumoured to be planning a fork.",
                "⚠ Structural signal: LUNA has lost 99.7% of peak value. Terra blockchain temporarily halted.",
            ),
        ]

        chart_start_date = date(2022, 1, 1)
        chart_start_price = 6_500

        prev_date = chart_start_date
        prev_price = chart_start_price

        for round_index, scenario_date, price_pence, context, signal in rounds:
            candles = generate_candles(
                prev_date, scenario_date + timedelta(days=1),
                prev_price, price_pence,
                rng_seed=100 + round_index,
            )
            ScenarioRound.objects.create(
                scenario=scenario,
                round_index=round_index,
                scenario_date=scenario_date,
                price_pence=price_pence,
                context_paragraph=context,
                structural_signal_text=signal,
                candles=candles,
            )
            self.stdout.write(
                f"  Round {round_index} ({scenario_date}): "
                f"{len(candles)} candles, final close {candles[-1]['c']}p (expect {price_pence}p)"
            )
            prev_date = scenario_date + timedelta(days=1)
            prev_price = price_pence


    def _create_finale(self, scenario: Scenario) -> None:
        last_round_date = date(2022, 5, 13)
        last_round_price = 24
        end_date = date(2022, 5, 27)
        end_price = 4

        candles = generate_candles(
            last_round_date + timedelta(days=1), end_date + timedelta(days=1),
            last_round_price, end_price,
            rng_seed=200,
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
                "stayed_out",
                "You read the room.",
                (
                    "You stayed in cash throughout the Luna collapse. Your {final_value} "
                    "is intact. LUNA went from £91.22 to fractions of a penny in five "
                    "weeks — about a 99.97% loss for anyone who entered at the top. The "
                    "19.5% Anchor yield was real, but it was funded by subsidies, not by "
                    "sustainable returns. Recognising that 'too good to be true' yields "
                    "almost always are is one of the most reliable rules in finance. Note "
                    "that staying out also meant not having to watch the chart drop and "
                    "resist the temptation to 'buy the dip' as it fell. That temptation "
                    "is real, and many investors who started in cash ended up entering "
                    "during the crash because they thought they were getting a bargain. "
                    "You avoided that trap entirely."
                ),
                "Yields that beat the entire global financial system are a red flag, not a discovery.",
            ),
            (
                "bought_at_peak_held",
                "You held into the floor.",
                (
                    "You bought {total_bought} of LUNA at an average price of around "
                    "{avg_entry_price}. By May 13, 2022, LUNA was £0.24 — and falling "
                    "further. Your final position is worth {final_value}. You lost "
                    "{delta_pence}, a {delta_pct}% drawdown. The lesson from the COVID "
                    "Crash was 'hold through fear.' That lesson is correct when the asset "
                    "is volatile but fundamentally sound. It is wrong when the asset "
                    "itself is failing. The signal to exit was UST losing its peg on "
                    "May 9 — that event meant the entire mechanism supporting LUNA's "
                    "price was broken. After that point, holding was not patience. It "
                    "was denial. The hardest part of investing is recognising when the "
                    "rules of one situation do not apply to another."
                ),
                "Volatility means the price moved. Insolvency means the asset broke. The first you can wait out. The second you cannot.",
            ),
            (
                "signal_reader",
                "You read the signal.",
                (
                    "You bought {total_bought} of LUNA before the depeg, then sold "
                    "{total_sold_at_signal} on or near May 9 when UST lost its peg. "
                    "You exited at an average price of around {avg_exit_price} — a loss "
                    "of {realised_loss}, but you saved approximately {would_have_lost_holding} "
                    "compared to holding. Your final portfolio is {final_value}. You did "
                    "the hardest thing in markets: you took a moderate, certain loss to "
                    "avoid a catastrophic, possible one. Most retail investors didn't "
                    "manage this — they held, hoping for a recovery that wasn't coming. "
                    "You read the depeg as what it was: a structural signal, not a "
                    "buying opportunity."
                ),
                "Sometimes the right trade is the loss you accept on time, not the gain you wait for.",
            ),
            (
                "buy_the_dip_into_zero",
                "You bought the dip into zero.",
                (
                    "You bought {total_bought_during_collapse} of LUNA during the "
                    "collapse — at average prices around {avg_collapse_entry}. Your "
                    "final position is worth {final_value}. The 'buy the dip' instinct "
                    "comes from a true rule: in mean-reverting markets, prices that drop "
                    "tend to recover. But Luna's drop was not a market drawdown. It was "
                    "the death of an algorithmic stablecoin mechanism. After UST lost "
                    "its peg on May 9, every LUNA token being created to defend the peg "
                    "was diluting the supply further — meaning the price was going to "
                    "keep falling. There was no 'dip' to buy. There was a sinking ship. "
                    "Recognising mechanism failure as different from price volatility is "
                    "the lesson here. It is also one of the hardest lessons in investing "
                    "because the data only tells you which it was after the fact."
                ),
                "Not every drawdown is a sale. Some drawdowns are an asset disappearing in real time.",
            ),
            (
                "partial_exit",
                "You exited late, but you exited.",
                (
                    "You sold {total_sold} of your LUNA position in Round 4 or 5, after "
                    "most of the damage was already done. Your final portfolio is "
                    "{final_value} — a loss of {delta_pence}, or {delta_pct}%. Selling "
                    "late is better than not selling. Locking in a 95% loss is bad; "
                    "sitting on a 99.9% loss is worse. The instinct to wait for recovery "
                    "becomes harder to fight as the loss deepens, because the "
                    "psychological cost of accepting the loss grows with the size of the "
                    "loss. This is loss aversion, and it is the mechanism by which large "
                    "losses become catastrophic ones. You overcame it eventually. Many "
                    "retail Luna holders did not."
                ),
                "The longer you wait to accept a loss, the harder it gets. Take the bandage off early.",
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
