from __future__ import annotations

import json
import time
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


# Keep backend/frontend coin coverage in sync so the dashboard can always render a fixed comparison layout.
# Cache aggressively for short intervals because CoinGecko data is live enough for this page without per-view hits.
SUPPORTED_COINS = ("bitcoin", "ethereum", "solana", "ripple")
SUPPORTED_FIAT_CURRENCIES = ("gbp", "usd")
COIN_GECKO_BASE_URL = "https://api.coingecko.com/api/v3"
CHART_POINT_COUNT = 10
CHART_WINDOW_HOURS = 24
REQUEST_TIMEOUT_SECONDS = 8
UPSTREAM_RETRY_ATTEMPTS = 2
REFRESH_CACHE_TTL_SECONDS = 45
STALE_CACHE_MAX_AGE_SECONDS = 900
# Brief provider cooldown prevents repeated manual refreshes from immediately re-triggering the same upstream outage/limit path.
UPSTREAM_FAILURE_BACKOFF_SECONDS = 120
STALE_WARNING_MESSAGE = "Live data is temporarily stale. Showing the last successful refresh."

COIN_METADATA = {
    "bitcoin": {
        "symbol": "BTC",
        "name": "Bitcoin",
        "tone": "bitcoin",
        "officialWebsite": "https://bitcoin.org",
    },
    "ethereum": {
        "symbol": "ETH",
        "name": "Ethereum",
        "tone": "ethereum",
        "officialWebsite": "https://ethereum.org",
    },
    "solana": {
        "symbol": "SOL",
        "name": "Solana",
        "tone": "solana",
        "officialWebsite": "https://solana.com",
    },
    "ripple": {
        "symbol": "XRP",
        "name": "XRP",
        "tone": "ripple",
        "officialWebsite": "https://xrpl.org",
    },
}

_market_cache_lock = Lock()
_market_cache: dict[str, tuple[float, dict[str, Any]]] = {}
# Track per-currency cooldown windows separately so one throttled quote currency does not suppress the other.
_market_backoff_until: dict[str, float] = {}

# Full 7-day hourly sparkline cache — kept separately from the dashboard chartSeries
# (which clips to CHART_WINDOW_HOURS=24) so the Volatility Challenge can access the
# complete history without affecting the market-dashboard behaviour.
_raw_sparkline_lock = Lock()
_raw_sparkline_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}  # key: "coin_id:currency"

# High-resolution 24-hour market chart cache (5-minute interval, real UNIX timestamps).
# Used by the Volatility Challenge for the 1H and 4H chart ranges where the hourly
# sparkline has too few points to render a useful chart.
_market_chart_lock = Lock()
_market_chart_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}  # key: "coin_id:currency"
_MARKET_CHART_TTL_SECONDS = 300  # 5-minute cache — market_chart updates ~every 5 min on CoinGecko free tier

# OHLC cache — real open/high/low/close from CoinGecko /ohlc endpoint.
# Gives visible candlestick wicks unlike the sparkline (close-only) data.
_ohlc_cache: dict[str, tuple[float, list]] = {}
_ohlc_lock = Lock()
_OHLC_TTL_SECONDS = 300  # 5-minute cache (CoinGecko updates OHLC every ~30 min)

# Lightweight live-price cache — primary source is Binance public ticker (real-time,
# updates ~every second, no API key required).  CoinGecko /simple/price is the fallback.
# Short TTL so the Volatility Challenge chart live-candle updates visibly.
_simple_price_cache: dict[str, tuple[float, float]] = {}  # key → (monotonic_ts, usd_price)
_simple_price_lock = Lock()
_SIMPLE_PRICE_TTL_SECONDS = 2  # refresh every 2 s — Binance is real-time so this is safe

# Binance klines cache — real OHLC candles for each symbol+interval combo
_klines_cache: dict[str, tuple[float, list]] = {}
_klines_lock = Lock()
_KLINES_TTL_SECONDS = 60  # 1-minute cache — klines update every minute

# Binance public REST API — free, no auth, prices updated ~every 100 ms.
_BINANCE_BASE = "https://api.binance.com/api/v3"
_COIN_BINANCE_SYMBOLS: dict[str, str] = {
    "bitcoin":  "BTCUSDT",
    "ethereum": "ETHUSDT",
}


class MarketDataUnavailable(Exception):
    """Raised when the upstream market provider cannot satisfy the request."""


