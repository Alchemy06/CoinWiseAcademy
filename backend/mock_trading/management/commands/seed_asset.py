from django.core.management.base import BaseCommand
from mock_trading.models import Asset

class Command(BaseCommand):
    help = "Seeds the top 10 coins into the database"

    def handle(self, *args, **options):
        coins = [
            ('BTC', 'Bitcoin'), ('ETH', 'Ethereum'), ('USDT', 'Tether'),
            ('BNB', 'BNB'), ('XRP', 'XRP'), ('USDC', 'USD Coin'),
            ('SOL', 'Solana'), ('TRX', 'TRON'), ('DOGE', 'Dogecoin'),
            ('ADA', 'Cardano')
        ]
        for ticker, name in coins:
            Asset.objects.get_or_create(
                ticker=ticker, 
                defaults={'name': name}
            )
        self.stdout.write(self.style.SUCCESS('Successfully seeded 10 coins'))