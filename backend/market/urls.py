from django.urls import path

from .views import CryptoDashboardAPIView

urlpatterns = [
    # Accept both forms so manual browser hits and frontend-generated URLs resolve identically.
    path("market/crypto-dashboard", CryptoDashboardAPIView.as_view(), name="crypto-dashboard"),
    path("market/crypto-dashboard/", CryptoDashboardAPIView.as_view(), name="crypto-dashboard-trailing"),
]
