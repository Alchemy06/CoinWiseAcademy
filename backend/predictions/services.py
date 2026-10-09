"""Prediction service layer.

Responsibilities:
- Fetch current live price for BTC / ETH via the existing market service (with cache).
- Resolve due predictions against the current live price.
- Generate template-based reflection text.
- Compute calibration labels from resolved prediction sets.
"""
from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from django.utils import timezone

from market.services import MarketDataUnavailable, get_crypto_dashboard, get_simple_price

if TYPE_CHECKING:
    from .models import Prediction

# Map prediction asset symbols to CoinGecko ids used by the market service.
ASSET_COIN_IDS: dict[str, str] = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
}


class LivePriceUnavailable(Exception):
    """Raised when the live price cannot be obtained for a prediction asset."""


def get_live_price(asset: str) -> Decimal:
    """Fetch the current USD price for ``asset``.

    Uses get_simple_price() (CoinGecko /simple/price, 10-second cache) instead
    of the full dashboard (45-second cache) so that the Volatility Challenge
    live chart candle updates visibly at ~10-second intervals rather than every
    45 seconds.

    Raises ``LivePriceUnavailable`` if the price cannot be retrieved, which
    callers should convert into a user-friendly HTTP 503.
    """
    coin_id = ASSET_COIN_IDS.get(asset.upper())
    if coin_id is None:
        raise LivePriceUnavailable(f"Unsupported asset: {asset}")

    try:
        price = get_simple_price(coin_id, currency="usd")
    except MarketDataUnavailable as exc:
        raise LivePriceUnavailable("Live market price is temporarily unavailable.") from exc

    return Decimal(str(price))


# ── Reflection text ────────────────────────────────────────────────────────────

def _movement_description(pct: Decimal) -> str:
    """Human-readable description of a price movement magnitude."""
    abs_pct = abs(pct)
    if abs_pct < Decimal("0.05"):
        return "almost no movement"
    return f"{'+' if pct >= 0 else ''}{pct:.2f}%"


def generate_reflection(
    *,
    asset: str,
    direction: str,
    actual_direction: str,
    price_change_percent: Decimal,
    timeframe_label: str,
    confidence: int | None,
    result: str,
) -> str:
    """Return an educational reflection message for a resolved prediction."""

    move_desc = _movement_description(price_change_percent)
    direction_up = direction == "up"
    was_correct = result == "correct"

    # Flat / near-flat movement is its own case regardless of correctness.
    if actual_direction == "flat":
        return (
            f"You predicted {asset} would go {'up' if direction_up else 'down'}, but the price "
            f"changed very little over the {timeframe_label} window ({move_desc}). "
            f"Crypto markets don\u2019t always move clearly in one direction \u2014 "
            f"which is one reason prediction is so difficult, even over short timeframes."
        )

    conf = confidence or 3  # treat absent confidence as neutral

    if was_correct and conf >= 4:
        return (
            f"You predicted {asset} would go {'up' if direction_up else 'down'} over {timeframe_label}, "
            f"and it did ({move_desc}). You felt confident \u2014 and this time it paid off. "
            f"But short-term crypto moves are still difficult to predict consistently. "
            f"A correct result, even a confident one, does not guarantee the next call will also be right."
        )

    if was_correct and conf <= 2:
        return (
            f"You predicted {asset} would go {'up' if direction_up else 'down'}, and it did ({move_desc}). "
            f"You were right, and you also acknowledged your uncertainty \u2014 that\u2019s a healthy combination. "
            f"In volatile markets, one correct call can still involve luck. "
            f"Cautious thinking is often more useful than overconfidence."
        )

    if was_correct:
        return (
            f"You predicted {asset} would go {'up' if direction_up else 'down'} over {timeframe_label}, "
            f"and it did ({move_desc}). Being correct is satisfying, but crypto markets can reverse quickly. "
            f"The same move in the opposite direction could have happened just as easily."
        )

    if not was_correct and conf >= 4:
        return (
            f"You predicted {asset} would go {'up' if direction_up else 'down'}, "
            f"but it went {'down' if direction_up else 'up'} ({move_desc}). "
            f"You felt confident \u2014 but this is a common pattern in volatile markets. "
            f"High confidence does not always mean higher accuracy. "
            f"Crypto prices react quickly to news, sentiment, and broader market conditions "
            f"that are difficult to anticipate in advance."
        )

    if not was_correct and conf <= 2:
        return (
            f"You predicted {asset} would go {'up' if direction_up else 'down'}, "
            f"but it went {'down' if direction_up else 'up'} ({move_desc}). "
            f"You were wrong, but you also recognised your uncertainty. "
            f"That self-awareness is useful \u2014 cautious thinking is healthier than overconfidence "
            f"in markets this unpredictable."
        )

    # Incorrect + neutral confidence
    return (
        f"You predicted {asset} would go {'up' if direction_up else 'down'} over {timeframe_label}, "
        f"but it went {'down' if direction_up else 'up'} ({move_desc}). "
        f"Crypto markets are highly volatile and hard to call in the short term. "
        f"Even experienced traders get these wrong regularly."
    )


