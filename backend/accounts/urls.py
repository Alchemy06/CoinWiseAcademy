from django.urls import path

from .views import LoginAPIView, LogoutAPIView, MeAPIView, RegisterAPIView, csrf_view

# Expose both slash and non-slash variants so frontend fetch helpers do not depend on one exact URL style.
urlpatterns = [
    path("auth/csrf/", csrf_view, name="auth-csrf"),
    path("auth/register", RegisterAPIView.as_view(), name="auth-register"),
    path("auth/register/", RegisterAPIView.as_view(), name="auth-register-trailing"),
    path("auth/login", LoginAPIView.as_view(), name="auth-login"),
    path("auth/login/", LoginAPIView.as_view(), name="auth-login-trailing"),
    path("auth/logout", LogoutAPIView.as_view(), name="auth-logout"),
    path("auth/logout/", LogoutAPIView.as_view(), name="auth-logout-trailing"),
    path("auth/me", MeAPIView.as_view(), name="auth-me"),
    path("auth/me/", MeAPIView.as_view(), name="auth-me-trailing"),
]
