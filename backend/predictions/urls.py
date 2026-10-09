from django.urls import path

from .views import ChartDataView, LivePriceView, PredictionListCreateView

urlpatterns = [
    path("predictions/", PredictionListCreateView.as_view()),
    path("predictions/live-price/", LivePriceView.as_view()),
    path("predictions/chart/", ChartDataView.as_view(), name="chart-data"),
]
