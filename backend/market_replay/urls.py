from django.urls import path
from . import views

urlpatterns = [
    path("market-replay/scenarios/", views.ScenarioListView.as_view()),
    path("market-replay/scenarios/<int:pk>/", views.ScenarioDetailView.as_view()),
    path("market-replay/attempts/start/", views.StartAttemptView.as_view()),
    path("market-replay/attempts/<int:attempt_id>/state/", views.AttemptStateView.as_view()),
    path("market-replay/attempts/<int:attempt_id>/buy/", views.BuyView.as_view()),
    path("market-replay/attempts/<int:attempt_id>/sell/", views.SellView.as_view()),
]
