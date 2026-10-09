import time
import requests
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from decimal import Decimal
from mock_trading.models import Asset, Participant, Position, DailySnapshot, HistoricalPrice

class Command(BaseCommand):
    help = "Runs the 24/7 Trading Engine"

    def handle(self, *args, **options):
        self.stdout.write("Monitoring Engine Started...")
        
        last_stipend_check = 0
        last_snapshot_time = 0

        while True:
            # UPDATE PRICES (Every 5 Seconds) ---
            self.update_market_prices()

            # --- TASK 2: CALCULATE USER EQUITY (Every 30 Seconds) ---
            # We do this often so the leaderboard feels "Live"
            self.refresh_leaderboard_data()

            # --- TASK 3: GIVE STIPENDS (Every Hour) ---
            if time.time() - last_stipend_check > 3600:
                self.distribute_stipends()
                last_stipend_check = time.time()

            # --- TASK 4: TAKE SNAPSHOTS (Every 24 Hours) ---
            if time.time() - last_snapshot_time > 86400:
                self.take_daily_snapshots()
                last_snapshot_time = time.time()

            time.sleep(5) # The "Heartbeat"

    def update_market_prices(self):
        """Fetches from Binance and updates the Asset table"""
        # We fetch all 10 coins in one request to save API credits
        tickers = Asset.objects.values_list('ticker', flat=True)
        for ticker in tickers:
            try:
                # Binance pair format: BTC + USDT
                response = requests.get(f"https://api.binance.com/api/v3/ticker/price?symbol={ticker}USDT")
                data = response.json()
                price = Decimal(data['price'])
                
                asset = Asset.objects.get(ticker=ticker)
                asset.current_price = price
                asset.save()

                # Optional: Store for the graph
                HistoricalPrice.objects.create(
                    asset=asset,
                    timestamp=timezone.now(),
                    close=price,
                    open=price, high=price, low=price # Simplified for v1
                )
            except Exception as e:
                self.stdout.write(f"Error fetching {ticker}: {e}")

    def refresh_leaderboard_data(self):
        """Recalculates every user's wealth so the leaderboard stays updated"""
        participants = Participant.objects.all()
        for p in participants:
            holdings_value = sum(pos.quantity * pos.asset.current_price for pos in p.positions.all())
            p.total_equity = p.cash_balance + holdings_value
            
            # ROI = (Current / (Initial + Stipends)) - 1
            total_invested = p.competition.starting_balance + p.total_stipends_received
            p.all_time_return_pct = ((p.total_equity / total_invested) - 1) * 100
            p.save()

    def distribute_stipends(self):
        """Checks if users are due for their monthly $2k"""
        thirty_days_ago = timezone.now().date() - timezone.timedelta(days=30)
        due_participants = Participant.objects.filter(last_stipend_date__lte=thirty_days_ago)
        
        for p in due_participants:
            with transaction.atomic():
                p.cash_balance += Decimal('2000.00')
                p.total_stipends_received += Decimal('2000.00')
                p.last_stipend_date = timezone.now().date()
                p.save()
                self.stdout.write(f"Stipend paid to {p.user.username}")

    def take_daily_snapshots(self):
        """Saves a permanent record for Weekly/Monthly leaderboard logic"""
        for p in Participant.objects.all():
            DailySnapshot.objects.create(participant=p, equity_value=p.total_equity)