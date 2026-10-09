from __future__ import annotations

import datetime

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ReplayAttempt, ReplayScenario
from .services import (
    derive_attempt_state,
    execute_buy,
    execute_sell,
    get_current_price_pence,
    get_progress_info,
    get_revealed_candles,
    get_revealed_news_events,
)


def _serialize_scenario(s: ReplayScenario) -> dict:
    return {
        "id": s.id,
        "title": s.title,
        "subtitle": s.subtitle,
        "asset_symbol": s.asset_symbol,
        "asset_name": s.asset_name,
        "historical_start_date": str(s.historical_start_date),
        "historical_end_date": str(s.historical_end_date),
        "accent_color": s.accent_color,
        "lesson_tag": s.lesson_tag,
        "difficulty": s.difficulty,
        "real_event_reference": s.real_event_reference,
        "order": s.order,
    }


def _serialize_candle(c) -> dict:

    d = {
        "date": c.date.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "o": c.open_pence,
        "h": c.high_pence,
        "l": c.low_pence,
        "c": c.close_pence,
        "v": c.volume,
    }


    if c.open_micropence or c.close_micropence:
        d["om"] = c.open_micropence
        d["cm"] = c.close_micropence
    return d


def _serialize_news_event(e) -> dict:
    return {
        "id": e.id,
        "date": str(e.date),
        "headline": e.headline,
        "body": e.body,
        "impact": e.impact,
        "btc_context": e.btc_context,
    }


def _build_attempt_payload(
    attempt: ReplayAttempt,
    since_dt: "datetime.datetime | None" = None,
    all_candles: bool = False,
) -> dict:
    current_price = get_current_price_pence(attempt)
    state = derive_attempt_state(attempt, current_price)
    progress = get_progress_info(attempt)
    simulated_dt = attempt.get_simulated_datetime()

    if all_candles:

        candles = attempt.scenario.candles.all().order_by("date")
        news_events = attempt.scenario.news_events.all().order_by("date")
    elif since_dt is not None:

        candles = (
            attempt.scenario.candles
            .filter(date__gt=since_dt, date__lte=simulated_dt)
            .order_by("date")
        )
        news_events = (
            attempt.scenario.news_events
            .filter(date__gt=since_dt.date(), date__lte=simulated_dt.date())
            .order_by("date")
        )
    else:

        candles = get_revealed_candles(attempt)
        news_events = get_revealed_news_events(attempt)


    scenario_seconds = (
        datetime.datetime.combine(
            attempt.scenario.historical_end_date,
            datetime.time(23, 59, 59),
            tzinfo=datetime.timezone.utc,
        )
        - datetime.datetime.combine(
            attempt.scenario.historical_start_date,
            datetime.time.min,
            tzinfo=datetime.timezone.utc,
        )
    ).total_seconds()

    simulated_days_per_real_second = (scenario_seconds / 86_400.0) / 86_400.0
    flash_simulated_window_days = 60 * simulated_days_per_real_second
    flash_cutoff_date = simulated_dt.date() - datetime.timedelta(
        days=flash_simulated_window_days
    )
    latest_flash_event = (
        attempt.scenario.news_events
        .filter(date__gt=flash_cutoff_date, date__lte=simulated_dt.date())
        .order_by("-date")
        .first()
    )

    return {
        "attempt_id": attempt.id,
        "scenario": _serialize_scenario(attempt.scenario),
        "attempt_date": str(attempt.attempt_date),
        "started_at": attempt.started_at.isoformat(),
        "is_complete": attempt.is_complete,
        "action_log": attempt.action_log,
        "state": state,
        "candles": [_serialize_candle(c) for c in candles],
        "news_events": [_serialize_news_event(e) for e in news_events],
        "current_price_pence": current_price,
        "simulated_datetime": progress["simulated_datetime"],
        "progress_fraction": progress["progress_fraction"],
        "seconds_remaining": progress["seconds_remaining"],
        "is_complete_for_today": progress["is_complete_for_today"],
        "latest_news_flash": _serialize_news_event(latest_flash_event) if latest_flash_event else None,
    }


class ScenarioListView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request):
        scenarios = ReplayScenario.objects.filter(is_active=True)
        return Response([_serialize_scenario(s) for s in scenarios])


class ScenarioDetailView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int):
        try:
            scenario = ReplayScenario.objects.get(pk=pk, is_active=True)
        except ReplayScenario.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_scenario(scenario))


class StartAttemptView(APIView):

    permission_classes = [IsAuthenticated]

    def post(self, request):
        scenario_id = request.data.get("scenario_id")
        if not scenario_id:
            return Response(
                {"detail": "scenario_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            scenario = ReplayScenario.objects.get(pk=scenario_id, is_active=True)
        except ReplayScenario.DoesNotExist:
            return Response({"detail": "Scenario not found."}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.now().date()

        attempt, created = ReplayAttempt.objects.get_or_create(
            user=request.user,
            scenario=scenario,
            attempt_date=today,
            defaults={
                "starting_balance_pence": 1_000_000,
                "cash_pence": 1_000_000,
                "btc_held_satoshis": 0,
                "action_log": [],
            },
        )

        payload = _build_attempt_payload(attempt)
        return Response(payload, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class AttemptStateView(APIView):

    permission_classes = [IsAuthenticated]

    def get(self, request, attempt_id: int):
        try:
            attempt = ReplayAttempt.objects.select_related("scenario").get(
                pk=attempt_id, user=request.user
            )
        except ReplayAttempt.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        since_dt = None
        since_str = request.query_params.get("since")
        if since_str:
            try:

                since_dt = datetime.datetime.fromisoformat(
                    since_str.replace("Z", "+00:00")
                )
            except ValueError:
                return Response(
                    {"detail": "Invalid since format. Use ISO 8601 datetime."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        all_candles = request.query_params.get("all_candles") == "true"
        return Response(_build_attempt_payload(attempt, since_dt=since_dt, all_candles=all_candles))


class BuyView(APIView):

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, attempt_id: int):
        try:
            attempt = ReplayAttempt.objects.select_for_update().select_related("scenario").get(
                pk=attempt_id, user=request.user
            )
        except ReplayAttempt.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        progress = get_progress_info(attempt)
        if progress["is_complete_for_today"]:
            return Response(
                {"detail": "This scenario session has ended for today. Return tomorrow for a fresh start."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount_pence = request.data.get("amount_pence")
        if amount_pence is None:
            return Response(
                {"detail": "amount_pence is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            amount_pence = int(amount_pence)
        except (TypeError, ValueError):
            return Response(
                {"detail": "amount_pence must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        current_price = get_current_price_pence(attempt)

        try:
            state = execute_buy(attempt, amount_pence, current_price)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"state": state, "current_price_pence": current_price})


class SellView(APIView):

    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request, attempt_id: int):
        try:
            attempt = ReplayAttempt.objects.select_for_update().select_related("scenario").get(
                pk=attempt_id, user=request.user
            )
        except ReplayAttempt.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        progress = get_progress_info(attempt)
        if progress["is_complete_for_today"]:
            return Response(
                {"detail": "This scenario session has ended for today. Return tomorrow for a fresh start."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qty = request.data.get("btc_quantity_satoshis")
        if qty is None:
            return Response(
                {"detail": "btc_quantity_satoshis is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            qty = int(qty)
        except (TypeError, ValueError):
            return Response(
                {"detail": "btc_quantity_satoshis must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        current_price = get_current_price_pence(attempt)

        try:
            state = execute_sell(attempt, qty, current_price)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"state": state, "current_price_pence": current_price})
