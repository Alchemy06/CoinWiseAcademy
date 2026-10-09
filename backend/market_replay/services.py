from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import ReplayAttempt


def derive_attempt_state(attempt: "ReplayAttempt", current_price_pence: int) -> dict:
    cash = attempt.cash_pence
    btc = attempt.btc_held_satoshis
    starting = attempt.starting_balance_pence

    position_value = (btc * current_price_pence) // 100_000_000
    total_value = cash + position_value
    delta = total_value - starting
    delta_pct = (delta * 10_000) // starting if starting else 0

    action_log = attempt.action_log or []
    buys = [a for a in action_log if a.get("action") == "buy"]
    sells = [a for a in action_log if a.get("action") == "sell"]

    total_bought_pence = sum(a.get("amount_pence", 0) for a in buys)
    total_bought_sats = sum(a.get("btc_quantity_satoshis", 0) for a in buys)
    total_sold_sats = sum(a.get("btc_quantity_satoshis", 0) for a in sells)

    if total_bought_sats > 0:
        avg_entry_price = (total_bought_pence * 100_000_000) // total_bought_sats
    else:
        avg_entry_price = 0

    remaining_sats = total_bought_sats - total_sold_sats
    cost_basis = (remaining_sats * avg_entry_price) // 100_000_000 if avg_entry_price else 0
    unrealised_pnl = position_value - cost_basis
    unrealised_pnl_pct = (unrealised_pnl * 10_000) // cost_basis if cost_basis > 0 else 0

    return {
        "starting_balance_pence": starting,
        "cash_pence": cash,
        "btc_held_satoshis": btc,
        "current_price_pence": current_price_pence,
        "position_value_pence": position_value,
        "total_value_pence": total_value,
        "total_delta_pence": delta,
        "total_delta_basis_pts": delta_pct,
        "avg_entry_price_pence": avg_entry_price,
        "cost_basis_pence": cost_basis,
        "unrealised_pnl_pence": unrealised_pnl,
        "unrealised_pnl_basis_pts": unrealised_pnl_pct,
        "total_bought_pence": total_bought_pence,
        "total_bought_sats": total_bought_sats,
        "total_sold_sats": total_sold_sats,
        "remaining_sats": remaining_sats,
    }


def get_current_price_pence(attempt: "ReplayAttempt") -> int:
    simulated_dt = attempt.get_simulated_datetime()
    candle = (
        attempt.scenario.candles.filter(date__lte=simulated_dt)
        .order_by("-date")
        .first()
    )
    if candle:
        return candle.close_pence

    first = attempt.scenario.candles.order_by("date").first()
    return first.open_pence if first else 0


def get_revealed_candles(attempt: "ReplayAttempt"):
    simulated_dt = attempt.get_simulated_datetime()
    return attempt.scenario.candles.filter(date__lte=simulated_dt).order_by("date")


def get_revealed_news_events(attempt: "ReplayAttempt"):
    simulated_date = attempt.get_simulated_date()
    return attempt.scenario.news_events.filter(date__lte=simulated_date).order_by("date")


def get_progress_info(attempt: "ReplayAttempt") -> dict:
    from django.utils import timezone

    now = timezone.now()


    completed_hours = now.hour
    elapsed_seconds = completed_hours * 3600.0
    elapsed_fraction = elapsed_seconds / 86_400.0

    seconds_remaining = max(0.0, (completed_hours + 1) * 3600.0 - (now - now.replace(hour=0, minute=0, second=0, microsecond=0)).total_seconds())
    simulated_dt = attempt.get_simulated_datetime()

    return {
        "progress_fraction": round(elapsed_fraction, 6),
        "seconds_remaining": int(seconds_remaining),
        "simulated_datetime": simulated_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "is_complete_for_today": elapsed_fraction >= 1.0 or attempt.is_complete,
    }


def execute_buy(attempt: "ReplayAttempt", amount_pence: int, current_price_pence: int) -> dict:
    if amount_pence <= 0:
        raise ValueError("Amount must be greater than zero.")
    if amount_pence > attempt.cash_pence:
        raise ValueError("Insufficient cash.")
    if current_price_pence <= 0:
        raise ValueError("No price data available yet.")

    btc_qty = (amount_pence * 100_000_000) // current_price_pence
    if btc_qty <= 0:
        raise ValueError("Amount too small to purchase any BTC at the current price.")

    simulated_dt = attempt.get_simulated_datetime().strftime("%Y-%m-%dT%H:%M:%SZ")

    attempt.cash_pence -= amount_pence
    attempt.btc_held_satoshis += btc_qty

    log_entry = {
        "action": "buy",
        "amount_pence": amount_pence,
        "btc_quantity_satoshis": btc_qty,
        "price_pence": current_price_pence,
        "simulated_date": simulated_dt,
    }
    attempt.action_log = (attempt.action_log or []) + [log_entry]
    attempt.save(update_fields=["cash_pence", "btc_held_satoshis", "action_log"])

    return derive_attempt_state(attempt, current_price_pence)


def execute_sell(attempt: "ReplayAttempt", btc_quantity_satoshis: int, current_price_pence: int) -> dict:
    if btc_quantity_satoshis <= 0:
        raise ValueError("Quantity must be greater than zero.")
    if btc_quantity_satoshis > attempt.btc_held_satoshis:
        raise ValueError("Insufficient BTC holdings.")
    if current_price_pence <= 0:
        raise ValueError("No price data available yet.")

    proceeds = (btc_quantity_satoshis * current_price_pence) // 100_000_000
    simulated_dt = attempt.get_simulated_datetime().strftime("%Y-%m-%dT%H:%M:%SZ")

    attempt.btc_held_satoshis -= btc_quantity_satoshis
    attempt.cash_pence += proceeds

    log_entry = {
        "action": "sell",
        "btc_quantity_satoshis": btc_quantity_satoshis,
        "amount_pence": proceeds,
        "price_pence": current_price_pence,
        "simulated_date": simulated_dt,
    }
    attempt.action_log = (attempt.action_log or []) + [log_entry]
    attempt.save(update_fields=["cash_pence", "btc_held_satoshis", "action_log"])

    return derive_attempt_state(attempt, current_price_pence)
