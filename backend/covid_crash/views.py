
from django.db import transaction
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from .models import (
    Scenario, ScenarioRound, ScenarioFinale,
    LessonNarrative, UserScenarioAttempt, UserTradingProfile,
)
from .services import (
    derive_attempt_state,
    execute_buy,
    execute_sell,
    execute_move,
    select_broker,
    compute_ftx_yield,
    trigger_ftx_withdrawal_halt,
    trigger_ftx_bankruptcy,
    compute_margin_interest,
    trigger_pco,
    check_and_execute_margin_call,
    detect_behaviour_pattern,
    render_lesson_narrative,
    compute_reference_outcomes,

    execute_buy_multi,
    execute_sell_multi,
    derive_multi_asset_state,
    _compute_gfc_reference_outcomes,
)


def _serialize_scenario(scenario) -> dict:
    return {
        'id': scenario.id,
        'title': scenario.title,
        'subtitle': scenario.subtitle,
        'historical_period': scenario.historical_period,
        'lesson_tag': scenario.lesson_tag,
        'accent_color': scenario.accent_color,
        'starting_balance_pence': scenario.starting_balance_pence,
        'order': scenario.order,
        'asset_symbol': scenario.asset_symbol,
        'asset_name': scenario.asset_name,
        'chart_log_scale': scenario.chart_log_scale,
        'uses_custody_split': scenario.uses_custody_split,
        'uses_broker_mechanics': scenario.uses_broker_mechanics,
        'asset_unit': scenario.asset_unit,
        'asset_unit_label': scenario.asset_unit_label,

        'is_multi_asset': scenario.is_multi_asset,
        'available_assets': scenario.available_assets,
        'recommended_prerequisite_id': (
            scenario.recommended_prerequisite_id
            if scenario.recommended_prerequisite_id else None
        ),
    }


def _serialize_round(round_obj) -> dict:
    return {
        'round_index': round_obj.round_index,
        'scenario_date': round_obj.scenario_date.isoformat(),
        'price_pence': round_obj.price_pence,
        'context_paragraph': round_obj.context_paragraph,
        'structural_signal_text': round_obj.structural_signal_text,
        'wsb_feed_text': round_obj.wsb_feed_text,
        'candles': round_obj.candles,

        'asset_closing_prices': round_obj.asset_closing_prices,
        'intraday_ticks': round_obj.intraday_ticks,
        'news_flashes': round_obj.news_flashes,
    }


def _current_price_pence(attempt) -> int:
    if attempt.is_complete:
        try:
            return attempt.scenario.finale.end_price_pence
        except ScenarioFinale.DoesNotExist:
            return 0
    try:
        round_obj = attempt.scenario.rounds.get(round_index=attempt.current_round_index)
        return round_obj.price_pence
    except ScenarioRound.DoesNotExist:
        return 0


def _current_prices_multi(attempt) -> dict:
    if attempt.is_complete:
        try:
            finale = attempt.scenario.finale

            candles = finale.candles
            if candles:
                last = candles[-1]
                return {
                    a: last[a]['c']
                    for a in attempt.scenario.available_assets
                    if a in last
                }
        except ScenarioFinale.DoesNotExist:
            pass
        return {}
    try:
        round_obj = attempt.scenario.rounds.get(round_index=attempt.current_round_index)
        return round_obj.asset_closing_prices or {}
    except ScenarioRound.DoesNotExist:
        return {}


def _get_current_prices(attempt):
    if attempt.scenario.is_multi_asset:
        return _current_prices_multi(attempt)
    return _current_price_pence(attempt)


def _all_candles_to_date(attempt) -> list:
    rounds = attempt.scenario.rounds.filter(
        round_index__lte=attempt.current_round_index
    ).order_by('round_index')
    candles = []
    for r in rounds:
        candles.extend(r.candles)
    if attempt.is_complete:
        try:
            candles.extend(attempt.scenario.finale.candles)
        except ScenarioFinale.DoesNotExist:
            pass
    return candles


