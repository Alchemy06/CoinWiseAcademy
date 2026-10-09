from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from . import services
from .services import MarketDataUnavailable, clear_market_cache, get_crypto_dashboard


def sample_dashboard(currency: str) -> dict:
    # Keep service-level fixtures close to the real API shape so cache and stale-state assertions stay realistic.
    return {
        "assets": [
            {
                "coinId": "bitcoin",
                "symbol": "BTC",
                "name": "Bitcoin",
                "tone": "bitcoin",
                "officialWebsite": "https://bitcoin.org",
                "currentPrice": 70000 if currency == "gbp" else 90000,
                "change24h": 2.3,
                "change7d": 5.6,
                "marketCap": 1_300_000_000_000,
                "totalVolume": 38_000_000_000,
                "high24h": 71000,
                "low24h": 68000,
                "lastUpdatedAt": "2026-04-02T08:00:00.000Z",
            }
        ],
        "chartSeries": [
            {
                "coinId": "bitcoin",
                "symbol": "BTC",
                "name": "Bitcoin",
                "tone": "bitcoin",
                "points": [
                    {"timestamp": "2026-04-02T00:00:00.000Z", "price": 100, "relativeChange": 0},
                    {"timestamp": "2026-04-02T06:00:00.000Z", "price": 108, "relativeChange": 8},
                ],
            }
        ],
        "lastSuccessfulSyncAt": "2026-04-02T08:00:00.000Z",
        "isStale": False,
        "staleReason": None,
    }


def sample_market_entries(currency: str) -> list[dict]:
    # Mirror the minimal CoinGecko fields the service depends on instead of mocking the entire upstream schema.
    base_price = 70_000 if currency == "gbp" else 90_000
    sparkline = [base_price + step * 100 for step in range(30)]

    return [
        {
            "id": "bitcoin",
            "current_price": base_price,
            "price_change_percentage_24h": 2.3,
            "price_change_percentage_7d_in_currency": 5.6,
            "market_cap": 1_300_000_000_000,
            "total_volume": 38_000_000_000,
            "high_24h": base_price + 1_000,
            "low_24h": base_price - 1_000,
            "last_updated": "2026-04-02T08:00:00.000Z",
            "sparkline_in_7d": {"price": sparkline},
        },
        {
            "id": "ethereum",
            "current_price": 2_800,
            "price_change_percentage_24h": -1.2,
            "price_change_percentage_7d_in_currency": 1.5,
            "market_cap": 340_000_000_000,
            "total_volume": 18_000_000_000,
            "high_24h": 2_890,
            "low_24h": 2_720,
            "last_updated": "2026-04-02T08:00:00.000Z",
            "sparkline_in_7d": {"price": [2_700 + step * 5 for step in range(30)]},
        },
        {
            "id": "solana",
            "current_price": 120,
            "price_change_percentage_24h": 6.4,
            "price_change_percentage_7d_in_currency": 12.2,
            "market_cap": 60_000_000_000,
            "total_volume": 4_000_000_000,
            "high_24h": 124,
            "low_24h": 110,
            "last_updated": "2026-04-02T08:00:00.000Z",
            "sparkline_in_7d": {"price": [100 + step for step in range(30)]},
        },
        {
            "id": "ripple",
            "current_price": 0.48,
            "price_change_percentage_24h": 0.2,
            "price_change_percentage_7d_in_currency": -2.1,
            "market_cap": 28_000_000_000,
            "total_volume": 2_000_000_000,
            "high_24h": 0.5,
            "low_24h": 0.46,
            "last_updated": "2026-04-02T08:00:00.000Z",
            "sparkline_in_7d": {"price": [0.45 + step * 0.001 for step in range(30)]},
        },
    ]


