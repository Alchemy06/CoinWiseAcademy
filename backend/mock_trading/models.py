from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
from django.utils import timezone
from decimal import Decimal


class Competition(models.Model):
    title = models.CharField(max_length=200)
    starting_balance = models.DecimalField(max_digits=20, decimal_places=2, default=Decimal('10000.00'))
    monthly_stipend = models.DecimalField(max_digits=20, decimal_places=2, default=Decimal('2000.00'))
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.title


class Asset(models.Model):
    ticker = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=100)
    current_price = models.DecimalField(max_digits=20, decimal_places=8, default=Decimal('0.0'))
    price_change_24h = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal('0.0'))  # % change
    last_updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.ticker} ({self.name})"


class Participant(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    competition = models.ForeignKey(Competition, on_delete=models.CASCADE)

    # Financial State
    cash_balance = models.DecimalField(max_digits=20, decimal_places=2, validators=[MinValueValidator(0)])
    total_stipends_received = models.DecimalField(max_digits=20, decimal_places=2, default=Decimal('0.00'))
    last_stipend_date = models.DateField(auto_now_add=True)

    # Cached for leaderboard — updated by the monitor every 30s
    total_equity = models.DecimalField(max_digits=20, decimal_places=2, default=Decimal('10000.00'))
    holdings_value = models.DecimalField(max_digits=20, decimal_places=2, default=Decimal('0.00'))
    all_time_return_pct = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal('0.0'))

    # Leaderboard period returns (updated by monitor)
    weekly_return_pct = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal('0.0'))
    monthly_return_pct = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal('0.0'))
    yearly_return_pct = models.DecimalField(max_digits=10, decimal_places=4, default=Decimal('0.0'))

    class Meta:
        unique_together = ('user', 'competition')

    def __str__(self):
        return f"{self.user.username} in {self.competition.title}"


class Position(models.Model):
    participant = models.ForeignKey(Participant, on_delete=models.CASCADE, related_name='positions')
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE)
    quantity = models.DecimalField(max_digits=20, decimal_places=8, default=Decimal('0.0'))
    avg_buy_price = models.DecimalField(max_digits=20, decimal_places=8, default=Decimal('0.0'))

    class Meta:
        unique_together = ('participant', 'asset')

    @property
    def current_value(self):
        return self.quantity * self.asset.current_price

    @property
    def cost_basis(self):
        return self.quantity * self.avg_buy_price

    @property
    def unrealised_pnl(self):
        return self.current_value - self.cost_basis

    @property
    def unrealised_pnl_pct(self):
        if self.cost_basis == 0:
            return Decimal('0.0')
        return ((self.current_value - self.cost_basis) / self.cost_basis) * 100

    def __str__(self):
        return f"{self.participant.user.username} — {self.asset.ticker} x{self.quantity}"


class Trade(models.Model):
    SIDE_CHOICES = [('BUY', 'Buy'), ('SELL', 'Sell')]
    participant = models.ForeignKey(Participant, on_delete=models.CASCADE, related_name='trades')
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE)
    side = models.CharField(max_length=4, choices=SIDE_CHOICES)
    quantity = models.DecimalField(max_digits=20, decimal_places=8)
    price_at_execution = models.DecimalField(max_digits=20, decimal_places=8)
    total_value = models.DecimalField(max_digits=20, decimal_places=8)  # quantity * price — stored for audit
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.side} {self.quantity} {self.asset.ticker} @ {self.price_at_execution}"


class DailySnapshot(models.Model):
    """
    Saved once per day per participant.
    Used to compute weekly / monthly / yearly leaderboard returns.
    """
    participant = models.ForeignKey(Participant, on_delete=models.CASCADE, related_name='snapshots')
    timestamp = models.DateTimeField(default=timezone.now)
    equity_value = models.DecimalField(max_digits=20, decimal_places=2)
    cash_balance = models.DecimalField(max_digits=20, decimal_places=2, default=Decimal('0.00'))

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.participant.user.username} snapshot @ {self.timestamp:%Y-%m-%d} = £{self.equity_value}"


class HistoricalPrice(models.Model):
    """
    OHLC candle data for each asset. Populated by the monitor every 5s (stored as 1-min candles).
    Frontend reads this for the chart.
    """
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name='historical_prices')
    timestamp = models.DateTimeField(db_index=True)
    open = models.DecimalField(max_digits=20, decimal_places=8)
    high = models.DecimalField(max_digits=20, decimal_places=8)
    low = models.DecimalField(max_digits=20, decimal_places=8)
    close = models.DecimalField(max_digits=20, decimal_places=8)
    volume = models.DecimalField(max_digits=30, decimal_places=8, default=Decimal('0.0'))

    class Meta:
        unique_together = ('asset', 'timestamp')
        ordering = ['timestamp']

    def __str__(self):
        return f"{self.asset.ticker} @ {self.timestamp:%Y-%m-%d %H:%M}"