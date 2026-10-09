from django.contrib.auth import get_user_model
from rest_framework import serializers

from config.locale import resolve_request_locale
from .models import Profile

User = get_user_model()


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ["display_name", "email_verified"]


class AuthUserSerializer(serializers.ModelSerializer):
    # Nest the profile so the frontend can render the header badge without a second "me/profile" request.
    profile = ProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "profile"]


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(min_length=8, trim_whitespace=False)
    confirm_password = serializers.CharField(min_length=8, trim_whitespace=False)
    display_name = serializers.CharField(max_length=150)
    # guest_id is optional because browser-local chat/quiz activity may need to be adopted at registration time.
    guest_id = serializers.CharField(required=False, allow_blank=True)

    def validate_email(self, value: str) -> str:
        # Normalize early so login and registration both treat email case consistently.
        normalized = value.strip().lower()
        if User.objects.filter(username=normalized).exists():
            request = self.context.get("request")
            locale = resolve_request_locale(request) if request is not None else "en-GB"
            raise serializers.ValidationError(
                "该邮箱已存在对应账户。" if locale == "zh-CN" else "An account with this email already exists."
            )
        return normalized

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        # Keep password confirmation here so the view only sees already-coherent account payloads.
        if attrs["password"] != attrs["confirm_password"]:
            request = self.context.get("request")
            locale = resolve_request_locale(request) if request is not None else "en-GB"
            raise serializers.ValidationError(
                {"confirm_password": "两次输入的密码不一致。" if locale == "zh-CN" else "Passwords do not match."}
            )
        return attrs


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False)
    # Login also accepts guest_id so the same merge path works for both auth entry points.
    guest_id = serializers.CharField(required=False, allow_blank=True)

    def validate_email(self, value: str) -> str:
        return value.strip().lower()
