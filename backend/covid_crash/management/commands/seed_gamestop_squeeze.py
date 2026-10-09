
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
        Scenario.objects.filter(order=4).delete()
        scenario = self._create_scenario()
        self._create_rounds(scenario)
        self._create_finale(scenario)
        self._create_narratives(scenario)
        self.stdout.write(self.style.SUCCESS(
            f"GameStop Short Squeeze scenario seeded. "
            f"{scenario.rounds.count()} rounds, "
            f"{'finale OK' if hasattr(scenario, 'finale') else 'NO FINALE'}, "
            f"{scenario.narratives.count()} narratives."
        ))


    def _create_scenario(self) -> Scenario:
        prereq = (
            Scenario.objects.filter(order=3).first()
            or Scenario.objects.filter(order=2).first()
            or Scenario.objects.filter(order=1).first()
        )
        return Scenario.objects.create(
            order=4,
            title="The GameStop Short Squeeze",
            subtitle="January 2021 — when Reddit beat the hedge funds",
            historical_period="Jan 2021 – Feb 2021",
            lesson_tag="Reflexivity, Brokers & Mania",
            accent_color="#7C3AED",
            asset_symbol="GME",
            asset_name="GameStop Corp.",
            asset_unit="shares",
            asset_unit_label="shares",
            chart_log_scale=False,
            uses_custody_split=False,
            uses_broker_mechanics=True,
            recommended_prerequisite=prereq,
            starting_balance_pence=1_000_000,
        )


    def _create_rounds(self, scenario: Scenario) -> None:
        rounds = [
            (
                0, date(2021, 1, 11), 1_474,
                "January 11, 2021. Ryan Cohen, the former CEO of online pet food retailer "
                "Chewy, has just joined GameStop's board of directors. Cohen has been "
                "buying shares for months and now owns 9% of the company. He's known for "
                "turning a struggling business into a billion-dollar exit. The stock has "
                "jumped to £14.74 on the news. On Reddit's r/wallstreetbets, a user called "
                "'Roaring Kitty' has been posting analysis arguing GameStop is undervalued. "
                "The forum has 1.7 million members. The discussion of GME is intensifying.",
                "",
                "47k members online. Top post: 'GME and Ryan Cohen — DD inside (300 upvotes).'",
            ),
            (
                1, date(2021, 1, 22), 4_752,
                "January 22, 2021. GameStop has gone from £14 to £47 in 11 days. Hedge "
                "fund Citron Research published a tweet calling the stock a 'failed "
                "business' and predicting it would fall to $20 (£14.65). The Reddit "
                "reaction was furious. Short interest is now reported at 140% of the "
                "public float — meaning hedge funds have shorted more shares than exist "
                "in tradable form. The squeeze logic is becoming visible: if shorts have "
                "to cover, there aren't enough shares to go around.",
                "",
                "580k members online. Top post: 'GME to the moon 🚀🚀🚀 Melvin is finished (12k upvotes).'",
            ),
            (
                2, date(2021, 1, 27), 25_347,
                "January 27, 2021. GameStop closed at £253.47 today, up 21x from where "
                "it started the year. Melvin Capital, the hedge fund leading the short "
                "bet, has covered most of its position at a catastrophic loss — the firm "
                "is reportedly down 53% for the month. Citadel invested $2.75 billion in "
                "Melvin two days ago to keep it solvent. Elon Musk tweeted 'Gamestonk!!' "
                "yesterday. Equity trading volume hit a record 24.5 billion shares today. "
                "Some retail traders are reporting overnight gains in the millions.",
                "⚠ Mania peak: Trading volume at all-time high. Short interest covering. Volatility extreme.",
                "6.5M members online. Top post: 'WE LIKE THE STOCK 💎🙌 (89k upvotes).' Trending: 'NEVER SELL'.",
            ),
            (
                3, date(2021, 1, 28), 14_131,
                "January 28, 2021. This morning, GME hit £350 in pre-market trading. "
                "Then your broker imposed Position Close Only restrictions. Anyone using "
                "PCO-restricted brokers could sell GME but not buy. The price collapsed "
                "from £350 to £141 by close. WSB is in chaos. Robinhood's CEO is being "
                "interviewed on CNBC explaining 'collateral requirements.' A class-action "
                "lawsuit has already been filed.",
                "⚠ Trading restriction in effect (Trading Forge users). Highford & Latham allows trading normally.",
                "7.2M members online. Top posts: 'ROBINHOOD HALTED BUYING' (240k upvotes), 'CALL YOUR REPRESENTATIVES'.",
            ),
            (
                4, date(2021, 2, 4), 3_917,
                "February 4, 2021. GameStop has fallen from £141 to £39 over the past "
                "week. The squeeze is over. Most short-sellers have closed their "
                "positions and the gravitational pull of fundamental valuation is "
                "reasserting itself. WSB is split between believers ('still holding "
                "💎🙌') and people working out their tax bill on losses. A US "
                "Congressional hearing is scheduled. Robinhood's CEO Vlad Tenev has "
                "apologized to customers and faces lawsuits. The mainstream press has "
                "largely moved on, but the lasting effects on retail investing — broker "
                "scrutiny, regulatory attention, and a generation's first lived market "
                "lesson — are still unfolding.",
                "",
                "8.1M members online. Mix of 'still holding 💎🙌' and 'how do I file taxes on a £8k loss'.",
            ),
        ]

        chart_start_date = date(2020, 7, 1)
        chart_start_price = 530

        prev_date = chart_start_date
        prev_price = chart_start_price

        for round_index, scenario_date, price_pence, context, signal, wsb_text in rounds:
            candles = generate_candles(
                prev_date, scenario_date + timedelta(days=1),
                prev_price, price_pence,
                rng_seed=400 + round_index,
            )
            round_obj = ScenarioRound.objects.create(
                scenario=scenario,
                round_index=round_index,
                scenario_date=scenario_date,
                price_pence=price_pence,
                context_paragraph=context,
                structural_signal_text=signal,
                wsb_feed_text=wsb_text,
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
        last_round_date = date(2021, 2, 4)
        last_round_price = 3_917
        end_date = date(2021, 2, 19)
        end_price = 2_897

        candles = generate_candles(
            last_round_date + timedelta(days=1), end_date + timedelta(days=1),
            last_round_price, end_price,
            rng_seed=500,
        )
        ScenarioFinale.objects.create(
            scenario=scenario,
            end_date=end_date,
            end_price_pence=end_price,
            candles=candles,
        )
        self.stdout.write(
            f"  Finale ({end_date}): {len(candles)} candles, end price {end_price}p"
        )


    def _create_narratives(self, scenario: Scenario) -> None:
        narratives = [
            (
                "stayed_out",
                "You watched it happen.",
                "You stayed in cash through the GameStop squeeze. Your final portfolio "
                "is {final_value}, starting balance intact. Some retail investors made "
                "life-changing money during this two-week period — selling at the £253 "
                "peak meant a 17x return on a £10,000 entry. Many more lost most of "
                "their position by buying near the top. The squeeze was a meta-game "
                "played by hedge funds, retail coordinators, and algorithms — not a "
                "fundamental bet on GameStop's business. Sitting it out meant missing "
                "both the upside and the downside. The skill in mania-period investing "
                "is recognising that you're inside one and choosing whether to "
                "participate. You chose not to participate, which is a defensible "
                "answer to a hard question.",
                "The hardest position to hold during a mania is no position at all. It is also often the wisest.",
            ),
            (
                "margin_call_wipeout",
                "You got margin-called.",
                "You bought GME on 2x margin through Trading Forge — borrowing "
                "{margin_amount} on top of your {own_capital} cash to buy "
                "{shares_bought} shares at an average of {avg_entry_price} per share. "
                "When GME crashed in Round 4, the position fell below your maintenance "
                "margin requirement. Trading Forge auto-liquidated the entire position "
                "at {liquidation_price} per share, well below your average cost. After "
                "the broker repaid itself the {margin_amount} you borrowed, you were "
                "left with {final_value}. The price recovered briefly afterwards — but "
                "you couldn't ride out the drawdown because you didn't own the position "
                "outright; you'd borrowed half of it. Margin amplifies gains on the way "
                "up. It also takes away your ability to be patient, which is the only "
                "thing that lets investors survive volatility.",
                "Margin doesn't just multiply your gains and losses. It removes your ability to wait.",
            ),
            (
                "sold_at_peak",
                "You sold during the peak.",
                "You bought GME for {total_bought} on or before Round 1, then sold "
                "{total_sold_at_peak} during Round 2 or Round 3 — at an average price "
                "of {avg_peak_exit_price} per share. Your final portfolio is "
                "{final_value} ({delta_pct_signed}%). Selling into a euphoric move when "
                "WSB is shouting 'NEVER SELL' is genuinely difficult. The gravity of "
                "the crowd's conviction is real. You overcame it. Note: this kind of "
                "timing has more luck in it than retail investors usually want to admit. "
                "Selling at £150 in Round 2 was a great trade. Waiting one more day "
                "would have been a missed opportunity. The skill that's repeatable is "
                "having a target and selling at it, not predicting the exact peak.",
                "Predefined exit prices are a discipline. Predicted peaks are luck.",
            ),
            (
                "diamond_hands_held_to_zero",
                "💎🙌 Held to the unwind.",
                "You bought GME for {total_bought} on or before Round 1 and never "
                "sold. By the end of the scenario, GME had fallen from the £253 peak "
                "to {end_price} per share. Your final portfolio is {final_value}, a "
                "{delta_pct_signed}% return on the original entry. The 'diamond hands' "
                "culture on WSB framed selling as betrayal of the cause. In market "
                "terms, refusing to sell during a euphoric peak is the opposite of "
                "disciplined investing — it's commitment to a position based on "
                "community identity rather than analysis. Some users who held GME "
                "through the squeeze still hold it years later, watching the position "
                "decline. The fact that you 'didn't lose money' if you bought before "
                "the squeeze and held doesn't mean the squeeze didn't cost you "
                "something — every alternative use of that capital, including a simple "
                "index fund, delivered better returns over the same period.",
                "Identity-based investing — owning a stock because of what owning it represents — produces returns based on identity, not finance.",
            ),
            (
                "fomo_buyer",
                "You bought into the peak.",
                "You bought {total_bought_at_peak} of GME during Round 2 or Round 3 — "
                "the peak of the mania — at an average price of {avg_entry_price} per "
                "share. By the end of the scenario, GME had fallen to {end_price} per "
                "share. Your final portfolio is {final_value}, a {delta_pct_signed}% "
                "return. Buying into a parabolic move feels rational in the moment "
                "because the move feels confirmed by every signal: the crowd's "
                "enthusiasm, the price chart's trajectory, the fear of being the last "
                "person not in. By the time these signals are loud enough to convince "
                "a cautious person, the move is usually nearly over. The strongest "
                "predictor of future returns is starting valuation, not recent price "
                "action. £253 for GameStop was a price the market would pay for one "
                "day. It was not a valuation that any fundamental model supported. "
                "Distinguishing the two is the skill.",
                "Recent price action is not the same as expected return. The first lies; the second pays.",
            ),
            (
                "caught_by_pco_sold",
                "PCO trapped you — and you sold.",
                "You held GME on Trading Forge when the broker imposed Position Close "
                "Only on January 28. Unable to buy more, you chose to sell "
                "{total_sold_round_3} of your position at {avg_round_3_exit_price} per "
                "share. Your final portfolio is {final_value}. Trading Forge's PCO "
                "restriction was the moment that turned this from a market event into "
                "a political one. Many retail investors felt — accurately — that the "
                "rules changed because professionals were losing money. The lesson here "
                "is not that Trading Forge was uniquely bad (other brokers did the "
                "same, citing real clearing-house collateral requirements). The lesson "
                "is that the broker you chose for low fees and slick UX has the power "
                "to change the rules at the moment those rules matter most. Highford "
                "& Latham didn't impose PCO. The £11.95 commission per trade you would "
                "have paid through them is the price of not being subject to that "
                "decision.",
                "Convenience has a price. The price is paid at the moment convenience would have been most useful.",
            ),
            (
                "caught_by_pco_held",
                "PCO trapped you — and you held.",
                "You held GME on Trading Forge through the PCO restriction without "
                "selling. Your final position of {final_shares} shares is worth "
                "{final_position_value}. Your final portfolio is {final_value}, a "
                "{delta_pct_signed}% return on what you originally invested. Holding "
                "through the squeeze unwind was a real choice — many WSB users did the "
                "same out of solidarity, anger at Robinhood, or genuine belief that "
                "the stock would recover. It hasn't, in any sustained way. The "
                "position you ended with was determined less by your analysis and more "
                "by the broker's decision to lock you out. That's a different kind of "
                "risk than the market risk you signed up for.",
                "When the broker is part of the system, the broker's decisions are part of your risk.",
            ),
            (
                "took_profits_early",
                "You took profits early.",
                "You bought GME for {total_bought} in Round 0 or Round 1, then sold "
                "{total_sold_early} during Round 1 or Round 2 — at an average price "
                "of {avg_early_exit_price} per share. Your final portfolio is "
                "{final_value} ({delta_pct_signed}%). Selling into a continuing rally "
                "feels wrong — the stock kept going up after your exit, possibly by a "
                "lot. But selling at a profit you're happy with is a complete trade. "
                "'I sold too early' is a common regret, but it's a much smaller "
                "mistake than 'I didn't sell at all.' You picked an exit that felt "
                "acceptable and you took it. That's the discipline that produces "
                "consistent returns over time, not the ability to predict tops.",
                "Selling at a profit is always a complete trade. Holding for more is always a new trade — judged on its own.",
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
