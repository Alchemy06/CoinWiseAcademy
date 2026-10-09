from django.urls import path
from .views import (
    LivePricesView,
    AssetDetailView,
    ChartDataView,
    TradeView,
    PortfolioView,
    TradeHistoryView,
    LeaderboardView,
    JoinCompetitionView,
)

urlpatterns = [
    # ── Prices ───────────────────────────────────────────────
    # GET  /api/prices/live/               → all coins, price + 24h %
    path('prices/live/', LivePricesView.as_view(), name='live-prices'),

    # GET  /api/prices/<ticker>/           → single coin full detail
    path('prices/<str:ticker>/', AssetDetailView.as_view(), name='asset-detail'),

    # ── Chart ─────────────────────────────────────────────────
    # GET  /api/chart/<ticker>/?days=7     → OHLC candle history
    path('chart/<str:ticker>/', ChartDataView.as_view(), name='chart-data'),

    # ── Trading ───────────────────────────────────────────────
    # POST /api/trade/                     → execute buy or sell
    path('trade/', TradeView.as_view(), name='trade'),

    # ── Portfolio ─────────────────────────────────────────────
    # GET  /api/portfolio/                 → full wallet + positions
    path('portfolio/', PortfolioView.as_view(), name='portfolio'),

    # GET  /api/trades/                    → trade history (paginated)
    path('trades/', TradeHistoryView.as_view(), name='trade-history'),

    # ── Leaderboard ───────────────────────────────────────────
    # GET  /api/leaderboard/?period=all    → winners + losers
    path('leaderboard/', LeaderboardView.as_view(), name='leaderboard'),

    # ── Competition ───────────────────────────────────────────
    # POST /api/competition/join/          → register / onboard
    path('competition/join/', JoinCompetitionView.as_view(), name='join-competition'),
]