
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
        Scenario.objects.filter(order=3).delete()
        scenario = self._create_scenario()
        self._create_rounds(scenario)
        self._create_finale(scenario)
        self._create_narratives(scenario)
        self.stdout.write(self.style.SUCCESS(
            f"FTX Collapse scenario seeded. "
            f"{scenario.rounds.count()} rounds, "
            f"{'finale OK' if hasattr(scenario, 'finale') else 'NO FINALE'}."
        ))


    def _create_scenario(self) -> Scenario:
        prereq = (
            Scenario.objects.filter(order=2).first()
            or Scenario.objects.filter(order=1).first()
        )
        return Scenario.objects.create(
            order=3,
            title="The FTX Collapse",
            subtitle="November 2022 — when 'safe' meant something different",
            historical_period="Oct 2022 – Mar 2023",
            lesson_tag="Counterparty Risk & Custody",
            accent_color="#0F766E",
            asset_symbol="BTC",
            asset_name="Bitcoin",
            chart_log_scale=False,
            uses_custody_split=True,
            recommended_prerequisite=prereq,
            starting_balance_pence=1_000_000,
        )


    def _create_rounds(self, scenario: Scenario) -> None:
        rounds = [
            (
                0, date(2022, 10, 1), 1_708_000,
                "October 2022. Bitcoin has stabilised around £17,000 after a brutal "
                "first half of 2022 (the Luna collapse and broader market crash). "
                "Inflation is high, central banks are raising rates. Crypto has "
                "stabilised. FTX is one of the largest exchanges in the world. Sam "
                "Bankman-Fried, its CEO, is on the cover of Fortune magazine being "
                "asked if he's the next Warren Buffett. FTX offers 7% APY on BTC "
                "deposits. There are no obvious red flags.\n\n"
                "FTX allows you to earn 7% APY on your BTC balance. Moving BTC to "
                "your own self-custody wallet costs £15 per transfer, but your BTC "
                "is then fully under your control and not subject to any exchange risk.",
                "",
            ),
            (
                1, date(2022, 11, 1), 1_783_000,
                "November 1, 2022. Bitcoin has crept up 4% in October. The crypto "
                "market is calm. Yesterday CoinDesk submitted a story about FTX's "
                "sister company Alameda Research that is expected to publish "
                "tomorrow — but for now, no public information indicates anything "
                "wrong with FTX. The 7% yield programme is still active. Your BTC "
                "on FTX has earned its first month of yield.",
                "",
            ),
            (
                2, date(2022, 11, 6), 1_840_000,
                "November 6, 2022. The CoinDesk article published four days ago "
                "revealed that Alameda Research's balance sheet was heavily "
                "dependent on FTT — FTX's own token. Today, Binance CEO Changpeng "
                "Zhao announced Binance will sell its $530 million in FTT holdings "
                "'due to recent revelations.' FTT has dropped 15% on the news. "
                "There is debate on Twitter about whether FTX is solvent. Some "
                "users are starting to withdraw funds from the exchange.",
                "⚠ Counterparty signal: FTX's exchange token is dropping on Binance's announcement.",
            ),
            (
                3, date(2022, 11, 8), 1_609_000,
                "November 8, 2022. FTX has just halted customer withdrawals. The "
                "official statement cites 'a significant liquidity crunch.' Binance "
                "has announced a letter of intent to acquire FTX. Bitcoin has dropped "
                "13% on the news. Anyone with BTC still on FTX cannot withdraw it. "
                "Twitter is split between people calling this a temporary "
                "inconvenience and people calling it the beginning of a bank run.",
                "⚠ Counterparty alert: FTX has halted withdrawals. BTC held on FTX cannot be moved.",
            ),
            (
                4, date(2022, 11, 11), 1_483_000,
                "November 11, 2022. The Binance acquisition is dead — Binance walked "
                "away after seeing FTX's books. FTX, Alameda Research, and 130 "
                "affiliated companies have filed for Chapter 11 bankruptcy in the "
                "United States. Sam Bankman-Fried has resigned as CEO. Reports "
                "indicate $1–2 billion in customer funds are unaccounted for. "
                "Approximately $477 million has been stolen from FTX wallets in an "
                "unauthorised transaction today.",
                "⚠ Bankruptcy: Customer funds on FTX are presumed lost.",
            ),
        ]

        chart_start_date = date(2022, 7, 1)
        chart_start_price = 1_580_000

        prev_date = chart_start_date
        prev_price = chart_start_price

        for round_index, scenario_date, price_pence, context, signal in rounds:
            candles = generate_candles(
                prev_date, scenario_date + timedelta(days=1),
                prev_price, price_pence,
                rng_seed=300 + round_index,
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
                f"{len(candles)} candles, final close {candles[-1]['c']}p "
                f"(expect {price_pence}p)"
            )
            prev_date = scenario_date + timedelta(days=1)
            prev_price = price_pence


    def _create_finale(self, scenario: Scenario) -> None:
        last_round_date = date(2022, 11, 11)
        last_round_price = 1_483_000
        end_date = date(2023, 3, 31)
        end_price = 2_300_000

        candles = generate_candles(
            last_round_date + timedelta(days=1), end_date + timedelta(days=1),
            last_round_price, end_price,
            rng_seed=400,
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
                "You watched from the sidelines.",
                (
                    "You stayed in cash through the FTX collapse. Your {final_value} "
                    "is intact. About a million FTX customers were less fortunate — some "
                    "lost their entire crypto holdings overnight. The 7% yield FTX offered "
                    "was real, but it was rent paid for the privilege of letting FTX use "
                    "customer funds for activities customers couldn't see. When those "
                    "activities went bad, the yield, the principal, and the convenience "
                    "disappeared together. Sitting out meant missing the BTC recovery from "
                    "£14,000 in November 2022 to £23,000 by March 2023 — a roughly £3,500 "
                    "opportunity cost if you'd held BTC in self-custody instead. But it also "
                    "meant zero exposure to counterparty risk, which is a real risk worth "
                    "understanding."
                ),
                "Yield from a centralised exchange is income from an unsecured loan to that exchange. Price it accordingly.",
            ),
            (
                "pure_self_custody",
                "Your keys, your coins.",
                (
                    "You bought {total_bought} of BTC and kept it in self-custody throughout. "
                    "When FTX halted withdrawals on November 8 and filed bankruptcy on "
                    "November 11, your position was completely unaffected. By March 2023, "
                    "BTC had recovered to £23,000. Your final portfolio is {final_value} — "
                    "a {delta_pct_signed}% return on the entry. The {transfer_fees_paid} you "
                    "paid in transfer fees was a fraction of what you would have lost holding "
                    "on FTX. 'Not your keys, not your coins' sounds like a slogan, but it is a "
                    "description of how custody actually works. If you cannot sign the "
                    "transaction, the asset belongs to whoever can."
                ),
                "The right place to hold an asset is the place that doesn't depend on someone else's solvency.",
            ),
            (
                "signal_reader",
                "You read the warning.",
                (
                    "You initially held BTC on FTX, then moved {total_moved_to_self} to "
                    "self-custody on or after November 6 — when the Alameda balance sheet "
                    "leaked and Binance announced it would dump FTT. Two days later, FTX "
                    "halted withdrawals. Three days after that, it filed bankruptcy. You read "
                    "the signal and acted on it. Your final portfolio is {final_value} — "
                    "{delta_pct_signed}% on the entry. You paid {transfer_fees_paid} in "
                    "transfer fees, which is the price of insurance against counterparty "
                    "failure. Acting on a financial warning before it becomes obvious is the "
                    "rarest skill in retail investing."
                ),
                "The cost of moving early is small. The cost of moving late is everything.",
            ),
            (
                "partial_protection",
                "You hedged but kept exposure.",
                (
                    "When the Alameda story broke, you moved {total_moved_to_self} of your "
                    "BTC to self-custody — but kept {btc_left_on_ftx_at_bankruptcy} on FTX, "
                    "perhaps for the yield, perhaps for liquidity, perhaps because moving "
                    "everything felt paranoid. When FTX filed bankruptcy, the BTC you had "
                    "kept on FTX was worth {ftx_loss_gbp} and is now lost. Your final "
                    "portfolio is {final_value} — your protected BTC is intact, but the "
                    "unprotected portion is gone. Partial protection is better than no "
                    "protection. It is also a useful demonstration that risk management in "
                    "fractions does not fully eliminate the risk — only the protected "
                    "fraction is safe."
                ),
                "Counterparty risk doesn't reward partial mitigation the way market risk does. Either you're exposed or you're not.",
            ),
            (
                "full_loss",
                "You lost it on the exchange.",
                (
                    "You bought {total_bought} of BTC and held all or most of it on FTX "
                    "through the bankruptcy. At the moment of FTX's bankruptcy filing on "
                    "November 11, you held {btc_lost_on_ftx} on the exchange, worth "
                    "{ftx_loss_gbp} at that day's price. That BTC is gone. Your final "
                    "portfolio is {final_value}, a {delta_pct_signed}% return on the "
                    "original entry. The 7% yield FTX paid you over the scenario was real — "
                    "and it accelerated the loss because that yield was also held on FTX and "
                    "was also lost. The lesson here is not that FTX was uniquely fraudulent "
                    "(although it was). The lesson is that holding crypto on any centralised "
                    "exchange is a loan to that exchange, with the asset returned at their "
                    "discretion. Mt. Gox, QuadrigaCX, Celsius, BlockFi, and Voyager all "
                    "delivered the same lesson before FTX did. Self-custody is not paranoia. "
                    "It is the default to which exchanges are the convenient exception."
                ),
                "An asset you cannot withdraw is not an asset you own.",
            ),
            (
                "actively_traded",
                "You exited before the bankruptcy.",
                (
                    "You sold most or all of your BTC before FTX's bankruptcy — exiting at "
                    "an average price around {avg_exit_price}. Your final portfolio is "
                    "{final_value}. You avoided the FTX-specific loss, but you also missed "
                    "the BTC recovery from £14,000 in November 2022 to £23,000 by March "
                    "2023. Selling during a market panic is a different skill from "
                    "self-custody — selling protects you from price risk; self-custody "
                    "protects you from counterparty risk. The two are independent, and "
                    "confusing one for the other costs money in different directions. In the "
                    "FTX case specifically, moving BTC off FTX would have addressed the "
                    "actual risk without forcing you to crystallise the price risk by selling."
                ),
                "Selling addresses market risk. Moving addresses custody risk. Don't conflate them.",
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
