
import random
from datetime import date, timedelta


BLACK_THURSDAY = {
    "date": "2020-03-12",
    "o": 700_000,
    "h": 710_000,
    "l": 392_000,
    "c": 392_000,
}


def generate_candles(
    start_date: date,
    end_date: date,
    start_price: int,
    end_price: int,
    *,
    black_thursday: bool = False,
    rng_seed: int = 42,
) -> list[dict]:
    days = (end_date - start_date).days
    if days <= 0:
        return []

    candles: list[dict] = []
    current_date = start_date
    current_close = start_price
    rng = random.Random(rng_seed)

    for day_index in range(days):
        date_str = current_date.isoformat()


        if black_thursday and date_str == "2020-03-12":
            candles.append(BLACK_THURSDAY.copy())
            current_close = BLACK_THURSDAY["c"]
            current_date += timedelta(days=1)
            continue


        progress = (day_index + 1) / days
        target_close = int(start_price + (end_price - start_price) * progress)

        noise = rng.gauss(0, 0.015)
        if day_index < days - 1:
            close = int(target_close * (1 + noise))

            close = max(close, max(1, int(min(start_price, end_price) * 0.5)))
        else:
            close = end_price


        open_price = current_close
        daily_range = abs(int(open_price * rng.uniform(0, 0.01)))
        high = max(open_price, close) + daily_range
        low = min(open_price, close) - daily_range
        low = max(low, 1)

        candles.append({
            "date": date_str,
            "o": open_price,
            "h": high,
            "l": low,
            "c": close,
        })

        current_close = close
        current_date += timedelta(days=1)

    return candles