def clear_market_cache() -> None:
    # Tests clear the in-memory cache between scenarios so stale state cannot leak across assertions.
    with _market_cache_lock:
        _market_cache.clear()
        # Reset failure backoff too, otherwise one test outage could mask later refresh attempts in unrelated scenarios.
        _market_backoff_until.clear()
    with _raw_sparkline_lock:
        _raw_sparkline_cache.clear()
    with _market_chart_lock:
        _market_chart_cache.clear()
    with _ohlc_lock:
        _ohlc_cache.clear()
    with _simple_price_lock:
        _simple_price_cache.clear()
    with _klines_lock:
        _klines_cache.clear()


def _normalize_number(value: Any) -> float | None:
    # Reject booleans explicitly because bool is a subclass of int and would otherwise look like a numeric price.
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _normalize_iso_timestamp(value: Any) -> str | None:
    # Preserve upstream ISO strings as-is so frontend formatting decisions stay client-side.
    return value if isinstance(value, str) and value else None


def _parse_iso_timestamp(value: str | None) -> datetime | None:
    # Parsing is best-effort only; invalid timestamps should degrade to "now" rather than failing the whole payload.
    if not value:
        return None

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _request_json(path: str, params: dict[str, str]) -> Any:
    # CoinGecko does not require auth here, but a stable user agent helps upstream debugging and rate-limit tracing.
    url = f"{COIN_GECKO_BASE_URL}{path}?{urlencode(params)}"
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "team-la-mesa-market-proxy/1.0",
        },
        method="GET",
    )

    last_error: Exception | None = None

    for attempt in range(UPSTREAM_RETRY_ATTEMPTS):
        try:
            with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                status_code = getattr(response, "status", 200)
                if status_code != 200:
                    raise MarketDataUnavailable(f"CoinGecko returned status {status_code}.")
                return json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError, OSError) as exc:
            last_error = exc
            if attempt == UPSTREAM_RETRY_ATTEMPTS - 1:
                break
            # Small linear backoff is enough here because refreshes are periodic and the page already tolerates stale data.
            time.sleep(0.35 * (attempt + 1))

    raise MarketDataUnavailable("CoinGecko market data is currently unavailable.") from last_error


def _to_asset(entry: dict[str, Any] | None, coin_id: str) -> dict[str, Any]:
    # Always return a full asset shell so the frontend table remains structurally stable even with partial upstream data.
    descriptor = COIN_METADATA[coin_id]

    return {
        "coinId": coin_id,
        "symbol": descriptor["symbol"],
        "name": descriptor["name"],
        "tone": descriptor["tone"],
        "officialWebsite": descriptor["officialWebsite"],
        "currentPrice": _normalize_number((entry or {}).get("current_price")),
        "change24h": _normalize_number((entry or {}).get("price_change_percentage_24h")),
        "change7d": _normalize_number((entry or {}).get("price_change_percentage_7d_in_currency")),
        "marketCap": _normalize_number((entry or {}).get("market_cap")),
        "totalVolume": _normalize_number((entry or {}).get("total_volume")),
        "high24h": _normalize_number((entry or {}).get("high_24h")),
        "low24h": _normalize_number((entry or {}).get("low_24h")),
        "lastUpdatedAt": _normalize_iso_timestamp((entry or {}).get("last_updated")),
    }


