"""
Background price update service for mock trading.
Automatically fetches and updates crypto prices every N seconds.

This runs automatically when Django starts (via apps.py ready() signal).
No manual intervention needed.
"""

import threading
import time
import requests
from decimal import Decimal
from datetime import datetime
from django.utils import timezone
from django.conf import settings

# Import in function to avoid circular imports
def get_asset_model():
    from mock_trading.models import Asset
    return Asset


class PriceUpdateService:
    """Continuously update crypto prices in background thread"""
    
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
    DEFAULT_UPDATE_INTERVAL = 45  # seconds
    TIMEOUT_SECONDS = 8
    
    def __init__(self, update_interval=DEFAULT_UPDATE_INTERVAL, currency='usd'):
        self.update_interval = update_interval
        self.currency = currency.lower()
        self.thread = None
        self.is_running = False
        self.last_update = None
        self.error_count = 0
        self.max_consecutive_errors = 5
        
    def start(self):
        """Start the background price update thread"""
        if self.is_running:
            return
        
        self.is_running = True
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()
        print(f"[PriceUpdateService] Started (interval: {self.update_interval}s)")
    
    def stop(self):
        """Stop the background thread"""
        self.is_running = False
        if self.thread:
            self.thread.join(timeout=5)
        print("[PriceUpdateService] Stopped")
    
    def _run_loop(self):
        """Main loop - runs in background thread"""
        while self.is_running:
            try:
                self._update_prices()
                self.error_count = 0  # Reset on success
            except Exception as e:
                self.error_count += 1
                if self.error_count == 1:  # Log first error only
                    print(f"[PriceUpdateService] Error: {e}")
                
                # Stop if too many consecutive errors
                if self.error_count >= self.max_consecutive_errors:
                    print(f"[PriceUpdateService] Too many errors ({self.error_count}), stopping")
                    self.is_running = False
                    break
            
            time.sleep(self.update_interval)
    
    def _update_prices(self):
        """Fetch prices from CoinGecko and update database"""
        prices = self._fetch_prices()
        
        if not prices:
            return
        
        Asset = get_asset_model()
        updated_count = 0
        
        for ticker, price_data in prices.items():
            try:
                asset = Asset.objects.get(ticker=ticker)
                asset.current_price = price_data['price']
                asset.price_change_24h = price_data['change_24h']
                asset.last_updated = timezone.now()
                asset.save(update_fields=['current_price', 'price_change_24h', 'last_updated'])
                updated_count += 1
            except Asset.DoesNotExist:
                pass  # Asset not in database yet
            except Exception as e:
                print(f"[PriceUpdateService] Failed to update {ticker}: {e}")
        
        self.last_update = datetime.now()
        
        if updated_count > 0:
            print(f"[PriceUpdateService] Updated {updated_count} prices at {self.last_update}")
    
    def _fetch_prices(self) -> dict:
        """Fetch prices from CoinGecko"""
        coingecko_ids = ','.join(self.TICKER_TO_COINGECKO_ID.values())
        
        url = f"{self.COINGECKO_BASE_URL}/simple/price"
        params = {
            'ids': coingecko_ids,
            'vs_currencies': self.currency,
            'include_24hr_change': 'true',
        }
        
        try:
            response = requests.get(
                url,
                params=params,
                timeout=self.TIMEOUT_SECONDS,
                headers={'Accept': 'application/json'}
            )
            response.raise_for_status()
        except requests.exceptions.Timeout:
            raise Exception("CoinGecko API timeout")
        except requests.exceptions.ConnectionError:
            raise Exception("CoinGecko API connection error")
        except requests.exceptions.HTTPError as e:
            raise Exception(f"CoinGecko API HTTP error: {e.response.status_code}")
        
        data = response.json()
        prices = {}
        
        for ticker, coingecko_id in self.TICKER_TO_COINGECKO_ID.items():
            if coingecko_id in data and self.currency in data[coingecko_id]:
                price = data[coingecko_id][self.currency]
                change_24h = data[coingecko_id].get(f'{self.currency}_24h_change', 0)
                
                prices[ticker] = {
                    'price': Decimal(str(price)),
                    'change_24h': Decimal(str(change_24h)) if change_24h else Decimal('0.0')
                }
        
        return prices


# Global service instance
_price_update_service = None


def get_price_update_service() -> PriceUpdateService:
    """Get or create the global price update service"""
    global _price_update_service
    if _price_update_service is None:
        interval = getattr(settings, 'MOCK_TRADING_PRICE_UPDATE_INTERVAL', 15)
        currency = getattr(settings, 'MOCK_TRADING_PRICE_CURRENCY', 'usd')
        _price_update_service = PriceUpdateService(
            update_interval=interval,
            currency=currency
        )
    return _price_update_service


def start_price_updates():
    """Start the background price update service"""
    service = get_price_update_service()
    if not service.is_running:
        service.start()


def stop_price_updates():
    """Stop the background price update service"""
    service = get_price_update_service()
    if service.is_running:
        service.stop()
