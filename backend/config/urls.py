from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    # Auth endpoints share the /api prefix with the rest of the SPA-facing backend surface.
    path("api/", include("accounts.urls")),
    path("api/", include("chat.urls")),
    # Market routes stay under the same SPA-facing prefix so frontend data fetching can reuse the shared API base.
    path("api/", include("market.urls")),
    path("api/", include("quizzes.urls")),
    path("api/", include("predictions.urls")),
    path("api/", include("covid_crash.urls")),
    path("api/", include("market_replay.urls")),
    path("api/", include("mock_trading.urls")),
    path("api/dictionary/", include("dictionary.urls")),  # TODO: Fix import error
]
