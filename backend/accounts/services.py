from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction

from chat.models import Conversation
from quizzes.models import QuizAttempt

User = get_user_model()


@transaction.atomic
def create_user_account(*, email: str, password: str, display_name: str) -> User:
    # Store the normalized email as both username and email because the project authenticates by email everywhere.
    user = User.objects.create_user(username=email, email=email, password=password)
    user.profile.display_name = display_name.strip()
    user.profile.save(update_fields=["display_name", "updated_at"])
    return user


@transaction.atomic
def merge_guest_data(*, user: User, guest_id: str | None) -> None:
    # Guest ids come from browser-local state, so trim defensively before using them as a migration key.
    normalized_guest_id = (guest_id or "").strip()
    if not normalized_guest_id:
        return

    # Adopt anonymous chat history into the authenticated account without changing stable conversation ids.
    Conversation.objects.filter(user__isnull=True, guest_id=normalized_guest_id).update(
        user=user,
        guest_id=""
    )
    # Quiz attempts follow the same migration rule so progress made before signup is not orphaned.
    QuizAttempt.objects.filter(user__isnull=True, guest_id=normalized_guest_id).update(
        user=user,
        guest_id=None
    )
