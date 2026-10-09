import logging

from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import permissions, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView

from config.locale import resolve_request_locale
from .serializers import AuthUserSerializer, LoginSerializer, RegisterSerializer
from .services import create_user_account, merge_guest_data
from quizzes.content_sync import maybe_sync_quiz_catalog

logger = logging.getLogger(__name__)


@api_view(["GET"])
@authentication_classes([])
@permission_classes([permissions.AllowAny])
@ensure_csrf_cookie
def csrf_view(request):
    # Return the token in the body as a convenience, but the real contract is setting the csrf cookie for later POSTs.
    return Response({"csrfToken": get_token(request)})


class RegisterAPIView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # Validate first so account creation and guest-data merge only run on a coherent payload.
        serializer = RegisterSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        user = create_user_account(
            email=payload["email"],
            password=payload["password"],
            display_name=payload["display_name"]
        )
        # Log the user in immediately so the SPA can switch into session-backed mode without a second request.
        login(request, user)
        # Merge any browser-local guest work right after login while the guest id is still on the request.
        merge_guest_data(user=user, guest_id=payload.get("guest_id"))
        try:
            # Warm the shared quiz catalog opportunistically so newly registered users land on fresh learning content.
            maybe_sync_quiz_catalog()
        except Exception:
            logger.exception("Quiz catalog sync failed after registration.")
        return Response({"user": AuthUserSerializer(user).data}, status=status.HTTP_201_CREATED)


class LoginAPIView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        locale = resolve_request_locale(request)
        # Login validation normalizes email casing before hitting Django auth.
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        user = authenticate(request, username=payload["email"], password=payload["password"])
        if user is None:
            return Response(
                {"detail": "邮箱或密码不正确。" if locale == "zh-CN" else "Invalid email or password."},
                status=status.HTTP_400_BAD_REQUEST
            )

        login(request, user)
        # Adopt anonymous chat/quiz work into the now-authenticated account as part of the same request.
        merge_guest_data(user=user, guest_id=payload.get("guest_id"))
        try:
            # Login is another cheap synchronization hook that avoids dedicated background workers for catalog freshness.
            maybe_sync_quiz_catalog()
        except Exception:
            logger.exception("Quiz catalog sync failed after login.")
        return Response({"user": AuthUserSerializer(user).data}, status=status.HTTP_200_OK)


class LogoutAPIView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # Logout is idempotent from the frontend's perspective, so a missing/expired session still clears the browser state.
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeAPIView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        # Return 200 for both guest and signed-in users so the SPA can branch without special-case error handling.
        if not request.user.is_authenticated:
            return Response({"authenticated": False, "user": None}, status=status.HTTP_200_OK)

        return Response(
            {"authenticated": True, "user": AuthUserSerializer(request.user).data},
            status=status.HTTP_200_OK
        )
