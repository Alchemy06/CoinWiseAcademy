from django.apps import AppConfig


class MockTradingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'mock_trading'

    def ready(self):
        """Start background price update service when Django loads"""
        from .price_service import start_price_updates
        
        try:
            start_price_updates()
        except Exception as e:
            print(f"[MockTradingConfig] Failed to start price updates: {e}")