class CryptoDashboardServiceTests(TestCase):
    def setUp(self):
        # The service cache is module-global, so each test must start from a known-empty state.
        clear_market_cache()

    def tearDown(self):
        clear_market_cache()

    @patch("market.services._build_dashboard_payload")
    def test_reuses_recent_cache_without_hitting_upstream_again(self, mock_build_dashboard_payload):
        mock_build_dashboard_payload.return_value = sample_dashboard("gbp")

        first = get_crypto_dashboard("gbp")
        second = get_crypto_dashboard("gbp")

        self.assertEqual(mock_build_dashboard_payload.call_count, 1)
        self.assertFalse(first["isStale"])
        self.assertFalse(second["isStale"])
        self.assertEqual(second["assets"][0]["currentPrice"], 70000)

    @patch("market.services._build_dashboard_payload")
    def test_force_refresh_bypasses_recent_cache(self, mock_build_dashboard_payload):
        # Manual refresh should still attempt a live fetch immediately when the provider is healthy.
        mock_build_dashboard_payload.side_effect = [
            sample_dashboard("gbp"),
            {
                **sample_dashboard("gbp"),
                "assets": [
                    {
                        **sample_dashboard("gbp")["assets"][0],
                        "currentPrice": 70500,
                    }
                ],
            },
        ]

        first = get_crypto_dashboard("gbp")
        second = get_crypto_dashboard("gbp", force_refresh=True)

        self.assertEqual(mock_build_dashboard_payload.call_count, 2)
        self.assertEqual(first["assets"][0]["currentPrice"], 70000)
        self.assertEqual(second["assets"][0]["currentPrice"], 70500)

    @patch.object(services, "REFRESH_CACHE_TTL_SECONDS", 0)
    @patch("market.services._build_dashboard_payload")
    def test_returns_stale_cache_when_refresh_fails(self, mock_build_dashboard_payload):
        # First call seeds the cache, second call simulates an upstream outage during the next refresh.
        mock_build_dashboard_payload.side_effect = [
            sample_dashboard("gbp"),
            MarketDataUnavailable("upstream down"),
        ]

        fresh = get_crypto_dashboard("gbp")
        stale = get_crypto_dashboard("gbp")

        self.assertFalse(fresh["isStale"])
        self.assertTrue(stale["isStale"])
        self.assertEqual(stale["staleReason"], services.STALE_WARNING_MESSAGE)
        self.assertEqual(stale["assets"][0]["currentPrice"], 70000)

    @patch("market.services._build_dashboard_payload")
    def test_manual_refresh_reuses_cache_during_failure_backoff(self, mock_build_dashboard_payload):
        # Repeated manual retries should not keep hammering the provider once the previous live refresh already failed.
        mock_build_dashboard_payload.side_effect = [
            sample_dashboard("gbp"),
            MarketDataUnavailable("upstream down"),
        ]

        first = get_crypto_dashboard("gbp")
        stale = get_crypto_dashboard("gbp", force_refresh=True)
        # The next retry lands inside the cooldown window, so the service should reuse the cached snapshot without warning.
        reused = get_crypto_dashboard("gbp", force_refresh=True)

        self.assertFalse(first["isStale"])
        self.assertTrue(stale["isStale"])
        self.assertFalse(reused["isStale"])
        self.assertIsNone(reused["staleReason"])
        self.assertEqual(mock_build_dashboard_payload.call_count, 2)

    @patch("market.services._request_json")
    def test_builds_assets_and_chart_series_from_single_markets_request(self, mock_request_json):
        mock_request_json.return_value = sample_market_entries("usd")

        payload = services._build_dashboard_payload("usd")

        self.assertEqual(mock_request_json.call_count, 1)
        self.assertEqual(len(payload["assets"]), 4)
        self.assertEqual(len(payload["chartSeries"]), 4)
        self.assertGreaterEqual(len(payload["chartSeries"][0]["points"]), 2)
        self.assertIsNotNone(payload["lastSuccessfulSyncAt"])


class CryptoDashboardApiTests(TestCase):
    def setUp(self):
        clear_market_cache()
        # API tests hit the DRF view layer directly, so a lightweight unauthenticated client is enough.
        self.client = APIClient()

    def tearDown(self):
        clear_market_cache()

    def test_rejects_unknown_currency(self):
        response = self.client.get("/api/market/crypto-dashboard", {"currency": "eur"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Unsupported currency. Use gbp or usd.")

    @patch("market.views.get_crypto_dashboard")
    def test_returns_gateway_error_when_upstream_is_unavailable_without_cache(self, mock_get_crypto_dashboard):
        mock_get_crypto_dashboard.side_effect = MarketDataUnavailable("upstream down")

        response = self.client.get("/api/market/crypto-dashboard", {"currency": "gbp"})

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], "Unable to load live crypto market data right now.")

    @patch("market.views.get_crypto_dashboard")
    def test_passes_force_refresh_flag_to_service(self, mock_get_crypto_dashboard):
        # The API layer should translate the query-string override directly into the service-level cache bypass flag.
        mock_get_crypto_dashboard.return_value = sample_dashboard("gbp")

        response = self.client.get("/api/market/crypto-dashboard", {"currency": "gbp", "force": "1"})

        self.assertEqual(response.status_code, 200)
        mock_get_crypto_dashboard.assert_called_once_with("gbp", force_refresh=True)