# ── Resolution ─────────────────────────────────────────────────────────────────

_FLAT_THRESHOLD = Decimal("0.01")  # < 0.01% movement treated as flat


def resolve_prediction(prediction: "Prediction", exit_price: Decimal) -> None:
    """Apply resolution data to a prediction instance and save it.

    This mutates the prediction in-place and calls ``save()``.
    Callers should already have verified that a live price is available.
    """
    prediction.exit_price = exit_price
    prediction.resolved_at = timezone.now()
    prediction.status = "resolved"

    entry = prediction.entry_price
    pct = ((exit_price - entry) / entry) * Decimal("100") if entry != 0 else Decimal("0")
    prediction.price_change_percent = pct

    if abs(pct) < _FLAT_THRESHOLD:
        actual = "flat"
    elif pct > 0:
        actual = "up"
    else:
        actual = "down"

    prediction.actual_direction = actual

    if actual == "flat":
        prediction.result = "incorrect"
    elif actual == prediction.direction:
        prediction.result = "correct"
    else:
        prediction.result = "incorrect"

    prediction.reflection_text = generate_reflection(
        asset=prediction.asset,
        direction=prediction.direction,
        actual_direction=actual,
        price_change_percent=pct,
        timeframe_label=prediction.timeframe_label,
        confidence=prediction.confidence,
        result=prediction.result,
    )

    prediction.save()


# ── Stats / calibration ────────────────────────────────────────────────────────

def compute_stats(predictions: "list[Prediction]") -> dict:
    """Compute summary stats over a collection of Prediction objects."""
    total = len(predictions)
    resolved = [p for p in predictions if p.status == "resolved"]
    correct = [p for p in resolved if p.result == "correct"]

    resolved_count = len(resolved)
    correct_count = len(correct)
    accuracy = round((correct_count / resolved_count) * 100, 1) if resolved_count else 0.0

    confidences = [p.confidence for p in resolved if p.confidence is not None]
    avg_confidence = round(sum(confidences) / len(confidences), 2) if confidences else None

    calibration_label = _calibration_label(
        avg_confidence=avg_confidence,
        accuracy=accuracy,
        resolved_count=resolved_count,
    )

    score = compute_calibration_score(predictions)

    return {
        "total": total,
        "resolved": resolved_count,
        "correct": correct_count,
        "accuracy": accuracy,
        "average_confidence": avg_confidence,
        "calibration_label": calibration_label,
        "calibration_score": score,
        "calibration_score_label": calibration_score_to_label(score),
    }


def _calibration_label(
    avg_confidence: float | None, accuracy: float, resolved_count: int
) -> str:
    if resolved_count < 3:
        return "insufficient_data"
    if avg_confidence is None:
        return "insufficient_data"
    if avg_confidence >= 4 and accuracy < 50:
        return "overconfident"
    if avg_confidence <= 2:
        return "cautious"
    if 40 <= accuracy <= 70:
        return "developing"
    return "well_calibrated"


def compute_calibration_score(predictions: "list[Prediction]") -> int:
    """
    Numeric calibration score 0-100.
    Starts at 50. Each resolved prediction with confidence adjusts it:
    - Correct + confident (4-5):   +15
    - Correct + uncertain (1-2):   +5
    - Wrong + cautious (1-2):      -2
    - Wrong + confident (4-5):     -20
    Score is clamped to 0-100.
    """
    resolved = sorted(
        [p for p in predictions if p.status == "resolved" and p.confidence is not None],
        key=lambda p: p.resolved_at or timezone.now(),
    )

    if not resolved:
        return 50

    score = 50
    for p in resolved:
        correct = p.result == "correct"
        conf = p.confidence

        if correct and conf >= 4:
            score += 15
        elif correct and conf <= 2:
            score += 5
        elif not correct and conf <= 2:
            score -= 2
        elif not correct and conf >= 4:
            score -= 20

    return max(0, min(100, score))


def calibration_score_to_label(score: int) -> str:
    if score <= 30:
        return "Overconfident"
    elif score <= 50:
        return "Learning"
    elif score <= 70:
        return "Calibrating"
    elif score <= 85:
        return "Well Calibrated"
    else:
        return "Highly Calibrated"
