from django.urls import path
from .views import search_term

urlpatterns = [
    path("<str:term>/", search_term),
]