def _compress_points(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    # Downsample evenly so the chart stays legible while still preserving the overall intraday shape.
    if len(points) <= CHART_POINT_COUNT:
        return points

    return [
        points[min(len(points) - 1, round((index / (CHART_POINT_COUNT - 1)) * (len(points) - 1)))]
        for index in range(CHART_POINT_COUNT)
    ]


def _to_chart_series(coin_id: str, prices: list[float], last_updated_at: str | None, point_count: int = CHART_POINT_COUNT) -> dict[str, Any]:
    descriptor = COIN_METADATA[coin_id]
    # Filter aggressively so malformed sparkline entries never poison the chart payload.
    normalized_prices = [float(price) for price in prices if isinstance(price, (int, float))]

    if not normalized_prices:
        return {
            "coinId": coin_id,
            "symbol": descriptor["symbol"],
            "name": descriptor["name"],
            "tone": descriptor["tone"],
            "points": [],
        }

    window_point_count = min(
        len(normalized_prices),
        max(2, round(len(normalized_prices) * (CHART_WINDOW_HOURS / (7 * 24)))),
    )
    # CoinGecko sparkline covers seven days, but the UI compares only the most recent 24-hour window.
    recent_prices = normalized_prices[-window_point_count:]
    end_at = _parse_iso_timestamp(last_updated_at) or datetime.now(timezone.utc)
    # Reconstruct evenly spaced timestamps from the sparkline because CoinGecko omits explicit per-point datetimes here.
    interval_seconds = max(3600, round((7 * 24 * 3600) / max(len(normalized_prices) - 1, 1)))
    start_at = end_at - timedelta(seconds=interval_seconds * (len(recent_prices) - 1))

    points = [
        {
            "timestamp": (start_at + timedelta(seconds=interval_seconds * index))
            .astimezone(timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "price": price,
            "relativeChange": 0.0,
        }
        for index, price in enumerate(recent_prices)
    ]

    baseline = points[0]["price"] if points else None
    normalized_points = (
        [
            {
                **point,
                # Relative move is what the chart plots, so every series starts at the same visual baseline.
                "relativeChange": ((point["price"] - baseline) / baseline) * 100,
            }
            for point in points
        ]
        if baseline
        else points
    )

    # Use a custom point count for downsampling if provided
    final_points = normalized_points
    if len(normalized_points) > point_count:
        final_points = [
            normalized_points[min(len(normalized_points) - 1, round((index / (point_count - 1)) * (len(normalized_points) - 1)))]
            for index in range(point_count)
        ]

    return {
        "coinId": coin_id,
        "symbol": descriptor["symbol"],
        "name": descriptor["name"],
        "tone": descriptor["tone"],
        "points": final_points,
    }


def _extract_sparkline_prices(entry: dict[str, Any] | None) -> list[float]:
    # Sparkline payloads are nested one level down in CoinGecko's /coins/markets response.
    sparkline = (entry or {}).get("sparkline_in_7d")
    raw_prices = sparkline.get("price") if isinstance(sparkline, dict) else None

    if not isinstance(raw_prices, list):
        return []

    return [float(price) for price in raw_prices if isinstance(price, (int, float))]


def _make_timestamped_history(
    prices: list[float],
    last_updated_at: str | None,
) -> list[dict[str, Any]]:
    """Convert raw sparkline price list to {timestamp, price} history points.

    CoinGecko's sparkline covers 7 days at roughly hourly intervals.  We
    reconstruct timestamps from ``last_updated_at`` so the Volatility Challenge
    chart can accurately place each point in real time.
    """
    if not prices:
        return []
    end_at = _parse_iso_timestamp(last_updated_at) or datetime.now(timezone.utc)
    # Derive interval from data density; fall back to exactly one hour.
    interval_seconds = max(3_600, round((7 * 24 * 3_600) / max(len(prices) - 1, 1)))
    start_at = end_at - timedelta(seconds=interval_seconds * (len(prices) - 1))
    return [
        {
            "timestamp": (start_at + timedelta(seconds=interval_seconds * i))
            .astimezone(timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "price": price,
        }
        for i, price in enumerate(prices)
    ]


def _fetch_market_snapshot(currency: str, point_count: int = CHART_POINT_COUNT) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    # One /coins/markets request gives both table metrics and sparkline data, so avoid separate per-coin fetches.
    entries = _request_json(
        "/coins/markets",
        {
            "vs_currency": currency,
            "ids": ",".join(SUPPORTED_COINS),
            "order": "market_cap_desc",
            "per_page": str(len(SUPPORTED_COINS)),
            "page": "1",
            "sparkline": "true",
            "price_change_percentage": "7d",
        },
    )

    # Index by id so the outgoing asset order can stay product-defined rather than upstream-response-defined.
    entries_by_id = {
        entry["id"]: entry
        for entry in entries
        if isinstance(entry, dict) and isinstance(entry.get("id"), str)
    } if isinstance(entries, list) else {}

    assets = [_to_asset(entries_by_id.get(coin_id), coin_id) for coin_id in SUPPORTED_COINS]
    chart_series = [
        _to_chart_series(
            coin_id,
            _extract_sparkline_prices(entries_by_id.get(coin_id)),
            assets[index]["lastUpdatedAt"],
            point_count=point_count,
        )
        for index, coin_id in enumerate(SUPPORTED_COINS)
    ]

    # Also cache the full raw sparkline so the Volatility Challenge can access
    # complete 7-day hourly history independently of the dashboard's 24-h window.
    for i, coin_id in enumerate(SUPPORTED_COINS):
        raw_prices = _extract_sparkline_prices(entries_by_id.get(coin_id))
        if raw_prices:
            pts = _make_timestamped_history(raw_prices, assets[i]["lastUpdatedAt"])
            cache_key = f"{coin_id}:{currency}"
            with _raw_sparkline_lock:
                _raw_sparkline_cache[cache_key] = (time.monotonic(), pts)

    return assets, chart_series


def _build_dashboard_payload(currency: str, point_count: int = CHART_POINT_COUNT) -> dict[str, Any]:
    # lastSuccessfulSyncAt is derived from the newest asset timestamp because the payload itself has no global sync field.
    assets, chart_series = _fetch_market_snapshot(currency, point_count=point_count)
    last_successful_sync_at = (
        sorted(
            timestamp
            for timestamp in (asset["lastUpdatedAt"] for asset in assets)
            if isinstance(timestamp, str) and timestamp
        )[-1]
        if any(asset["lastUpdatedAt"] for asset in assets)
        else None
    )

    return {
        "assets": assets,
        "chartSeries": chart_series,
        "lastSuccessfulSyncAt": last_successful_sync_at,
        "isStale": False,
        "staleReason": None,
    }


def _get_cached_payload(currency: str) -> tuple[float, dict[str, Any]] | None:
    with _market_cache_lock:
        cached = _market_cache.get(currency)
        if cached is None:
            return None
        cached_at, payload = cached
        # Return a deep copy so request-specific stale flags never mutate the shared cache entry in place.
        return cached_at, deepcopy(payload)


def _store_cached_payload(currency: str, payload: dict[str, Any]) -> None:
    with _market_cache_lock:
        # Store a copy for the same reason: later callers may mutate warning flags on the payload they receive back.
        _market_cache[currency] = (time.monotonic(), deepcopy(payload))
        # A successful live payload means the provider is healthy again, so clear any earlier cooldown immediately.
        _market_backoff_until.pop(currency, None)


def _get_backoff_until(currency: str) -> float:
    # Default to zero so callers can compare against monotonic time without extra sentinel handling.
    with _market_cache_lock:
        return _market_backoff_until.get(currency, 0.0)


def _store_backoff_until(currency: str, until: float) -> None:
    # Keep the cooldown bookkeeping behind the same lock as cache writes so refresh races stay deterministic.
    with _market_cache_lock:
        _market_backoff_until[currency] = until


def get_crypto_dashboard(currency: str, *, force_refresh: bool = False, point_count: int = CHART_POINT_COUNT) -> dict[str, Any]:
    # Service-level force refresh exists only for explicit user intent; background page polling should still benefit from cache reuse.
    normalized_currency = currency.lower()
    if normalized_currency not in SUPPORTED_FIAT_CURRENCIES:
        raise ValueError("Unsupported currency.")

    cached = _get_cached_payload(normalized_currency)
    now = time.monotonic()
    if not force_refresh and cached is not None and now - cached[0] < REFRESH_CACHE_TTL_SECONDS:
        payload = cached[1]
        # Fresh cache reads should never surface stale warnings carried over from an earlier fallback response.
        payload["isStale"] = False
        payload["staleReason"] = None
        return payload

    if force_refresh and cached is not None:
        if now < _get_backoff_until(normalized_currency):
            payload = cached[1]
            # During provider cooldown, keep the last good snapshot visible instead of repeating the same stale banner.
            payload["isStale"] = False
            payload["staleReason"] = None
            return payload

    try:
        payload = _build_dashboard_payload(normalized_currency, point_count=point_count)
    except MarketDataUnavailable:
        # Record the failure before returning stale data so repeated button clicks do not hammer CoinGecko again immediately.
        _store_backoff_until(normalized_currency, now + UPSTREAM_FAILURE_BACKOFF_SECONDS)
        if cached is not None and now - cached[0] < STALE_CACHE_MAX_AGE_SECONDS:
            payload = cached[1]
            # Stale fallback is preferable to a hard failure because the page is primarily informational, not transactional.
            payload["isStale"] = True
            payload["staleReason"] = STALE_WARNING_MESSAGE
            return payload
        raise

    _store_cached_payload(normalized_currency, payload)
    return payload


def get_asset_sparkline(coin_id: str, currency: str = "usd") -> list[dict[str, Any]]:
    """Return the recent 24-hour windowed sparkline points for a specific asset.

    This is clipped to ``CHART_WINDOW_HOURS`` (24 h) and is used by the market
    dashboard.  For the Volatility Challenge, use ``get_asset_full_history``
    instead, which returns the complete 7-day hourly series.
    """
    cached = _get_cached_payload(currency.lower())
    if not cached:
        return []

    _, payload = cached
    for series in payload.get("chartSeries", []):
        if series.get("coinId") == coin_id:
            return series.get("points", [])
    return []


def get_asset_full_history(coin_id: str, currency: str = "usd") -> list[dict[str, Any]]:
    """Return the complete 7-day hourly price history for a coin.

    Unlike ``get_asset_sparkline``, this is not clipped to the dashboard's
    24-hour window — it returns all available hourly data from the CoinGecko
    sparkline (typically ~168 points spanning seven days).

    Returns an empty list if the market cache has not been populated yet.
    The first call to any live-price or dashboard endpoint will populate it.
    """
    key = f"{coin_id}:{currency.lower()}"
    with _raw_sparkline_lock:
        cached = _raw_sparkline_cache.get(key)
    if cached is None:
        return []
    _, points = cached
    return list(points)  # return a copy so callers cannot mutate the cache


def get_asset_market_chart(coin_id: str, currency: str = "usd") -> list[dict[str, Any]]:
    """Return ~24h price history at 5-minute granularity with real UNIX timestamps.

    Uses CoinGecko's ``/coins/{id}/market_chart`` endpoint (``days=1``), which
    provides actual per-point UNIX millisecond timestamps — unlike the sparkline
    whose timestamps are reconstructed from ``last_updated_at``.

    Typical response: ~288 data points over 24 hours, spaced ~5 minutes apart.
    This gives enough density for the Volatility Challenge 1H and 4H chart ranges
    where the hourly sparkline is too coarse (0-1 points vs. ~12-48 here).

    Results are cached for ``_MARKET_CHART_TTL_SECONDS`` (5 minutes) to stay
    within CoinGecko free-tier rate limits.  On cache miss or upstream failure,
    returns the last successful result if available, or an empty list.
    """
    key = f"{coin_id}:{currency.lower()}"
    now = time.monotonic()

    with _market_chart_lock:
        cached = _market_chart_cache.get(key)
        if cached is not None and now - cached[0] < _MARKET_CHART_TTL_SECONDS:
            return list(cached[1])

    try:
        data = _request_json(
            f"/coins/{coin_id}/market_chart",
            {"vs_currency": currency.lower(), "days": "1"},
        )
    except MarketDataUnavailable:
        # Return the last cached result (possibly stale) rather than an error.
        with _market_chart_lock:
            stale = _market_chart_cache.get(key)
        return list(stale[1]) if stale is not None else []

    raw_prices = data.get("prices", []) if isinstance(data, dict) else []
    points: list[dict[str, Any]] = []
    for entry in raw_prices:
        if not (isinstance(entry, (list, tuple)) and len(entry) == 2):
            continue
        ts_ms, price = entry[0], entry[1]
        if not (isinstance(ts_ms, (int, float)) and isinstance(price, (int, float))):
            continue
        points.append(
            {
                "timestamp": datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
                .isoformat(timespec="milliseconds")
                .replace("+00:00", "Z"),
                "price": float(price),
            }
        )

    with _market_chart_lock:
        _market_chart_cache[key] = (now, points)

    return list(points)


def get_asset_ohlc(coin_id: str, currency: str = "usd", days: int = 1) -> list[dict]:
    """Return real OHLC candlestick data from CoinGecko's /ohlc endpoint.

    Unlike the sparkline and market_chart endpoints (which provide only closing
    prices), this endpoint returns actual open, high, low, and close for each
    time period, enabling proper candlestick wicks.

    days=1 → 30-minute candles (~48 per 24h)
    days=7 → 4-hour candles (~42 per 7d)

    Cached for _OHLC_TTL_SECONDS to stay within CoinGecko free-tier limits.
    Returns last cached result on upstream failure, or empty list if uncached.
    """
    key = f"{coin_id}:{currency.lower()}:{days}"
    now = time.monotonic()

    with _ohlc_lock:
        cached = _ohlc_cache.get(key)
        if cached is not None and now - cached[0] < _OHLC_TTL_SECONDS:
            return list(cached[1])

    try:
        data = _request_json(
            f"/coins/{coin_id}/ohlc",
            {"vs_currency": currency.lower(), "days": str(days)},
        )
    except MarketDataUnavailable:
        with _ohlc_lock:
            stale = _ohlc_cache.get(key)
        return list(stale[1]) if stale is not None else []

    points: list[dict] = []
    for entry in (data if isinstance(data, list) else []):
        if not (isinstance(entry, (list, tuple)) and len(entry) == 5):
            continue
        ts_ms, o, h, l, c = entry
        if not all(isinstance(v, (int, float)) for v in (ts_ms, o, h, l, c)):
            continue
        points.append(
            {
                "ts": int(ts_ms),
                "open": float(o),
                "high": float(h),
                "low": float(l),
                "close": float(c),
            }
        )

    with _ohlc_lock:
        _ohlc_cache[key] = (now, points)

    return list(points)


def _fetch_binance_price(coin_id: str) -> float | None:
    """Fetch the current USD price from Binance's public ticker endpoint.

    Binance /api/v3/ticker/price is:
    - Free with no API key
    - Real-time (order-book best price, updated every ~100 ms)
    - Globally accessible via api.binance.com

    Returns None on any failure so callers can fall back gracefully.
    """
    symbol = _COIN_BINANCE_SYMBOLS.get(coin_id)
    if symbol is None:
        return None
    url = f"{_BINANCE_BASE}/ticker/price?symbol={symbol}"
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "team-la-mesa-market-proxy/1.0",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=4) as response:
            data = json.loads(response.read().decode("utf-8"))
        raw = data.get("price")
        price = float(raw)
        return price if price > 0 else None
    except Exception:
        return None


def get_binance_klines(symbol: str, interval: str, limit: int) -> list[dict]:
    """Fetch real OHLC candles from Binance klines. Cached for 60 seconds."""
    key = f"{symbol}:{interval}:{limit}"
    now = time.monotonic()
    with _klines_lock:
        cached = _klines_cache.get(key)
        if cached and now - cached[0] < _KLINES_TTL_SECONDS:
            return cached[1]

    url = f"{_BINANCE_BASE}/klines?symbol={symbol}&interval={interval}&limit={limit}"
    request = Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "team-la-mesa-market-proxy/1.0"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=6) as response:
            data = json.loads(response.read().decode("utf-8"))
        candles = [
            {
                "time": int(row[0]),        # open time in ms
                "open": float(row[1]),
                "high": float(row[2]),
                "low":  float(row[3]),
                "close": float(row[4]),
            }
            for row in data
            if len(row) >= 5
        ]
        with _klines_lock:
            _klines_cache[key] = (now, candles)
        return candles
    except Exception as exc:
        # Return stale cache if available
        with _klines_lock:
            stale = _klines_cache.get(key)
        if stale:
            return stale[1]
        raise MarketDataUnavailable(f"Binance klines unavailable for {symbol} {interval}.") from exc


def get_simple_price(coin_id: str, currency: str = "usd") -> float:
    """Return the current USD price for a single coin.

    Primary source: Binance public ticker (/api/v3/ticker/price) — real-time,
    no API key, updates every ~100 ms.  This means the Volatility Challenge
    chart live-candle reflects the actual market price within seconds.

    Fallback: CoinGecko /simple/price — used when Binance is unreachable.

    Results cached for _SIMPLE_PRICE_TTL_SECONDS (5 s).  On complete failure
    the last cached value is returned; raises MarketDataUnavailable only if
    no cached value exists at all.
    """
    key = f"{coin_id}:{currency.lower()}"
    now = time.monotonic()

    with _simple_price_lock:
        cached = _simple_price_cache.get(key)
        if cached is not None and now - cached[0] < _SIMPLE_PRICE_TTL_SECONDS:
            return cached[1]

    price: float | None = None

    # ── 1. Try Binance (real-time) ────────────────────────────────────────────
    if currency.lower() == "usd":
        price = _fetch_binance_price(coin_id)

    # ── 2. Fall back to CoinGecko /simple/price ───────────────────────────────
    if price is None:
        try:
            data = _request_json(
                "/simple/price",
                {"ids": coin_id, "vs_currencies": currency.lower()},
            )
            price_data = data.get(coin_id, {}) if isinstance(data, dict) else {}
            raw = price_data.get(currency.lower())
            if isinstance(raw, (int, float)) and not isinstance(raw, bool):
                price = float(raw)
        except MarketDataUnavailable:
            pass

    # ── 3. Return stale cache or raise ───────────────────────────────────────
    if price is None:
        with _simple_price_lock:
            stale = _simple_price_cache.get(key)
        if stale is not None:
            return stale[1]
        raise MarketDataUnavailable(f"Live price unavailable for {coin_id}.")

    with _simple_price_lock:
        _simple_price_cache[key] = (now, price)

    return price
