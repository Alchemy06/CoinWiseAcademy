"""
Management command to fetch and update live crypto prices from CoinGecko.
Run manually: python manage.py update_asset_prices
Or schedule with cron/celery for periodic updates.

Example cron (every 5 minutes):
*/5 * * * * cd /path/to/backend && python manage.py update_asset_prices
"""

import requests
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.utils import timezone
from mock_trading.models import Asset


class Command(BaseCommand):
    help = "Fetch live crypto prices from CoinGecko API and update Asset model"

    # Map asset tickers to CoinGecko IDs
    TICKER_TO_COINGECKO_ID = {
        'BTC': 'bitcoin',
        'ETH': 'ethereum',
        'USDT': 'tether',
        'BNB': 'binancecoin',
        'XRP': 'ripple',
        'USDC': 'usd-coin',
        'SOL': 'solana',
        'TRX': 'tron',
        'DOGE': 'dogecoin',
        'ADA': 'cardano',
    }

    COINGECKO_BASE_URL = "https://api.coingecko.com/api/v3"
    TIMEOUT_SECONDS = 10

    def add_arguments(self, parser):
        parser.add_argument(
            '--currency',
            type=str,
            default='usd',
            help='Currency to fetch prices in (default: usd)',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force update even if recently updated',
        )

    def handle(self, *args, **options):
        currency = options['currency'].lower()
        force = options['force']

        self.stdout.write(self.style.WARNING(f"Fetching prices in {currency.upper()}..."))

        try:
            prices = self._fetch_prices(currency)
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Failed to fetch prices: {e}"))
            return

        updated_count = self._update_assets(prices)
        self.stdout.write(
            self.style.SUCCESS(f"Successfully updated {updated_count} assets")
        )

    def _fetch_prices(self, currency: str) -> dict:
        """
        Fetch prices from CoinGecko for all supported coins.
        Returns: {ticker: price_in_currency}
        """
        coingecko_ids = ','.join(self.TICKER_TO_COINGECKO_ID.values())
        
        url = f"{self.COINGECKO_BASE_URL}/simple/price"
        params = {
            'ids': coingecko_ids,
            'vs_currencies': currency,
            'include_market_cap': 'false',
            'include_24hr_vol': 'true',
            'include_24hr_change': 'true',
        }

        self.stdout.write(f"Requesting: {url}")
        response = requests.get(url, params=params, timeout=self.TIMEOUT_SECONDS)
        response.raise_for_status()
        
        data = response.json()
        
        # Reverse map: CoinGecko ID → ticker → price
        prices = {}
        for ticker, coingecko_id in self.TICKER_TO_COINGECKO_ID.items():
            if coingecko_id in data and currency in data[coingecko_id]:
                price = data[coingecko_id][currency]
                change_24h = data[coingecko_id].get('usd_24h_change', 0)
                prices[ticker] = {
                    'price': Decimal(str(price)),
                    'change_24h': Decimal(str(change_24h)) if change_24h else Decimal('0.0')
                }
        
        return prices

    def _update_assets(self, prices: dict) -> int:
        """Update Asset records with new prices"""
        updated = 0
        
        for ticker, price_data in prices.items():
            try:
                asset = Asset.objects.get(ticker=ticker)
                asset.current_price = price_data['price']
                asset.price_change_24h = price_data['change_24h']
                asset.last_updated = timezone.now()
                asset.save()
                
                self.stdout.write(
                    f"  {ticker}: {price_data['price']} "
                    f"({price_data['change_24h']:+.2f}%)"
                )
                updated += 1
            except Asset.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(f"  {ticker}: Asset not found in database")
                )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f"  {ticker}: {e}")
                )
        
        return updated
