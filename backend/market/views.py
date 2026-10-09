from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import MarketDataUnavailable, get_crypto_dashboard


class CryptoDashboardAPIView(APIView):
    # Dashboard data is public, so the page can render without forcing users through auth first.
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        # Normalize query params early so the service only receives lowercase supported currency codes.
        currency = str(request.query_params.get("currency", "gbp")).strip().lower() or "gbp"
        # Manual UI refreshes send an explicit cache-bypass flag, but keep the parser permissive for future clients/tests.
        force_refresh = str(request.query_params.get("force", "")).strip().lower() in {"1", "true", "yes"}

        try:
            payload = get_crypto_dashboard(currency, force_refresh=force_refresh)
        except ValueError:
            # Invalid currencies are client input errors, so keep the response explicit and cache-friendly.
            return Response(
                {"detail": "Unsupported currency. Use gbp or usd."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except MarketDataUnavailable:
            # Upstream outages bubble up as gateway failures once there is no fresh/stale payload to serve.
            return Response(
                {"detail": "Unable to load live crypto market data right now."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(payload, status=status.HTTP_200_OK)
