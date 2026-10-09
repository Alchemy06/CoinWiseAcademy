from django.urls import path
from . import views

app_name = "covid_crash"

urlpatterns = [

    path("covid-crash/scenarios/", views.ScenarioListView.as_view(), name="scenario-list"),

    path("covid-crash/attempts/start/", views.AttemptStartView.as_view(), name="attempt-start"),
    path("covid-crash/attempts/<int:attempt_id>/", views.AttemptDetailView.as_view(), name="attempt-detail"),
    path("covid-crash/attempts/<int:attempt_id>/buy/", views.BuyView.as_view(), name="attempt-buy"),
    path("covid-crash/attempts/<int:attempt_id>/sell/", views.SellView.as_view(), name="attempt-sell"),
    path("covid-crash/attempts/<int:attempt_id>/advance/", views.AdvanceView.as_view(), name="attempt-advance"),

    path("covid-crash/attempts/<int:attempt_id>/move/", views.MoveView.as_view(), name="attempt-move"),

    path("covid-crash/attempts/<int:attempt_id>/select-broker/", views.BrokerSelectView.as_view(), name="attempt-select-broker"),

    path("covid-crash/attempts/<int:attempt_id>/buy-multi/", views.BuyMultiView.as_view(), name="attempt-buy-multi"),
    path("covid-crash/attempts/<int:attempt_id>/sell-multi/", views.SellMultiView.as_view(), name="attempt-sell-multi"),
]
