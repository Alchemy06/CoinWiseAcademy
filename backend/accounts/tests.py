from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from django.test.utils import override_settings
from rest_framework.test import APIClient

from chat.models import Conversation
from quizzes.models import Lesson, Option, Question, Quiz, QuizAttempt


class AuthApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def test_register_logs_user_in_and_returns_me_payload(self) -> None:
        # Registration should establish the session immediately so the frontend can call /me without an extra login step.
        response = self.client.post(
            "/api/auth/register",
            {
                "email": "alice@example.com",
                "password": "strong-pass-123",
                "confirm_password": "strong-pass-123",
                "display_name": "Alice"
            },
            format="json"
        )

        self.assertEqual(response.status_code, 201)
        me_response = self.client.get("/api/auth/me")
        self.assertEqual(me_response.status_code, 200)
        self.assertTrue(me_response.json()["authenticated"])
        self.assertEqual(me_response.json()["user"]["email"], "alice@example.com")

    def test_login_merges_guest_chat_and_quiz_data(self) -> None:
        # Logging in with a guest id should adopt all anonymous progress that used the same browser-local identity.
        user = User.objects.create_user(
            username="alice@example.com",
            email="alice@example.com",
            password="strong-pass-123"
        )
        user.profile.display_name = "Alice"
        user.profile.save(update_fields=["display_name"])

        lesson = Lesson.objects.create(title="Intro", slug="intro", description="Intro")
        quiz = Quiz.objects.create(lesson=lesson, title="Quiz", description="Quiz")
        question = Question.objects.create(
            quiz=quiz,
            text="What is crypto?",
            question_type=Question.MULTIPLE_CHOICE
        )
        option = Option.objects.create(question=question, text="Digital asset", is_correct=True)
        QuizAttempt.objects.create(user=None, guest_id="guest_123", quiz=quiz, total_score=0)
        Conversation.objects.create(id="session_123", guest_id="guest_123", title="Guest chat", summary="")

        response = self.client.post(
            "/api/auth/login",
            {
                "email": "alice@example.com",
                "password": "strong-pass-123",
                "guest_id": "guest_123"
            },
            format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Conversation.objects.get(id="session_123").user, user)
        self.assertEqual(QuizAttempt.objects.get(guest_id=None, quiz=quiz).user, user)

    @override_settings(QUIZ_CONTENT_API_BASE_URL="https://content.example.test/quiz-catalog")
    @patch("accounts.views.maybe_sync_quiz_catalog", side_effect=RuntimeError("sync failed"))
    def test_login_still_succeeds_when_quiz_sync_fails(self, maybe_sync_quiz_catalog_mock) -> None:
        # Catalog freshness is best-effort only, so auth should not regress into a hard dependency on sync availability.
        user = User.objects.create_user(
            username="bob@example.com",
            email="bob@example.com",
            password="strong-pass-123"
        )
        user.profile.display_name = "Bob"
        user.profile.save(update_fields=["display_name"])

        response = self.client.post(
            "/api/auth/login",
            {
                "email": "bob@example.com",
                "password": "strong-pass-123",
            },
            format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(maybe_sync_quiz_catalog_mock.called)
        self.assertTrue(self.client.get("/api/auth/me").json()["authenticated"])
