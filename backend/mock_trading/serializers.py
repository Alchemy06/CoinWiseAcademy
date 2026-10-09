from rest_framework import serializers
from .models import Asset, Position, Participant, Trade, DailySnapshot, HistoricalPrice
from decimal import Decimal


class AssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = ['id', 'ticker', 'name', 'current_price', 'price_change_24h', 'last_updated']


class AssetLivePriceSerializer(serializers.ModelSerializer):
    """Lightweight — only what the frontend ticker needs."""
    class Meta:
        model = Asset
        fields = ['ticker', 'current_price', 'price_change_24h', 'last_updated']


class PositionSerializer(serializers.ModelSerializer):
    asset_ticker = serializers.ReadOnlyField(source='asset.ticker')
    asset_name = serializers.ReadOnlyField(source='asset.name')
    current_price = serializers.DecimalField(
        source='asset.current_price', max_digits=20, decimal_places=8, read_only=True
    )
    current_value = serializers.SerializerMethodField()
    cost_basis = serializers.SerializerMethodField()
    unrealised_pnl = serializers.SerializerMethodField()
    unrealised_pnl_pct = serializers.SerializerMethodField()
    portfolio_pct = serializers.SerializerMethodField()

    class Meta:
        model = Position
        fields = [
            'asset_ticker',
            'asset_name',
            'quantity',
            'avg_buy_price',
            'current_price',
            'current_value',
            'cost_basis',
            'unrealised_pnl',
            'unrealised_pnl_pct',
            'portfolio_pct',
        ]

    def get_current_value(self, obj):
        return round(float(obj.current_value), 2)

    def get_cost_basis(self, obj):
        return round(float(obj.cost_basis), 2)

    def get_unrealised_pnl(self, obj):
        return round(float(obj.unrealised_pnl), 2)

    def get_unrealised_pnl_pct(self, obj):
        return round(float(obj.unrealised_pnl_pct), 4)

    def get_portfolio_pct(self, obj):
        """What % of this participant's total equity is in this coin."""
        total_equity = self.context.get('total_equity', Decimal('1'))
        if not total_equity or total_equity == 0:
            return 0.0
        return round(float(obj.current_value / total_equity * 100), 2)


class TradeSerializer(serializers.ModelSerializer):
    asset_ticker = serializers.ReadOnlyField(source='asset.ticker')
    asset_name = serializers.ReadOnlyField(source='asset.name')

    class Meta:
        model = Trade
        fields = [
            'id',
            'asset_ticker',
            'asset_name',
            'side',
            'quantity',
            'price_at_execution',
            'total_value',
            'timestamp',
        ]


class ParticipantSerializer(serializers.ModelSerializer):
    username = serializers.ReadOnlyField(source='user.username')
    positions = serializers.SerializerMethodField()

    class Meta:
        model = Participant
        fields = [
            'username',
            'cash_balance',
            'holdings_value',
            'total_equity',
            'all_time_return_pct',
            'weekly_return_pct',
            'monthly_return_pct',
            'yearly_return_pct',
            'positions',
        ]

    def get_positions(self, obj):
        positions = obj.positions.select_related('asset').all()
        return PositionSerializer(
            positions, many=True, context={'total_equity': obj.total_equity}
        ).data


class LeaderboardEntrySerializer(serializers.ModelSerializer):
    username = serializers.ReadOnlyField(source='user.username')

    class Meta:
        model = Participant
        fields = [
            'username',
            'total_equity',
            'all_time_return_pct',
            'weekly_return_pct',
            'monthly_return_pct',
            'yearly_return_pct',
        ]


class HistoricalPriceSerializer(serializers.ModelSerializer):
    time = serializers.SerializerMethodField()

    class Meta:
        model = HistoricalPrice
        fields = ['time', 'open', 'high', 'low', 'close', 'volume']

    def get_time(self, obj):
        return int(obj.timestamp.timestamp())