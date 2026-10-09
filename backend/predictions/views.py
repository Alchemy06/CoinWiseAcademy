from datetime import timedelta

from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Prediction
from .serializers import PredictionCreateSerializer, PredictionSerializer
from .services import LivePriceUnavailable, compute_stats, get_live_price, resolve_prediction

# Range → Binance interval + candle count
_CHART_RANGE_CONFIG: dict[str, dict] = {
    "1H":  {"interval": "1m",  "limit": 60},
    "4H":  {"interval": "5m",  "limit": 48},
    "24H": {"interval": "30m", "limit": 48},
    "7D":  {"interval": "4h",  "limit": 42},
}

_ASSET_BINANCE_SYMBOLS: dict[str, str] = {
    "BTC": "BTCUSDT",
    "ETH": "ETHUSDT",
}


class LivePriceView(APIView):
    """
    GET /api/predictions/live-price/?asset=BTC

    Returns the current cached price for BTC or ETH using the existing market
    service cache.  Public endpoint — no extra CoinGecko calls are made beyond
    what the market service already schedules.  The chart polls this endpoint
    every few seconds; the 45-second server cache means the price value updates
    roughly every 45 s while the rest of the response (timestamp, asset) is
    always fresh.
    """

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        asset = request.query_params.get("asset", "").strip().upper()
        if asset not in ("BTC", "ETH"):
            return Response(
                {"detail": "asset must be BTC or ETH"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            price = get_live_price(asset)
            # Fetch 24h change and sparkline from the dashboard cache to help the chart on load.
            # Request 168 points (7 days of hourly data) so the frontend has enough detail for 4h-24h range.
            from market.services import get_asset_full_history, get_asset_market_chart, get_asset_ohlc, get_crypto_dashboard
            dashboard = get_crypto_dashboard("usd", point_count=168)
            change_24h = 0.0
            for a in dashboard.get("assets", []):
                if a.get("symbol") == asset:
                    change_24h = a.get("change24h", 0.0)
                    break

            from .services import ASSET_COIN_IDS
            coin_id = ASSET_COIN_IDS.get(asset)
            # 7-day hourly history (reconstructed timestamps) — used for 24H and 7D chart ranges.
            history = get_asset_full_history(coin_id) if coin_id else []
            # 24h high-resolution history (~5-min intervals, real UNIX timestamps) — used
            # for 1H and 4H ranges where hourly data is too coarse (only 0–4 points).
            history_hires = get_asset_market_chart(coin_id) if coin_id else []
            ohlc_1d = get_asset_ohlc(coin_id, days=1) if coin_id else []
            ohlc_7d = get_asset_ohlc(coin_id, days=7) if coin_id else []
        except LivePriceUnavailable as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response(
            {
                "asset": asset,
                "price": str(price),
                "change_24h": change_24h,
                "history": history,
                "history_hires": history_hires,
                "ohlc_1d": ohlc_1d,
                "ohlc_7d": ohlc_7d,
                "timestamp": timezone.now().isoformat(),
            }
        )


class PredictionListCreateView(APIView):
    """
    GET  /api/predictions/  — list all predictions for the authenticated user,
                               auto-resolving any that are due, then return
                               pending list, resolved list, and stats.

    POST /api/predictions/  — create a new prediction using the current live price.
    """

    permission_classes = [permissions.IsAuthenticated]

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _resolve_due(self, predictions: "list[Prediction]") -> None:
        """Resolve any pending predictions whose resolve_at has passed.

        Fetches one live price per unique asset so we don't hammer the API.
        Predictions for assets where the live price is unavailable are left
        pending and silently skipped — they will be retried on the next request.
        """
        due = [p for p in predictions if p.is_due]
        if not due:
            return

        # Batch price look-ups per asset.
        assets_needed = {p.asset for p in due}
        live_prices: dict[str, object] = {}
        for asset in assets_needed:
            try:
                live_prices[asset] = get_live_price(asset)
            except LivePriceUnavailable:
                pass  # Skip — will retry on next load.

        for prediction in due:
            price = live_prices.get(prediction.asset)
            if price is not None:
                resolve_prediction(prediction, price)

    # ── GET ───────────────────────────────────────────────────────────────────

    def get(self, request):
        qs = list(Prediction.objects.filter(user=request.user))
        self._resolve_due(qs)

        # Re-query after potential resolution to pick up the updated status fields.
        qs = list(Prediction.objects.filter(user=request.user))

        pending = [p for p in qs if p.status == "pending"]
        resolved = [p for p in qs if p.status == "resolved"]

        return Response(
            {
                "pending": PredictionSerializer(pending, many=True).data,
                "resolved": PredictionSerializer(resolved, many=True).data,
                "stats": compute_stats(qs),
            },
            status=status.HTTP_200_OK,
        )

    # ── POST ──────────────────────────────────────────────────────────────────

    def post(self, request):
        serializer = PredictionCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        asset: str = data["asset"]
        direction: str = data["direction"]
        timeframe_minutes: int = data["timeframe_minutes"]
        confidence = data["confidence"]

        # Enforce one pending prediction per asset — simpler than per-asset-per-timeframe.
        existing_pending = Prediction.objects.filter(
            user=request.user,
            asset=asset,
            status="pending",
        ).first()
        if existing_pending:
            return Response(
                {
                    "detail": (
                        f"You already have a pending {asset} prediction. "
                        f"Wait for it to resolve before creating another."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        # Fetch live price — fail gracefully if unavailable.
        try:
            entry_price = get_live_price(asset)
        except LivePriceUnavailable as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        now = timezone.now()
        prediction = Prediction.objects.create(
            user=request.user,
            asset=asset,
            direction=direction,
            timeframe_minutes=timeframe_minutes,
            confidence=confidence,
            entry_price=entry_price,
            source_currency="usd",
            entry_timestamp=now,
            resolve_at=now + timedelta(minutes=timeframe_minutes),
            status="pending",
        )

        return Response(
            PredictionSerializer(prediction).data,
            status=status.HTTP_201_CREATED,
        )


class ChartDataView(APIView):
    """
    GET /api/predictions/chart/?asset=BTC&range=1H

    Returns real OHLC candles from Binance klines for the selected asset
    and time range, plus the current live price.

    Public endpoint — no authentication required.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        asset = request.query_params.get("asset", "").strip().upper()
        range_key = request.query_params.get("range", "1H").strip().upper()

        if asset not in _ASSET_BINANCE_SYMBOLS:
            return Response({"detail": "asset must be BTC or ETH"}, status=status.HTTP_400_BAD_REQUEST)
        if range_key not in _CHART_RANGE_CONFIG:
            return Response({"detail": "range must be 1H, 4H, 24H, or 7D"}, status=status.HTTP_400_BAD_REQUEST)

        config = _CHART_RANGE_CONFIG[range_key]
        symbol = _ASSET_BINANCE_SYMBOLS[asset]

        try:
            from market.services import MarketDataUnavailable, get_binance_klines
            candles = get_binance_klines(symbol, config["interval"], config["limit"])
        except Exception as exc:
            return Response({"detail": f"Chart data unavailable: {exc}"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        try:
            last_price = float(get_live_price(asset))
        except LivePriceUnavailable:
            last_price = float(candles[-1]["close"]) if candles else None

        return Response({
            "asset": asset,
            "range": range_key,
            "interval": config["interval"],
            "candles": candles,
            "last_price": last_price,
            "timestamp": timezone.now().isoformat(),
        })