def _serialize_attempt(attempt) -> dict:
    current_price = _get_current_prices(attempt)
    state = derive_attempt_state(attempt, current_price)


    current_round = None
    if not attempt.is_complete:
        try:
            round_obj = attempt.scenario.rounds.get(round_index=attempt.current_round_index)
            current_round = _serialize_round(round_obj)
        except ScenarioRound.DoesNotExist:
            pass

    return {
        'id': attempt.id,
        'scenario': _serialize_scenario(attempt.scenario),
        'started_at': attempt.started_at.isoformat(),
        'completed_at': attempt.completed_at.isoformat() if attempt.completed_at else None,
        'is_complete': attempt.is_complete,
        'current_round_index': attempt.current_round_index,
        'action_log': attempt.action_log,
        'state': state,
        'current_round': current_round,
        'all_candles': _all_candles_to_date(attempt),
        'final_state_snapshot': attempt.final_state_snapshot if attempt.is_complete else None,
    }


def _complete_attempt(attempt) -> None:
    if attempt.scenario.is_multi_asset:

        try:
            finale = attempt.scenario.finale
            candles = finale.candles
            if candles:
                last = candles[-1]
                end_prices = {
                    a: last[a]['c']
                    for a in attempt.scenario.available_assets
                    if a in last
                }
            else:
                end_prices = {}
        except ScenarioFinale.DoesNotExist:
            end_prices = _current_prices_multi(attempt)

        final_state = derive_multi_asset_state(attempt, end_prices)
        pattern_key = detect_behaviour_pattern(attempt)

        try:
            narrative = LessonNarrative.objects.get(
                scenario=attempt.scenario, pattern_key=pattern_key,
            )
            rendered_narrative = render_lesson_narrative(narrative, attempt, final_state)
        except LessonNarrative.DoesNotExist:
            rendered_narrative = None

        reference_outcomes = _compute_gfc_reference_outcomes(attempt.scenario, end_prices)
        end_price_pence = end_prices.get('FTSE', 0)

        attempt.final_state_snapshot = {
            'final_state': final_state,
            'pattern_key': pattern_key,
            'narrative': rendered_narrative,
            'reference_outcomes': reference_outcomes,
            'end_price_pence': end_price_pence,
            'end_prices': end_prices,
        }
    else:

        try:
            finale = attempt.scenario.finale
            end_price = finale.end_price_pence
        except ScenarioFinale.DoesNotExist:
            end_price = _current_price_pence(attempt)

        final_state = derive_attempt_state(attempt, end_price)
        pattern_key = detect_behaviour_pattern(attempt)

        try:
            narrative = LessonNarrative.objects.get(
                scenario=attempt.scenario, pattern_key=pattern_key,
            )
            rendered_narrative = render_lesson_narrative(narrative, attempt, final_state)
        except LessonNarrative.DoesNotExist:
            rendered_narrative = None

        reference_outcomes = compute_reference_outcomes(attempt.scenario, end_price)

        attempt.final_state_snapshot = {
            'final_state': final_state,
            'pattern_key': pattern_key,
            'narrative': rendered_narrative,
            'reference_outcomes': reference_outcomes,
            'end_price_pence': end_price,
        }

    attempt.is_complete = True
    attempt.completed_at = timezone.now()
    attempt.save()


    profile, _ = UserTradingProfile.objects.get_or_create(
        user=attempt.user,
        defaults={'cumulative_balance_pence': attempt.scenario.starting_balance_pence},
    )
    profile.cumulative_balance_pence = attempt.final_state_snapshot['final_state']['total_value_pence']
    profile.scenarios_completed += 1
    profile.save()


class ScenarioListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        scenarios = Scenario.objects.filter(is_active=True).order_by('order')
        profile, _ = UserTradingProfile.objects.get_or_create(
            user=request.user,
            defaults={'cumulative_balance_pence': 1_000_000},
        )
        return Response({
            'scenarios': [_serialize_scenario(s) for s in scenarios],
            'cumulative_balance_pence': profile.cumulative_balance_pence,
        })


class AttemptStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        scenario_id = request.data.get('scenario_id')
        if not scenario_id:
            return Response(
                {'error': 'scenario_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            scenario = Scenario.objects.get(pk=scenario_id, is_active=True)
        except Scenario.DoesNotExist:
            return Response(
                {'error': 'Scenario not found'},
                status=status.HTTP_404_NOT_FOUND,
            )


        existing = UserScenarioAttempt.objects.filter(
            user=request.user,
            scenario=scenario,
            is_complete=False,
        ).first()
        if existing:
            return Response(_serialize_attempt(existing), status=status.HTTP_200_OK)


        profile, _ = UserTradingProfile.objects.get_or_create(
            user=request.user,
            defaults={'cumulative_balance_pence': scenario.starting_balance_pence},
        )
        starting = profile.cumulative_balance_pence

        attempt = UserScenarioAttempt.objects.create(
            user=request.user,
            scenario=scenario,
            starting_balance_pence=starting,
            cash_pence=starting,
            btc_held_satoshis=0,
            current_round_index=0,
        )
        return Response(_serialize_attempt(attempt), status=status.HTTP_201_CREATED)


class AttemptDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, attempt_id):
        try:
            attempt = UserScenarioAttempt.objects.select_related(
                'scenario', 'scenario__finale'
            ).get(pk=attempt_id, user=request.user)
        except UserScenarioAttempt.DoesNotExist:
            return Response({'error': 'Attempt not found'}, status=status.HTTP_404_NOT_FOUND)

        return Response(_serialize_attempt(attempt))


class BrokerSelectView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, attempt_id):
        try:
            attempt = UserScenarioAttempt.objects.select_for_update().select_related('scenario').get(
                pk=attempt_id, user=request.user
            )
        except UserScenarioAttempt.DoesNotExist:
            return Response({'error': 'Attempt not found'}, status=status.HTTP_404_NOT_FOUND)

        if attempt.is_complete:
            return Response(
                {'error': 'Scenario is already complete'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not attempt.scenario.uses_broker_mechanics:
            return Response(
                {'error': 'Broker selection is not available in this scenario'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        broker_choice = request.data.get('broker_choice')
        if not broker_choice:
            return Response(
                {'error': 'broker_choice is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = select_broker(attempt, broker_choice)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'broker_choice': result['broker_choice'],
            'attempt': _serialize_attempt(attempt),
        })


class BuyView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, attempt_id):
        try:
            attempt = UserScenarioAttempt.objects.select_for_update().select_related('scenario').get(
                pk=attempt_id, user=request.user
            )
        except UserScenarioAttempt.DoesNotExist:
            return Response({'error': 'Attempt not found'}, status=status.HTTP_404_NOT_FOUND)

        if attempt.is_complete:
            return Response(
                {'error': 'Scenario is already complete'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount_pence = request.data.get('amount_pence')
        if amount_pence is None:
            return Response(
                {'error': 'amount_pence is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            amount_pence = int(amount_pence)
        except (TypeError, ValueError):
            return Response(
                {'error': 'amount_pence must be an integer'},
                status=status.HTTP_400_BAD_REQUEST,
            )


        use_margin = bool(request.data.get('use_margin', False))

        try:
            round_obj = attempt.scenario.rounds.get(round_index=attempt.current_round_index)
        except ScenarioRound.DoesNotExist:
            return Response(
                {'error': 'Current round not found'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            trade = execute_buy(attempt, amount_pence, round_obj, use_margin=use_margin)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'trade': trade,
            'attempt': _serialize_attempt(attempt),
        })


class SellView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, attempt_id):
        try:
            attempt = UserScenarioAttempt.objects.select_for_update().select_related('scenario').get(
                pk=attempt_id, user=request.user
            )
        except UserScenarioAttempt.DoesNotExist:
            return Response({'error': 'Attempt not found'}, status=status.HTTP_404_NOT_FOUND)

        if attempt.is_complete:
            return Response(
                {'error': 'Scenario is already complete'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        btc_quantity_satoshis = request.data.get('btc_quantity_satoshis')
        if btc_quantity_satoshis is None:
            return Response(
                {'error': 'btc_quantity_satoshis is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            btc_quantity_satoshis = int(btc_quantity_satoshis)
        except (TypeError, ValueError):
            return Response(
                {'error': 'btc_quantity_satoshis must be an integer'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source = request.data.get('source', 'auto')
        if source not in ('auto', 'ftx', 'self_custody'):
            return Response(
                {'error': "source must be 'auto', 'ftx', or 'self_custody'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            round_obj = attempt.scenario.rounds.get(round_index=attempt.current_round_index)
        except ScenarioRound.DoesNotExist:
            return Response(
                {'error': 'Current round not found'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            trade = execute_sell(attempt, btc_quantity_satoshis, round_obj, source=source)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'trade': trade,
            'attempt': _serialize_attempt(attempt),
        })


class AdvanceView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, attempt_id):
        try:
            attempt = UserScenarioAttempt.objects.select_for_update().select_related(
                'scenario', 'scenario__finale'
            ).get(pk=attempt_id, user=request.user)
        except UserScenarioAttempt.DoesNotExist:
            return Response({'error': 'Attempt not found'}, status=status.HTTP_404_NOT_FOUND)

        if attempt.is_complete:
            return Response(
                {'error': 'Scenario is already complete'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        max_round_index = attempt.scenario.rounds.count() - 1

        event_flags = {

            'ftx_yield_earned_satoshis': None,
            'ftx_withdrawals_just_halted': False,
            'ftx_just_went_bankrupt': False,
            'btc_lost_in_bankruptcy_satoshis': 0,

            'pco_just_imposed': False,
            'margin_interest_charged_pence': 0,
            'margin_call_triggered': False,
            'margin_call_details': None,
        }

        if attempt.current_round_index >= max_round_index:

            _complete_attempt(attempt)
        else:
            next_round_index = attempt.current_round_index + 1

            try:
                current_round = attempt.scenario.rounds.get(
                    round_index=attempt.current_round_index
                )
                next_round = attempt.scenario.rounds.get(
                    round_index=next_round_index
                )
            except ScenarioRound.DoesNotExist:
                return Response(
                    {'error': 'Round data missing'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            if attempt.scenario.is_multi_asset:

                attempt.current_round_index = next_round_index
                attempt.save()
                return Response({
                    'attempt': _serialize_attempt(attempt),
                    **event_flags,
                })

            elif attempt.scenario.uses_custody_split:


                yield_earned = compute_ftx_yield(attempt, current_round, next_round)
                event_flags['ftx_yield_earned_satoshis'] = yield_earned


                if next_round_index == 3 and not attempt.ftx_withdrawals_halted:
                    trigger_ftx_withdrawal_halt(attempt, next_round)
                    event_flags['ftx_withdrawals_just_halted'] = True


                if next_round_index == 4 and not attempt.ftx_bankruptcy_triggered:
                    btc_lost = trigger_ftx_bankruptcy(attempt, next_round)
                    event_flags['ftx_just_went_bankrupt'] = True
                    event_flags['btc_lost_in_bankruptcy_satoshis'] = btc_lost

            elif attempt.scenario.uses_broker_mechanics:


                interest = compute_margin_interest(attempt, current_round, next_round)
                event_flags['margin_interest_charged_pence'] = interest


                if next_round_index == 3 and not attempt.broker_pco_active:
                    trigger_pco(attempt, next_round)
                    if attempt.broker_pco_active:
                        event_flags['pco_just_imposed'] = True


                attempt.current_round_index = next_round_index
                attempt.save()

                mc_details = check_and_execute_margin_call(attempt, next_round)
                if mc_details:
                    event_flags['margin_call_triggered'] = True
                    event_flags['margin_call_details'] = mc_details

                return Response({
                    'attempt': _serialize_attempt(attempt),
                    **event_flags,
                })

            attempt.current_round_index = next_round_index
            attempt.save()

        return Response({
            'attempt': _serialize_attempt(attempt),
            **event_flags,
        })


class MoveView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, attempt_id):
        try:
            attempt = UserScenarioAttempt.objects.select_for_update().select_related('scenario').get(
                pk=attempt_id, user=request.user
            )
        except UserScenarioAttempt.DoesNotExist:
            return Response({'error': 'Attempt not found'}, status=status.HTTP_404_NOT_FOUND)

        if attempt.is_complete:
            return Response(
                {'error': 'Scenario is already complete'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not attempt.scenario.uses_custody_split:
            return Response(
                {'error': 'Custody moves are not available in this scenario'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        btc_quantity_satoshis = request.data.get('btc_quantity_satoshis')
        if btc_quantity_satoshis is None:
            return Response(
                {'error': 'btc_quantity_satoshis is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            btc_quantity_satoshis = int(btc_quantity_satoshis)
        except (TypeError, ValueError):
            return Response(
                {'error': 'btc_quantity_satoshis must be an integer'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        direction = request.data.get('direction')
        if direction not in ('to_self_custody', 'to_ftx'):
            return Response(
                {'error': "direction must be 'to_self_custody' or 'to_ftx'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            round_obj = attempt.scenario.rounds.get(round_index=attempt.current_round_index)
        except ScenarioRound.DoesNotExist:
            return Response(
                {'error': 'Current round not found'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        try:
            move = execute_move(attempt, btc_quantity_satoshis, direction, round_obj)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'move': move,
            'attempt': _serialize_attempt(attempt),
        })


class BuyMultiView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, attempt_id):
        try:
            attempt = UserScenarioAttempt.objects.select_for_update().select_related(
                'scenario', 'scenario__finale'
            ).get(pk=attempt_id, user=request.user)
        except UserScenarioAttempt.DoesNotExist:
            return Response({'error': 'Attempt not found'}, status=status.HTTP_404_NOT_FOUND)

        if attempt.is_complete:
            return Response({'error': 'Scenario is already complete'}, status=status.HTTP_400_BAD_REQUEST)

        if not attempt.scenario.is_multi_asset:
            return Response({'error': 'Use /buy/ for single-asset scenarios'}, status=status.HTTP_400_BAD_REQUEST)

        asset = request.data.get('asset')
        if not asset:
            return Response({'error': 'asset is required'}, status=status.HTTP_400_BAD_REQUEST)

        amount_pence = request.data.get('amount_pence')
        if amount_pence is None:
            return Response({'error': 'amount_pence is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount_pence = int(amount_pence)
        except (TypeError, ValueError):
            return Response({'error': 'amount_pence must be an integer'}, status=status.HTTP_400_BAD_REQUEST)

        intraday_offset = request.data.get('intraday_offset_seconds')
        if intraday_offset is not None:
            try:
                intraday_offset = int(intraday_offset)
            except (TypeError, ValueError):
                intraday_offset = None

        try:
            round_obj = attempt.scenario.rounds.get(round_index=attempt.current_round_index)
        except ScenarioRound.DoesNotExist:
            return Response({'error': 'Current round not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            result = execute_buy_multi(attempt, asset, amount_pence, round_obj, intraday_offset)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'action_executed': result,
            'attempt': _serialize_attempt(attempt),
        })


class SellMultiView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, attempt_id):
        try:
            attempt = UserScenarioAttempt.objects.select_for_update().select_related(
                'scenario', 'scenario__finale'
            ).get(pk=attempt_id, user=request.user)
        except UserScenarioAttempt.DoesNotExist:
            return Response({'error': 'Attempt not found'}, status=status.HTTP_404_NOT_FOUND)

        if attempt.is_complete:
            return Response({'error': 'Scenario is already complete'}, status=status.HTTP_400_BAD_REQUEST)

        if not attempt.scenario.is_multi_asset:
            return Response({'error': 'Use /sell/ for single-asset scenarios'}, status=status.HTTP_400_BAD_REQUEST)

        asset = request.data.get('asset')
        if not asset:
            return Response({'error': 'asset is required'}, status=status.HTTP_400_BAD_REQUEST)

        units_to_sell = request.data.get('units_to_sell')
        if units_to_sell is None:
            return Response({'error': 'units_to_sell is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            units_to_sell = int(units_to_sell)
        except (TypeError, ValueError):
            return Response({'error': 'units_to_sell must be an integer'}, status=status.HTTP_400_BAD_REQUEST)

        intraday_offset = request.data.get('intraday_offset_seconds')
        if intraday_offset is not None:
            try:
                intraday_offset = int(intraday_offset)
            except (TypeError, ValueError):
                intraday_offset = None

        try:
            round_obj = attempt.scenario.rounds.get(round_index=attempt.current_round_index)
        except ScenarioRound.DoesNotExist:
            return Response({'error': 'Current round not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            result = execute_sell_multi(attempt, asset, units_to_sell, round_obj, intraday_offset)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'action_executed': result,
            'attempt': _serialize_attempt(attempt),
        })
