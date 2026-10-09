from rest_framework.views import APIView
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from .models import Participant, Asset, HistoricalPrice, Competition, Trade, DailySnapshot
from .serializers import (
    ParticipantSerializer,
    AssetSerializer,
    AssetLivePriceSerializer,
    LeaderboardEntrySerializer,
    TradeSerializer,
    HistoricalPriceSerializer,
)
from .services import execute_trade, TradeExecutionError, recalculate_participant_equity


# ─────────────────────────────────────────────────────────────
# HELPER
# ─────────────────────────────────────────────────────────────

def get_participant(user, competition_id=None):
    """
    Returns the active Participant for this user.
    If competition_id is supplied it filters by that; otherwise
    returns the participant in the most recent active competition.
    """
    qs = Participant.objects.filter(user=user)
    if competition_id:
        return get_object_or_404(qs, competition_id=competition_id)
    # Fall back: first active competition
    active = qs.filter(competition__is_active=True).select_related('competition').first()
    if active:
        return active
    return get_object_or_404(qs)


# ─────────────────────────────────────────────────────────────
# PRICES
# ─────────────────────────────────────────────────────────────

class LivePricesView(APIView):
    """
    GET /api/prices/live/
    Returns current price + 24h change for all 10 coins.
    Poll this every 3–5 seconds from the frontend.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        assets = Asset.objects.all()
        serializer = AssetLivePriceSerializer(assets, many=True)
        return Response(serializer.data)


class AssetDetailView(APIView):
    """
    GET /api/prices/<ticker>/
    Single coin: price, 24h change, full metadata.
    """
    permission_classes = [AllowAny]

    def get(self, request, ticker):
        asset = get_object_or_404(Asset, ticker=ticker.upper())
        serializer = AssetSerializer(asset)
        return Response(serializer.data)


# ─────────────────────────────────────────────────────────────
# CHART DATA
# ─────────────────────────────────────────────────────────────

class ChartDataView(APIView):
    """
    GET /api/chart/<ticker>/?days=1
    Returns OHLC candle data for TradingView Lightweight Charts.

    Query params:
        days  — how many days of history (default 1, max 365)
    """
    permission_classes = [AllowAny]

    def get(self, request, ticker):
        days = min(int(request.GET.get('days', 1)), 365)
        start_time = timezone.now() - timedelta(days=days)

        prices = HistoricalPrice.objects.filter(
            asset__ticker=ticker.upper(),
            timestamp__gte=start_time,
        ).order_by('timestamp').select_related('asset')

        serializer = HistoricalPriceSerializer(prices, many=True)
        return Response(serializer.data)


# ─────────────────────────────────────────────────────────────
# TRADING
# ─────────────────────────────────────────────────────────────

class TradeView(APIView):
    """
    POST /api/trade/
    Body: { "ticker": "BTC", "quantity": "0.5", "side": "BUY" }
          Optionally: "competition_id": 1

    Returns the updated portfolio so the UI can re-render immediately.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ticker = request.data.get('ticker')
        quantity = request.data.get('quantity')
        side = request.data.get('side', '').upper()
        competition_id = request.data.get('competition_id')

        if not all([ticker, quantity, side]):
            return Response(
                {"error": "ticker, quantity, and side are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        participant = get_participant(request.user, competition_id)

        try:
            trade = execute_trade(participant.id, ticker, quantity, side)
        except TradeExecutionError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": "An unexpected error occurred."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Refresh equity cache immediately so UI is up-to-date
        participant.refresh_from_db()
        recalculate_participant_equity(participant)
        participant.refresh_from_db()

        return Response(
            {
                "message": "Trade executed successfully.",
                "trade": TradeSerializer(trade).data,
                "portfolio": ParticipantSerializer(participant).data,
            },
            status=status.HTTP_201_CREATED,
        )


# ─────────────────────────────────────────────────────────────
# PORTFOLIO
# ─────────────────────────────────────────────────────────────

class PortfolioView(APIView):
    """
    GET /api/portfolio/
    Full wallet: cash, positions with unrealised PnL, total equity.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        competition_id = request.GET.get('competition_id')
        participant = get_participant(request.user, competition_id)
        serializer = ParticipantSerializer(participant)
        return Response(serializer.data)


class TradeHistoryView(APIView):
    """
    GET /api/trades/
    Paginated trade history for the authenticated user.

    Query params:
        ticker       — filter by asset (optional)
        page         — page number (default 1)
        page_size    — results per page (default 20, max 100)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        competition_id = request.GET.get('competition_id')
        ticker = request.GET.get('ticker', '').upper()
        page = max(int(request.GET.get('page', 1)), 1)
        page_size = min(int(request.GET.get('page_size', 20)), 100)

        participant = get_participant(request.user, competition_id)
        trades = participant.trades.select_related('asset').order_by('-timestamp')

        if ticker:
            trades = trades.filter(asset__ticker=ticker)

        total = trades.count()
        start = (page - 1) * page_size
        end = start + page_size
        serializer = TradeSerializer(trades[start:end], many=True)

        return Response({
            "total": total,
            "page": page,
            "page_size": page_size,
            "results": serializer.data,
        })


# ─────────────────────────────────────────────────────────────
# LEADERBOARD
# ─────────────────────────────────────────────────────────────

class LeaderboardView(APIView):
    """
    GET /api/leaderboard/?period=all&competition_id=1&limit=10

    period options: all | weekly | monthly | yearly
    Returns top N winners AND bottom N losers for that period.
    """
    permission_classes = [AllowAny]

    PERIOD_FIELD = {
        'all':     'all_time_return_pct',
        'weekly':  'weekly_return_pct',
        'monthly': 'monthly_return_pct',
        'yearly':  'yearly_return_pct',
    }

    def get(self, request):
        period = request.GET.get('period', 'all').lower()
        competition_id = request.GET.get('competition_id')
        limit = min(int(request.GET.get('limit', 10)), 50)

        sort_field = self.PERIOD_FIELD.get(period, 'all_time_return_pct')

        qs = Participant.objects.select_related('user').filter(
            competition__is_active=True
        )
        if competition_id:
            qs = qs.filter(competition_id=competition_id)

        winners = qs.order_by(f'-{sort_field}')[:limit]
        losers = qs.order_by(sort_field)[:limit]

        return Response({
            "period": period,
            "winners": LeaderboardEntrySerializer(winners, many=True).data,
            "losers": LeaderboardEntrySerializer(losers, many=True).data,
        })


# ─────────────────────────────────────────────────────────────
# REGISTRATION / ONBOARDING
# ─────────────────────────────────────────────────────────────

class JoinCompetitionView(APIView):
    """
    POST /api/competition/join/
    Body: { "competition_id": 1 }   (omit to join the latest active one)

    Creates a Participant with the competition's starting balance.
    Idempotent — returns existing participant if already joined.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        competition_id = request.data.get('competition_id')

        if competition_id:
            competition = get_object_or_404(Competition, id=competition_id, is_active=True)
        else:
            competition = Competition.objects.filter(is_active=True).order_by('-start_date').first()
            if not competition:
                return Response({"error": "No active competition found."}, status=status.HTTP_404_NOT_FOUND)

        participant, created = Participant.objects.get_or_create(
            user=request.user,
            competition=competition,
            defaults={'cash_balance': competition.starting_balance},
        )

        return Response(
            {
                "message": "Joined competition." if created else "Already a participant.",
                "portfolio": ParticipantSerializer(participant).data,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )