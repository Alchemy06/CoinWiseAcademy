import json
import tempfile
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from django.test.utils import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from .answer_balance import get_correct_position_counts, rebalance_catalog_payload, rebalance_quiz_questions
from .catalog import (
    CatalogGenerationError,
    CatalogRegenerationLockedError,
    UNIT_SPECS,
    bootstrap_published_catalog_from_static_snapshot,
    build_catalog_payload,
    clean_asciidoc_source,
    clean_markdown_source,
    project_quiz_catalog,
    regenerate_and_publish_catalog,
)
from .content_sync import maybe_sync_quiz_catalog, sync_quiz_catalog, sync_quiz_catalog_payload
from .generation import Competency, GeneratedQuestionDraft, QuizDraft, _compact_option_text, extract_concept_cards, validate_quiz_draft
from .feedback import generate_quiz_feedback
from .models import LearnUnitCompletion, Lesson, Option, PublishedCatalog, Question, QuestionResponse, Quiz, QuizAttempt, QuizCatalogSyncState
from .sanitize import sanitize_display_text, sanitize_markdown_text, sanitize_snapshot_payload


class QuizApiBaseTestCase(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(username="learner@example.com", email="learner@example.com", password="test-password-123")
        # Use one shared lesson tree so progression tests can reason about ordering and unlock state deterministically.
        self.lesson = Lesson.objects.create(
            external_id="lesson-crypto-foundations",
            title="Crypto Foundations",
            slug="crypto-foundations",
            description="Build confidence from the basics upward."
        )

        # Seed one live quiz per stage so the path logic can prove ready, retry, passed, and locked states.
        self.beginner_quiz = self.create_mcq_quiz(
            external_id="quiz-beginner-01",
            title="Beginner Basics",
            description="Start with core crypto concepts.",
            level=Quiz.BEGINNER,
            order_index=1,
            pass_mark=2
        )
        self.intermediate_quiz = self.create_mcq_quiz(
            external_id="quiz-intermediate-01",
            title="Intermediate Signals",
            description="Move into wallets, risk, and on-chain clues.",
            level=Quiz.INTERMEDIATE,
            order_index=2,
            pass_mark=2
        )
        self.advanced_quiz = self.create_mcq_quiz(
            external_id="quiz-advanced-01",
            title="Advanced Market Structure",
            description="Handle more nuanced market judgement.",
            level=Quiz.ADVANCED,
            order_index=3,
            pass_mark=2
        )

        self.hidden_quiz = self.create_mcq_quiz(
            external_id="quiz-hidden-draft",
            title="Hidden Draft",
            description="Should never appear in the path.",
            level=Quiz.ADVANCED,
            order_index=99,
            pass_mark=1,
            is_active=False
        )
        self.unsupported_quiz = Quiz.objects.create(
            lesson=self.lesson,
            title="Written Reflection",
            description="Contains an unsupported short-answer question for now.",
            level=Quiz.INTERMEDIATE,
            order_index=50,
            pass_mark=1,
            is_active=True
        )
        Question.objects.create(
            quiz=self.unsupported_quiz,
            text="Explain how self-custody changes user responsibility.",
            question_type=Question.SHORT_ANSWER,
            marks=2,
            explanation="Users control their keys and must protect them."
        )

    def authenticate(self) -> None:
        # Auth is required for every live quiz endpoint, so tests opt in explicitly when they expect success.
        self.client.force_authenticate(user=self.user)

    def create_mcq_quiz(
        self,
        *,
        external_id: str,
        title: str,
        description: str,
        level: str,
        order_index: int,
        pass_mark: int,
        is_active: bool = True
    ) -> Quiz:
        # Each fixture quiz gets the same two-question shape so score math stays obvious inside assertions.
        quiz = Quiz.objects.create(
            lesson=self.lesson,
            external_id=external_id,
            title=title,
            description=description,
            level=level,
            order_index=order_index,
            pass_mark=pass_mark,
            is_active=is_active
        )

        for index in range(2):
            question = Question.objects.create(
                quiz=quiz,
                text=f"{title} question {index + 1}",
                question_type=Question.MULTIPLE_CHOICE,
                marks=1,
                explanation=f"{title} explanation {index + 1}"
            )
            Option.objects.create(question=question, text=f"{title} correct {index + 1}", is_correct=True)
            Option.objects.create(question=question, text=f"{title} distractor {index + 1}", is_correct=False)

        return quiz

    def publish_quiz_unlock_catalog(self) -> None:
        PublishedCatalog.objects.update_or_create(
            singleton_key=1,
            defaults={
                "version_hash": "quiz-unlock-test",
                "catalog_json": {
                    "generated_at": "2026-04-10T00:00:00+00:00",
                    "tracks": [
                        {
                            "external_id": "track-beginner",
                            "title": "Beginner",
                            "level": Quiz.BEGINNER,
                            "order_index": 1,
                            "units": [
                                {
                                    "external_id": "unit-beginner-01",
                                    "title": "Beginner Lesson",
                                    "level": Quiz.BEGINNER,
                                    "order_index": 1,
                                    "learning": {
                                        "body_markdown": "# Beginner",
                                        "body_text": "Beginner",
                                        "excerpt": "Beginner",
                                        "estimated_minutes": 4,
                                        "is_active": True,
                                    },
                                    "quiz": {
                                        "external_id": self.beginner_quiz.external_id,
                                        "pass_mark": self.beginner_quiz.pass_mark,
                                        "questions": [],
                                    },
                                }
                            ],
                        },
                        {
                            "external_id": "track-intermediate",
                            "title": "Intermediate",
                            "level": Quiz.INTERMEDIATE,
                            "order_index": 2,
                            "units": [
                                {
                                    "external_id": "unit-intermediate-01",
                                    "title": "Intermediate Lesson",
                                    "level": Quiz.INTERMEDIATE,
                                    "order_index": 1,
                                    "learning": {
                                        "body_markdown": "# Intermediate",
                                        "body_text": "Intermediate",
                                        "excerpt": "Intermediate",
                                        "estimated_minutes": 4,
                                        "is_active": True,
                                    },
                                    "quiz": {
                                        "external_id": self.intermediate_quiz.external_id,
                                        "pass_mark": self.intermediate_quiz.pass_mark,
                                        "questions": [],
                                    },
                                }
                            ],
                        },
                        {
                            "external_id": "track-advanced",
                            "title": "Advanced",
                            "level": Quiz.ADVANCED,
                            "order_index": 3,
                            "units": [
                                {
                                    "external_id": "unit-advanced-01",
                                    "title": "Advanced Lesson",
                                    "level": Quiz.ADVANCED,
                                    "order_index": 1,
                                    "learning": {
                                        "body_markdown": "# Advanced",
                                        "body_text": "Advanced",
                                        "excerpt": "Advanced",
                                        "estimated_minutes": 4,
                                        "is_active": True,
                                    },
                                    "quiz": {
                                        "external_id": self.advanced_quiz.external_id,
                                        "pass_mark": self.advanced_quiz.pass_mark,
                                        "questions": [],
                                    },
                                }
                            ],
                        },
                    ],
                },
                "quiz_catalog_json": {},
            },
        )


class QuizAuthProtectionTests(QuizApiBaseTestCase):
    def test_quiz_endpoints_require_authentication(self) -> None:
        endpoints = [
            self.client.get("/api/lessons/"),
            self.client.get("/api/learn-progress/"),
            self.client.post("/api/learn-progress/beginner-01-create-ethereum-account/complete/", {}, format="json"),
            self.client.get("/api/quiz-path/"),
            self.client.get(f"/api/quizzes/{self.beginner_quiz.id}/"),
            self.client.post(
                f"/api/quizzes/{self.beginner_quiz.id}/submit/",
                {"answers": []},
                format="json"
            ),
        ]

        for response in endpoints:
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class LearnProgressApiTests(QuizApiBaseTestCase):
    def setUp(self) -> None:
        super().setUp()
        # Publish a tiny learn catalog fixture so the progress endpoints can validate unit ids against realistic catalog data.
        PublishedCatalog.objects.create(
            singleton_key=1,
            version_hash="learn-progress-test",
            catalog_json={
                "generated_at": "2026-04-10T00:00:00+00:00",
                "tracks": [
                    {
                        "external_id": "track-beginner",
                        "title": "Beginner",
                        "level": Quiz.BEGINNER,
                        "order_index": 1,
                        "units": [
                            {
                                "external_id": "beginner-01-create-ethereum-account",
                                "title": "How to create an Ethereum account",
                                "level": Quiz.BEGINNER,
                                "order_index": 1,
                                "learning": {
                                    "body_markdown": "# Wallet Basics",
                                    "body_text": "Wallet basics",
                                    "excerpt": "Wallet basics",
                                    "estimated_minutes": 4,
                                    "is_active": True,
                                },
                                "quiz": {
                                    "external_id": "beginner-01-create-ethereum-account",
                                    "pass_mark": 1,
                                    "questions": [],
                                },
                            }
                        ],
                    }
                ],
            },
            quiz_catalog_json={},
        )

    def test_learn_progress_lists_only_current_users_completed_units(self) -> None:
        self.authenticate()
        # Seed another user's completion to prove the endpoint scopes rows strictly to the current learner.
        another_user = User.objects.create_user(username="other@example.com", email="other@example.com", password="test-password-123")
        LearnUnitCompletion.objects.create(user=self.user, unit_external_id="beginner-01-create-ethereum-account")
        LearnUnitCompletion.objects.create(user=another_user, unit_external_id="intermediate-01-bridges")

        response = self.client.get("/api/learn-progress/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["completedUnitExternalIds"], ["beginner-01-create-ethereum-account"])

    def test_complete_endpoint_is_idempotent_and_persists_completion(self) -> None:
        self.authenticate()

        # Repeating the same completion should succeed without duplicating rows because the client can retry safely.
        first_response = self.client.post("/api/learn-progress/beginner-01-create-ethereum-account/complete/", {}, format="json")
        second_response = self.client.post("/api/learn-progress/beginner-01-create-ethereum-account/complete/", {}, format="json")

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(LearnUnitCompletion.objects.filter(user=self.user, unit_external_id="beginner-01-create-ethereum-account").count(), 1)
        self.assertEqual(first_response.json()["unitExternalId"], "beginner-01-create-ethereum-account")
        self.assertEqual(second_response.json()["unitExternalId"], "beginner-01-create-ethereum-account")

    def test_complete_endpoint_rejects_unknown_units(self) -> None:
        self.authenticate()

        # Unknown ids should fail closed so arbitrary client strings cannot create detached completion records.
        response = self.client.post("/api/learn-progress/unknown-unit/complete/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.json()["detail"], "Learn unit not found.")


class QuizPathApiTests(QuizApiBaseTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.publish_quiz_unlock_catalog()

    def test_quiz_path_keeps_quizzes_locked_until_their_lessons_are_completed(self) -> None:
        self.authenticate()

        response = self.client.get("/api/quiz-path/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIsNone(data["recommendedQuizId"])
        self.assertEqual(data["totalCount"], 3)

        quizzes = data["quizzes"]
        self.assertEqual([quiz["id"] for quiz in quizzes], [self.beginner_quiz.id, self.intermediate_quiz.id, self.advanced_quiz.id])
        self.assertEqual(quizzes[0]["status"], "locked")
        self.assertTrue(quizzes[0]["isLocked"])
        self.assertEqual(quizzes[1]["status"], "locked")
        self.assertTrue(quizzes[1]["isLocked"])
        self.assertEqual(quizzes[2]["status"], "locked")

    def test_quiz_path_unlocks_each_quiz_from_its_lesson_completion_and_uses_best_historical_score(self) -> None:
        self.authenticate()
        LearnUnitCompletion.objects.create(user=self.user, unit_external_id="unit-beginner-01")
        LearnUnitCompletion.objects.create(user=self.user, unit_external_id="unit-intermediate-01")
        # Mix passing and failing attempts to verify the path still uses best historical score once a lesson unlocks the quiz.
        QuizAttempt.objects.create(
            user=self.user,
            quiz=self.beginner_quiz,
            total_score=2,
            completed_at=timezone.now()
        )
        QuizAttempt.objects.create(
            user=self.user,
            quiz=self.beginner_quiz,
            total_score=1,
            completed_at=timezone.now()
        )
        QuizAttempt.objects.create(
            user=self.user,
            quiz=self.intermediate_quiz,
            total_score=1,
            completed_at=timezone.now()
        )

        response = self.client.get("/api/quiz-path/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        quizzes = data["quizzes"]

        self.assertEqual(quizzes[0]["status"], "passed")
        self.assertEqual(quizzes[0]["bestScore"], 2.0)
        self.assertEqual(quizzes[1]["status"], "retry")
        self.assertEqual(quizzes[1]["bestScore"], 1.0)
        self.assertEqual(quizzes[2]["status"], "locked")
        self.assertEqual(data["recommendedQuizId"], self.intermediate_quiz.id)

    def test_quiz_path_recommends_the_most_recent_failed_quiz(self) -> None:
        self.authenticate()
        LearnUnitCompletion.objects.create(user=self.user, unit_external_id="unit-beginner-01")
        LearnUnitCompletion.objects.create(user=self.user, unit_external_id="unit-intermediate-01")

        QuizAttempt.objects.create(
            user=self.user,
            quiz=self.beginner_quiz,
            total_score=1,
            completed_at=timezone.now()
        )
        latest_attempt = QuizAttempt.objects.create(
            user=self.user,
            quiz=self.intermediate_quiz,
            total_score=1,
            completed_at=timezone.now() + timedelta(minutes=1)
        )

        response = self.client.get("/api/quiz-path/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["recommendedQuizId"], latest_attempt.quiz_id)

    def test_quiz_path_recommends_next_quiz_after_the_most_recent_pass(self) -> None:
        self.authenticate()
        LearnUnitCompletion.objects.create(user=self.user, unit_external_id="unit-beginner-01")
        LearnUnitCompletion.objects.create(user=self.user, unit_external_id="unit-intermediate-01")
        LearnUnitCompletion.objects.create(user=self.user, unit_external_id="unit-advanced-01")

        QuizAttempt.objects.create(
            user=self.user,
            quiz=self.beginner_quiz,
            total_score=1,
            completed_at=timezone.now()
        )
        QuizAttempt.objects.create(
            user=self.user,
            quiz=self.intermediate_quiz,
            total_score=2,
            completed_at=timezone.now() + timedelta(minutes=1)
        )

        response = self.client.get("/api/quiz-path/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["recommendedQuizId"], self.advanced_quiz.id)

    def test_quiz_path_falls_back_to_the_earliest_unresolved_retry_after_the_last_pass(self) -> None:
        self.authenticate()
        LearnUnitCompletion.objects.create(user=self.user, unit_external_id="unit-beginner-01")
        LearnUnitCompletion.objects.create(user=self.user, unit_external_id="unit-intermediate-01")
        LearnUnitCompletion.objects.create(user=self.user, unit_external_id="unit-advanced-01")

        QuizAttempt.objects.create(
            user=self.user,
            quiz=self.beginner_quiz,
            total_score=1,
            completed_at=timezone.now()
        )
        QuizAttempt.objects.create(
            user=self.user,
            quiz=self.advanced_quiz,
            total_score=2,
            completed_at=timezone.now() + timedelta(minutes=1)
        )

        response = self.client.get("/api/quiz-path/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["recommendedQuizId"], self.beginner_quiz.id)

    def test_quiz_path_returns_no_recommendation_when_every_unlocked_quiz_is_passed(self) -> None:
        self.authenticate()
        LearnUnitCompletion.objects.create(user=self.user, unit_external_id="unit-beginner-01")
        LearnUnitCompletion.objects.create(user=self.user, unit_external_id="unit-intermediate-01")
        LearnUnitCompletion.objects.create(user=self.user, unit_external_id="unit-advanced-01")

        QuizAttempt.objects.create(
            user=self.user,
            quiz=self.beginner_quiz,
            total_score=2,
            completed_at=timezone.now()
        )
        QuizAttempt.objects.create(
            user=self.user,
            quiz=self.intermediate_quiz,
            total_score=2,
            completed_at=timezone.now() + timedelta(minutes=1)
        )
        QuizAttempt.objects.create(
            user=self.user,
            quiz=self.advanced_quiz,
            total_score=2,
            completed_at=timezone.now() + timedelta(minutes=2)
        )

        response = self.client.get("/api/quiz-path/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIsNone(data["recommendedQuizId"])


class QuizDetailApiTests(QuizApiBaseTestCase):
    def test_quiz_detail_exposes_option_correctness_flags(self) -> None:
        self.authenticate()

        inactive_question = Question.objects.create(
            quiz=self.beginner_quiz,
            text="Inactive question",
            question_type=Question.MULTIPLE_CHOICE,
            marks=1,
            explanation="Should not leak into the detail payload.",
            is_active=False
        )
        Option.objects.create(question=inactive_question, text="Inactive correct", is_correct=True)
        Option.objects.create(question=inactive_question, text="Inactive wrong", is_correct=False)
        first_question = self.beginner_quiz.questions.order_by("id").first()
        Option.objects.create(question=first_question, text="Inactive distractor", is_correct=False, is_active=False)

        response = self.client.get(f"/api/quizzes/{self.beginner_quiz.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(len(body["questions"]), 2)
        first_question_options = body["questions"][0]["options"]

        self.assertEqual(len(first_question_options), 2)
        self.assertTrue(any(option["is_correct"] for option in first_question_options))
        self.assertTrue(any(not option["is_correct"] for option in first_question_options))

    def test_quiz_detail_sanitizes_dirty_question_and_option_text(self) -> None:
        self.authenticate()

        question = self.beginner_quiz.questions.order_by("id").first()
        question.text = '<Card Faster Transfers description="International wire transfers take several days to process."'
        question.explanation = 'MetaMask Card: : : Wallet stays in MetaMask; auto off-ramp at payment'
        question.save(update_fields=["text", "explanation"])

        dirty_option = question.options.filter(is_correct=False).first()
        dirty_option.text = "| MetaMask Card | ✅ | ✅ | Wallet stays in MetaMask; auto off-ramp at payment |"
        dirty_option.save(update_fields=["text"])

        response = self.client.get(f"/api/quizzes/{self.beginner_quiz.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        first_question = response.json()["questions"][0]
        self.assertEqual(
            first_question["text"],
            "Faster Transfers: International wire transfers take several days to process.",
        )
        self.assertEqual(
            first_question["explanation"],
            "MetaMask Card: Wallet stays in MetaMask; auto off-ramp at payment",
        )
        self.assertIn(
            "MetaMask Card: Wallet stays in MetaMask; auto off-ramp at payment",
            [option["text"] for option in first_question["options"]],
        )


class SubmitQuizApiTests(QuizApiBaseTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.publish_quiz_unlock_catalog()

    def test_submit_returns_next_quiz_when_the_next_lesson_is_already_completed(self) -> None:
        self.authenticate()
        LearnUnitCompletion.objects.create(user=self.user, unit_external_id="unit-intermediate-01")
        questions = list(self.beginner_quiz.questions.all())
        # Pull the real correct options from fixtures so the test stays aligned with any future wording changes.
        correct_options = [question.options.get(is_correct=True) for question in questions]

        response = self.client.post(
            f"/api/quizzes/{self.beginner_quiz.id}/submit/",
            {
                "answers": [
                    {"question_id": questions[0].id, "selected_option_id": correct_options[0].id},
                    {"question_id": questions[1].id, "selected_option_id": correct_options[1].id},
                ]
            },
            format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(body["total_score"], 2.0)
        self.assertEqual(body["maxScore"], 2)
        self.assertEqual(body["passScore"], 2)
        self.assertTrue(body["passed"])
        self.assertEqual(body["correctCount"], 2)
        self.assertEqual(body["questionCount"], 2)
        self.assertNotIn("nextQuizUnlocked", body)
        self.assertNotIn("nextQuizId", body)
        self.assertEqual(len(body["results"]), 2)
        self.assertTrue(all(result["isCorrect"] for result in body["results"]))

    def test_submit_response_omits_next_quiz_metadata_when_future_lessons_are_locked(self) -> None:
        self.authenticate()
        questions = list(self.beginner_quiz.questions.all())
        correct_options = [question.options.get(is_correct=True) for question in questions]

        response = self.client.post(
            f"/api/quizzes/{self.beginner_quiz.id}/submit/",
            {
                "answers": [
                    {"question_id": questions[0].id, "selected_option_id": correct_options[0].id},
                    {"question_id": questions[1].id, "selected_option_id": correct_options[1].id},
                ]
            },
            format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(body["total_score"], 2.0)
        self.assertTrue(body["passed"])
        self.assertNotIn("nextQuizUnlocked", body)
        self.assertNotIn("nextQuizId", body)

    def test_submit_response_omits_next_quiz_metadata_even_when_future_lessons_are_unlocked(self) -> None:
        self.authenticate()
        LearnUnitCompletion.objects.create(user=self.user, unit_external_id="unit-intermediate-01")
        questions = list(self.beginner_quiz.questions.all())
        correct_option = questions[0].options.get(is_correct=True)
        wrong_option = questions[1].options.get(is_correct=False)

        response = self.client.post(
            f"/api/quizzes/{self.beginner_quiz.id}/submit/",
            {
                "answers": [
                    {"question_id": questions[0].id, "selected_option_id": correct_option.id},
                    {"question_id": questions[1].id, "selected_option_id": wrong_option.id},
                ]
            },
            format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(body["total_score"], 1.0)
        self.assertFalse(body["passed"])
        self.assertNotIn("nextQuizUnlocked", body)
        self.assertNotIn("nextQuizId", body)

    def test_submit_grades_using_option_ids_after_option_slots_are_rewritten(self) -> None:
        self.authenticate()
        questions = list(self.beginner_quiz.questions.all())
        first_question_options = list(questions[0].options.order_by("id"))
        first_question_options[0].text = "Outdated slot content"
        first_question_options[0].is_correct = False
        first_question_options[0].save(update_fields=["text", "is_correct"])
        first_question_options[1].text = "Rebalanced correct answer"
        first_question_options[1].is_correct = True
        first_question_options[1].save(update_fields=["text", "is_correct"])

        response = self.client.post(
            f"/api/quizzes/{self.beginner_quiz.id}/submit/",
            {
                "answers": [
                    {"question_id": questions[0].id, "selected_option_id": first_question_options[1].id},
                    {"question_id": questions[1].id, "selected_option_id": questions[1].options.get(is_correct=True).id},
                ]
            },
            format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(body["total_score"], 2.0)
        self.assertTrue(body["passed"])
        self.assertTrue(body["results"][0]["isCorrect"])
        self.assertEqual(body["results"][0]["selectedOptionId"], first_question_options[1].id)


class QuizFeedbackApiTests(QuizApiBaseTestCase):
    def setUp(self) -> None:
        super().setUp()
        # Reuse one mixed-score attempt across API tests so ownership and quiz-matching branches share the same fixture shape.
        self.questions = list(self.beginner_quiz.questions.order_by("id"))
        self.attempt = QuizAttempt.objects.create(
            user=self.user,
            quiz=self.beginner_quiz,
            total_score=1,
            completed_at=timezone.now()
        )
        QuestionResponse.objects.create(
            attempt=self.attempt,
            question=self.questions[0],
            selected_option=self.questions[0].options.get(is_correct=True),
            is_correct=True,
            score_awarded=1
        )
        QuestionResponse.objects.create(
            attempt=self.attempt,
            question=self.questions[1],
            selected_option=self.questions[1].options.get(is_correct=False),
            is_correct=False,
            score_awarded=0
        )

    def test_feedback_endpoint_requires_authentication(self) -> None:
        response = self.client.post(
            f"/api/quizzes/{self.beginner_quiz.id}/feedback/",
            {"attempt_id": self.attempt.id},
            format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_feedback_endpoint_rejects_attempt_owned_by_another_user(self) -> None:
        other_user = User.objects.create_user(username="other@example.com", email="other@example.com", password="test-password-123")
        self.authenticate()
        self.attempt.user = other_user
        self.attempt.save(update_fields=["user"])

        response = self.client.post(
            f"/api/quizzes/{self.beginner_quiz.id}/feedback/",
            {"attempt_id": self.attempt.id},
            format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_feedback_endpoint_rejects_attempt_for_different_quiz(self) -> None:
        self.authenticate()

        response = self.client.post(
            f"/api/quizzes/{self.intermediate_quiz.id}/feedback/",
            {"attempt_id": self.attempt.id},
            format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_feedback_endpoint_returns_feedback_text(self) -> None:
        self.authenticate()

        with (
            patch("quizzes.api_views.has_quiz_feedback_api_key", return_value=True),
            patch("quizzes.api_views.generate_quiz_feedback", return_value="Your result is **1/2**.")
        ):
            response = self.client.post(
                f"/api/quizzes/{self.beginner_quiz.id}/feedback/",
                {"attempt_id": self.attempt.id},
                format="json"
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["feedback"], "Your result is **1/2**.")

    def test_feedback_endpoint_surfaces_generation_errors(self) -> None:
        self.authenticate()

        with (
            patch("quizzes.api_views.has_quiz_feedback_api_key", return_value=True),
            patch("quizzes.api_views.generate_quiz_feedback", side_effect=RuntimeError("model unavailable"))
        ):
            response = self.client.post(
                f"/api/quizzes/{self.beginner_quiz.id}/feedback/",
                {"attempt_id": self.attempt.id},
                format="json"
            )

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertIn("model unavailable", response.json()["detail"])


class QuizFeedbackServiceTests(QuizApiBaseTestCase):
    def test_generate_quiz_feedback_sends_attempt_context_to_openai(self) -> None:
        # Build one correct and one incorrect response so the prompt must include both score context and remediation detail.
        attempt = QuizAttempt.objects.create(
            user=self.user,
            quiz=self.beginner_quiz,
            total_score=1,
            completed_at=timezone.now()
        )
        first_question, second_question = list(self.beginner_quiz.questions.order_by("id"))
        QuestionResponse.objects.create(
            attempt=attempt,
            question=first_question,
            selected_option=first_question.options.get(is_correct=True),
            is_correct=True,
            score_awarded=1
        )
        QuestionResponse.objects.create(
            attempt=attempt,
            question=second_question,
            selected_option=second_question.options.get(is_correct=False),
            is_correct=False,
            score_awarded=0
        )

        with (
            patch("quizzes.feedback.OpenAI") as openai_mock,
            patch("quizzes.feedback.has_quiz_feedback_api_key", return_value=True),
            patch("quizzes.feedback.load_quiz_feedback_prompt_text", return_value="You are a quiz feedback assistant.")
        ):
            create_mock = openai_mock.return_value.responses.create
            create_mock.return_value = SimpleNamespace(output_text="Your result is **1/2**.")
            feedback = generate_quiz_feedback(
                QuizAttempt.objects.select_related("quiz").prefetch_related(
                    "responses__selected_option",
                    "quiz__questions__options",
                ).get(id=attempt.id)
            )

        request = create_mock.call_args.kwargs
        # Assert against the serialized prompt body so regressions in context assembly show up before model behavior changes do.
        self.assertEqual(request["instructions"], "You are a quiz feedback assistant.")
        self.assertIn("Score: 1/2", request["input"])
        self.assertIn("Questions answered incorrectly or left unanswered:", request["input"])
        self.assertIn(f"Question 2: {second_question.text}", request["input"])
        self.assertIn(f"Learner answer: {second_question.options.get(is_correct=False).text}", request["input"])
        self.assertIn(f"Correct answer: {second_question.options.get(is_correct=True).text}", request["input"])
        self.assertIn(f"Explanation: {second_question.explanation}", request["input"])
        self.assertIn("Your result is **1/2**.", feedback)
        self.assertIn("## Question review", feedback)
        self.assertIn("### 2. Beginner Basics question 2", feedback)
        self.assertIn("Your answer: Beginner Basics distractor 2 ❌", feedback)

    def test_generate_quiz_feedback_uses_only_the_correct_explanation_segment(self) -> None:
        # Imported explanations can bundle correct and wrong-answer notes together; feedback should expose only the teaching point.
        attempt = QuizAttempt.objects.create(
            user=self.user,
            quiz=self.beginner_quiz,
            total_score=0,
            completed_at=timezone.now()
        )
        question = self.beginner_quiz.questions.order_by("id").first()
        question.explanation = (
            "Correct: WETH exists to make ETH usable in ERC-20 apps. "
            "Wrong: WETH does not replace native ETH. "
            "Wrong: WETH cannot pay gas."
        )
        question.save(update_fields=["explanation"])
        QuestionResponse.objects.create(
            attempt=attempt,
            question=question,
            selected_option=question.options.get(is_correct=False),
            is_correct=False,
            score_awarded=0
        )

        with (
            patch("quizzes.feedback.OpenAI") as openai_mock,
            patch("quizzes.feedback.has_quiz_feedback_api_key", return_value=True),
            patch("quizzes.feedback.load_quiz_feedback_prompt_text", return_value="You are a quiz feedback assistant.")
        ):
            create_mock = openai_mock.return_value.responses.create
            create_mock.return_value = SimpleNamespace(
                output_text="## Weak points to reinforce\n- Understand the ERC-20 role.\n\n## Quick memory cues\n- WETH is ERC-20 ETH."
            )
            feedback = generate_quiz_feedback(
                QuizAttempt.objects.select_related("quiz").prefetch_related(
                    "responses__selected_option",
                    "quiz__questions__options",
                ).get(id=attempt.id)
            )

        self.assertIn("Explanation: WETH exists to make ETH usable in ERC-20 apps.", feedback)
        self.assertNotIn("Wrong: WETH does not replace native ETH.", feedback)

    def test_generate_quiz_feedback_falls_back_when_model_output_is_truncated(self) -> None:
        # Simulate a partial model response to verify the deterministic fallback completes the missing bullet section.
        attempt = QuizAttempt.objects.create(
            user=self.user,
            quiz=self.beginner_quiz,
            total_score=0,
            completed_at=timezone.now()
        )
        question = self.beginner_quiz.questions.order_by("id").first()
        QuestionResponse.objects.create(
            attempt=attempt,
            question=question,
            selected_option=question.options.get(is_correct=False),
            is_correct=False,
            score_awarded=0
        )

        with (
            patch("quizzes.feedback.OpenAI") as openai_mock,
            patch("quizzes.feedback.has_quiz_feedback_api_key", return_value=True),
            patch("quizzes.feedback.load_quiz_feedback_prompt_text", return_value="You are a quiz feedback assistant.")
        ):
            create_mock = openai_mock.return_value.responses.create
            create_mock.return_value = SimpleNamespace(
                output_text="## Weak points to reinforce\n- One point.\n\n## Quick memory cues"
            )
            feedback = generate_quiz_feedback(
                QuizAttempt.objects.select_related("quiz").prefetch_related(
                    "responses__selected_option",
                    "quiz__questions__options",
                ).get(id=attempt.id)
            )

        self.assertIn("## Weak points to reinforce", feedback)
        self.assertIn("## Quick memory cues", feedback)
        self.assertRegex(feedback, r"## Quick memory cues\n- ")


@override_settings(
    QUIZ_CONTENT_API_BASE_URL="https://content.example.test/quiz-catalog",
    QUIZ_CONTENT_SYNC_TTL_SECONDS=3600,
)
class QuizCatalogSyncTests(TestCase):
    def setUp(self) -> None:
        self.catalog = {
            "lessons": [
                {
                    "external_id": "lesson-foundations",
                    "title": "Crypto Foundations",
                    "slug": "crypto-foundations",
                    "description": "Build confidence from the basics upward.",
                    "is_active": True,
                    "quizzes": [
                        {
                            "external_id": "quiz-beginner",
                            "title": "Beginner Basics",
                            "description": "Start with core crypto concepts.",
                            "level": Quiz.BEGINNER,
                            "order_index": 1,
                            "pass_mark": 2,
                            "is_active": True,
                            "questions": [
                                {
                                    "external_id": "question-1",
                                    "text": "What is a blockchain?",
                                    "question_type": Question.MULTIPLE_CHOICE,
                                    "marks": 1,
                                    "explanation": "A distributed ledger.",
                                    "is_active": True,
                                    "options": [
                                        {
                                            "external_id": "option-1a",
                                            "text": "A distributed ledger.",
                                            "is_correct": True,
                                            "is_active": True,
                                        },
                                        {
                                            "external_id": "option-1b",
                                            "text": "A guaranteed profit machine.",
                                            "is_correct": False,
                                            "is_active": True,
                                        },
                                    ],
                                },
                                {
                                    "external_id": "question-2",
                                    "text": "What should a beginner protect first?",
                                    "question_type": Question.MULTIPLE_CHOICE,
                                    "marks": 1,
                                    "explanation": "Protect seed phrases.",
                                    "is_active": True,
                                    "options": [
                                        {
                                            "external_id": "option-2a",
                                            "text": "Their seed phrase.",
                                            "is_correct": True,
                                            "is_active": True,
                                        },
                                        {
                                            "external_id": "option-2b",
                                            "text": "A screenshot of gains.",
                                            "is_correct": False,
                                            "is_active": True,
                                        },
                                    ],
                                },
                            ],
                        }
                    ],
                }
            ]
        }

    @patch("quizzes.content_sync.fetch_quiz_catalog")
    def test_sync_quiz_catalog_creates_snapshot_and_deactivates_legacy_rows(self, fetch_quiz_catalog_mock) -> None:
        legacy_lesson = Lesson.objects.create(title="Legacy Lesson", slug="legacy-lesson", description="Legacy")
        legacy_quiz = Quiz.objects.create(lesson=legacy_lesson, title="Legacy Quiz", description="Legacy", is_active=True)
        legacy_question = Question.objects.create(
            quiz=legacy_quiz,
            text="Legacy question",
            question_type=Question.MULTIPLE_CHOICE,
            marks=1,
            explanation="Legacy explanation",
        )
        Option.objects.create(question=legacy_question, text="Legacy correct", is_correct=True)
        Option.objects.create(question=legacy_question, text="Legacy wrong", is_correct=False)
        fetch_quiz_catalog_mock.return_value = self.catalog

        result = sync_quiz_catalog(force=True)

        self.assertTrue(result)
        synced_quiz = Quiz.objects.get(external_id="quiz-beginner")
        self.assertEqual(synced_quiz.lesson.external_id, "lesson-foundations")
        self.assertEqual(synced_quiz.questions.filter(is_active=True).count(), 2)
        self.assertEqual(Option.objects.filter(question__external_id="question-1", is_active=True).count(), 2)
        legacy_lesson.refresh_from_db()
        legacy_quiz.refresh_from_db()
        legacy_question.refresh_from_db()
        self.assertFalse(legacy_lesson.is_active)
        self.assertFalse(legacy_quiz.is_active)
        self.assertFalse(legacy_question.is_active)
        self.assertEqual(QuizCatalogSyncState.objects.count(), 1)
        self.assertTrue(QuizCatalogSyncState.objects.get().last_payload_hash)

    @patch("quizzes.content_sync.fetch_quiz_catalog")
    def test_maybe_sync_quiz_catalog_skips_refreshes_inside_ttl(self, fetch_quiz_catalog_mock) -> None:
        fetch_quiz_catalog_mock.return_value = self.catalog

        first_result = maybe_sync_quiz_catalog()
        second_result = maybe_sync_quiz_catalog()

        self.assertTrue(first_result)
        self.assertFalse(second_result)
        self.assertEqual(fetch_quiz_catalog_mock.call_count, 1)

    @patch("quizzes.content_sync.fetch_quiz_catalog")
    def test_sync_quiz_catalog_soft_deactivates_content_removed_from_upstream(self, fetch_quiz_catalog_mock) -> None:
        fetch_quiz_catalog_mock.return_value = self.catalog
        sync_quiz_catalog(force=True)

        reduced_catalog = {
            "lessons": [
                {
                    **self.catalog["lessons"][0],
                    "quizzes": [],
                }
            ]
        }
        fetch_quiz_catalog_mock.return_value = reduced_catalog

        sync_quiz_catalog(force=True)

        self.assertFalse(Quiz.objects.get(external_id="quiz-beginner").is_active)
        self.assertFalse(Question.objects.get(external_id="question-1").is_active)
        self.assertFalse(Option.objects.get(external_id="option-1a").is_active)


def _build_stub_source(spec) -> tuple[dict[str, str], str]:
    title = spec.external_id.replace("-", " ").title()
    source = {
        "provider": "github",
        "repo": f"{spec.owner}/{spec.repo}",
        "ref": spec.ref,
        "path": spec.path,
        "download_url": f"https://example.test/{spec.external_id}",
        "source_url": f"https://example.test/html/{spec.external_id}",
        "license": spec.license,
    }

    sentences = [
        f"{title} explains the main concept with enough detail for structured quiz generation and learning reuse.",
        f"{title} also describes how the mechanism works in practice and why each step matters to the learner.",
        f"{title} highlights a common operational risk and tells learners to verify the relevant context before acting.",
        f"{title} shows how participants can apply the topic carefully instead of assuming outcomes without evidence.",
        f"{title} connects the topic to broader crypto literacy so future learning and quizzes stay aligned on one source.",
        f"{title} makes it clear that users should understand the workflow instead of delegating all judgment to a central actor.",
        f"{title} includes scenario guidance that can be turned into multiple-choice questions with explicit explanations.",
        f"{title} distinguishes supported claims from misconceptions so the final quiz can test understanding, not memorization alone.",
    ]
    body = " ".join(sentences)

    if spec.path.endswith(".adoc"):
        raw_text = "\n\n".join(
            [
                f"== {title}",
                *sentences,
            ]
        )
    else:
        raw_text = "\n".join(
            [
                "---",
                f"title: {title}",
                "---",
                "",
                f"# {title}",
                "",
                body,
            ]
        )

    return source, raw_text


def _stub_sentences_for_title(title: str) -> list[str]:
    return [
        f"{title} explains the main concept with enough detail for structured quiz generation and learning reuse.",
        f"{title} also describes how the mechanism works in practice and why each step matters to the learner.",
        f"{title} highlights a common operational risk and tells learners to verify the relevant context before acting.",
        f"{title} shows how participants can apply the topic carefully instead of assuming outcomes without evidence.",
        f"{title} connects the topic to broader crypto literacy so future learning and quizzes stay aligned on one source.",
        f"{title} makes it clear that users should understand the workflow instead of delegating all judgment to a central actor.",
        f"{title} includes scenario guidance that can be turned into multiple-choice questions with explicit explanations.",
        f"{title} distinguishes supported claims from misconceptions so the final quiz can test understanding, not memorization alone.",
    ]


def _build_unbalanced_catalog_questions(*, quiz_external_id: str, question_count: int = 10) -> list[dict[str, object]]:
    questions: list[dict[str, object]] = []
    for question_number in range(1, question_count + 1):
        question_external_id = f"{quiz_external_id}-q{question_number:02d}"
        questions.append(
            {
                "external_id": question_external_id,
                "text": f"{quiz_external_id} question {question_number}",
                "question_type": Question.MULTIPLE_CHOICE,
                "marks": 1,
                "explanation": f"{quiz_external_id} explanation {question_number}",
                "is_active": True,
                "options": [
                    {
                        "external_id": f"{question_external_id}-o01",
                        "text": f"{quiz_external_id} correct {question_number}",
                        "is_correct": True,
                        "is_active": True,
                    },
                    {
                        "external_id": f"{question_external_id}-o02",
                        "text": f"{quiz_external_id} distractor {question_number}a",
                        "is_correct": False,
                        "is_active": True,
                    },
                    {
                        "external_id": f"{question_external_id}-o03",
                        "text": f"{quiz_external_id} distractor {question_number}b",
                        "is_correct": False,
                        "is_active": True,
                    },
                    {
                        "external_id": f"{question_external_id}-o04",
                        "text": f"{quiz_external_id} distractor {question_number}c",
                        "is_correct": False,
                        "is_active": True,
                    },
                ],
            }
        )
    return questions


def _retarget_mock_question_correct_index(question: GeneratedQuestionDraft, target_index: int) -> GeneratedQuestionDraft:
    options = list(question.options)
    correct_option = options[question.correct_index]
    incorrect_options = [option for index, option in enumerate(options) if index != question.correct_index]
    reordered_options = incorrect_options[:]
    reordered_options.insert(target_index, correct_option)
    question.options = reordered_options
    question.correct_index = target_index
    return question


def _build_mock_quiz_draft(title: str) -> QuizDraft:
    sentences = _stub_sentences_for_title(title)
    questions = [
        GeneratedQuestionDraft(
            competency=Competency.CORE_DEFINITION,
            stem=f"What is the main educational purpose of {title}?",
            options=[
                "It explains the main concept clearly so later learning can reuse it.",
                "It focuses only on token branding and launch timing.",
                "It is mainly a checklist for exchange listing paperwork.",
                "It is a glossary of unrelated market slang.",
            ],
            correct_index=0,
            explanation="The source frames the unit as a clear explanation of the main concept that supports later learning reuse, while the other choices narrow the topic into unrelated goals.",
            source_excerpt=sentences[0].rstrip("."),
            generation_notes="Definition question anchored in the opening concept statement.",
        ),
        GeneratedQuestionDraft(
            competency=Competency.KEY_MECHANISM,
            stem=f"Which statement best captures how {title} says the mechanism works?",
            options=[
                "It describes how the mechanism works in practice and why each step matters.",
                "It says the mechanism depends only on social consensus and branding.",
                "It treats the mechanism as irrelevant once prices move quickly.",
                "It reduces the mechanism to a single marketing slogan.",
            ],
            correct_index=0,
            explanation="The source emphasizes practical mechanism details and the reason each step matters, whereas the distractors remove the operational logic the unit actually teaches.",
            source_excerpt=sentences[1].rstrip("."),
            generation_notes="Mechanism question tied to the workflow explanation.",
        ),
        GeneratedQuestionDraft(
            competency=Competency.PROCESS_STEP,
            stem=f"According to {title}, what should a learner do before acting in the workflow?",
            options=[
                "Verify the relevant context before acting.",
                "Skip verification if the market mood feels positive.",
                "Wait for a central actor to make every decision.",
                "Prioritize speed over understanding the process.",
            ],
            correct_index=0,
            explanation="The unit explicitly ties the workflow to verification before action, while the wrong answers each remove the caution the source expects from the learner.",
            source_excerpt=sentences[2].rstrip("."),
            generation_notes="Process-step question grounded in the operational risk sentence.",
        ),
        GeneratedQuestionDraft(
            competency=Competency.RISK_IDENTIFICATION,
            stem=f"Which risk does {title} most directly warn learners to avoid?",
            options=[
                "Acting without checking the relevant context first.",
                "Reading too many official explanations before deciding.",
                "Comparing the topic with broader crypto literacy.",
                "Looking for explicit explanations in multiple-choice form.",
            ],
            correct_index=0,
            explanation="The source warns about operational risk when learners act before verification, while the other options either describe useful study behavior or details the source presents positively.",
            source_excerpt=sentences[2].rstrip("."),
            generation_notes="Risk-identification question reuses the risk anchor from a different angle.",
        ),
        GeneratedQuestionDraft(
            competency=Competency.MISCONCEPTION_SPOTTING,
            stem=f"Which claim would {title} reject as a misunderstanding?",
            options=[
                "Careful application matters more than assuming outcomes without evidence.",
                "The topic should be applied carefully instead of assuming outcomes without evidence.",
                "The topic removes the need to examine evidence once you know the label.",
                "Participants should connect the topic to broader crypto literacy.",
            ],
            correct_index=2,
            explanation="The unit rejects unsupported assumptions and pushes learners toward evidence-based judgement, so the claim that labels remove the need for evidence is the misconception.",
            source_excerpt=sentences[3].rstrip("."),
            generation_notes="Misconception question anchored in the evidence-based application sentence.",
        ),
        GeneratedQuestionDraft(
            competency=Competency.SCENARIO_JUDGEMENT,
            stem=f"If a learner is unsure how {title} fits into the bigger picture, what should they do next?",
            options=[
                "Connect it to broader crypto literacy so later learning stays aligned.",
                "Ignore the broader context and memorize isolated terminology.",
                "Assume the topic works the same in every unrelated system.",
                "Treat the topic as complete without linking it to other concepts.",
            ],
            correct_index=0,
            explanation="The source says the topic should connect to broader crypto literacy so later learning remains aligned, which is the opposite of isolating or flattening the concept.",
            source_excerpt=sentences[4].rstrip("."),
            generation_notes="Scenario judgement question based on the broader-literacy anchor.",
        ),
        GeneratedQuestionDraft(
            competency=Competency.COMPARISON,
            stem=f"How does {title} distinguish informed use from over-reliance on central control?",
            options=[
                "Users should understand the workflow rather than delegate all judgement to one central actor.",
                "Users should rely on central approval whenever the process feels complex.",
                "Users should remove workflow understanding from the decision entirely.",
                "Users should compare only price movements and ignore process design.",
            ],
            correct_index=0,
            explanation="The source contrasts understanding the workflow with handing all judgement to a central actor, so the correct answer preserves that distinction and the distractors erase it.",
            source_excerpt=sentences[5].rstrip("."),
            generation_notes="Comparison question built from the decentralised-judgement sentence.",
        ),
        GeneratedQuestionDraft(
            competency=Competency.CAUSE_AND_EFFECT,
            stem=f"Why does {title} include scenario guidance in the unit?",
            options=[
                "So the topic can be turned into clear multiple-choice teaching moments with explicit explanations.",
                "So learners can ignore operational detail and focus on speed alone.",
                "So the unit can avoid explaining trade-offs or context.",
                "So every topic becomes identical regardless of use case.",
            ],
            correct_index=0,
            explanation="The source links scenario guidance to explicit, teachable questions and explanations, while the distractors remove the educational purpose stated in the unit.",
            source_excerpt=sentences[6].rstrip("."),
            generation_notes="Cause-and-effect question using the scenario-guidance rationale.",
        ),
        GeneratedQuestionDraft(
            competency=Competency.SECURITY_PRACTICE,
            stem=f"Which practice in {title} best supports safe learner behaviour?",
            options=[
                "Understand the workflow and verify context before acting.",
                "Assume the workflow is automatic once the first step is familiar.",
                "Replace explicit explanations with instinctive reactions.",
                "Treat misconceptions as good enough if they sound simple.",
            ],
            correct_index=0,
            explanation="The unit repeatedly points learners back to understanding the workflow and verifying context, making that combined practice the safest behavior among the options.",
            source_excerpt=sentences[5].rstrip("."),
            generation_notes="Security-practice question combines workflow understanding with verification.",
        ),
        GeneratedQuestionDraft(
            competency=Competency.SYNTHESIS,
            stem=f"Which conclusion best synthesizes the overall lesson of {title}?",
            options=[
                "It tests understanding by separating supported claims from misconceptions, not by rewarding memorization alone.",
                "It works best when learners memorize phrases and skip judgement.",
                "It is mainly about reducing every decision to a central authority.",
                "It treats explanations as optional once the terminology sounds familiar.",
            ],
            correct_index=0,
            explanation="The source ties the unit together by contrasting supported claims with misconceptions and by favoring understanding over rote memorization, which the wrong answers invert.",
            source_excerpt=sentences[7].rstrip("."),
            generation_notes="Synthesis question anchored in the final anti-memorization statement.",
        ),
    ]
    target_indexes = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1]
    for question, target_index in zip(questions, target_indexes, strict=True):
        _retarget_mock_question_correct_index(question, target_index)
    return QuizDraft(questions=questions)


def _mock_request_quiz_draft(*, title: str, cards, revision_feedback=None) -> QuizDraft:
    return _build_mock_quiz_draft(title)


class CatalogGenerationTests(TestCase):
    def test_rebalance_quiz_questions_is_deterministic_and_balanced(self) -> None:
        quiz_external_id = "beginner-01-create-ethereum-account"
        unbalanced_questions = _build_unbalanced_catalog_questions(quiz_external_id=quiz_external_id)

        first_pass = rebalance_quiz_questions(quiz_external_id=quiz_external_id, questions=unbalanced_questions)
        second_pass = rebalance_quiz_questions(quiz_external_id=quiz_external_id, questions=unbalanced_questions)

        self.assertEqual(first_pass, second_pass)
        self.assertEqual(sorted(get_correct_position_counts(first_pass)), [2, 2, 3, 3])

    def test_clean_markdown_source_prefers_frontmatter_title_and_strips_heading_markup(self) -> None:
        frontmatter_title, _, _ = clean_markdown_source(
            "\n".join(
                [
                    "---",
                    "title: Ethereum applications",
                    "---",
                    "",
                    "## Apps with superpowers {#apps-with-superpowers}",
                    "",
                    "Body text.",
                ]
            )
        )
        heading_title, _, _ = clean_markdown_source(
            "\n".join(
                [
                    "## What are NFTs? {#what-are-nfts}",
                    "",
                    "Body text.",
                ]
            )
        )

        self.assertEqual(frontmatter_title, "Ethereum applications")
        self.assertEqual(heading_title, "What are NFTs?")

    def test_clean_markdown_source_preserves_markdown_structure_for_body_rendering(self) -> None:
        _, body_markdown, body_text = clean_markdown_source(
            "\n".join(
                [
                    "# Wallet Safety",
                    "",
                    "Intro paragraph with **bold** context.",
                    "",
                    "## Steps",
                    "",
                    "1. Verify the address",
                    "2. Confirm the network",
                    "",
                    "> Never rush a transfer.",
                    "",
                    "```text",
                    "wallet address",
                    "```",
                ]
            )
        )

        self.assertIn("# Wallet Safety\n\nIntro paragraph", body_markdown)
        self.assertIn("## Steps\n\n1. Verify the address\n2. Confirm the network", body_markdown)
        self.assertIn("> Never rush a transfer.", body_markdown)
        self.assertIn("```text\nwallet address\n```", body_markdown)
        self.assertIn("Wallet Safety", body_text)

    def test_clean_markdown_source_preserves_markdown_links_and_bare_urls(self) -> None:
        _, body_markdown, _ = clean_markdown_source(
            "\n".join(
                [
                    "# Wallet Safety",
                    "",
                    "Read the [wallet guide](https://example.test/wallet).",
                    "",
                    "https://example.test/reference",
                    "",
                    "See the [NFT](/glossary/#nft) entry.",
                ]
            ),
            repo_name="ethereum/ethereum-org-website",
        )

        self.assertIn("[wallet guide](https://example.test/wallet)", body_markdown)
        self.assertIn("https://example.test/reference", body_markdown)
        self.assertIn("[NFT](https://ethereum.org/glossary/#nft)", body_markdown)

    def test_clean_markdown_source_drops_custom_component_tags_and_keeps_visible_copy(self) -> None:
        _, body_markdown, _ = clean_markdown_source(
            "\n".join(
                [
                    "# Scam help",
                    "",
                    "<ExpandableCard",
                    'title="Giveaway and airdrop scams"',
                    'contentPreview="No one is giving away free ETH."',
                    ">",
                    "",
                    "No one is giving away free ETH.",
                    "",
                    "</ExpandableCard>",
                    "",
                    '<DocLink href="/guides/how-to-revoke-token-access/">',
                    "Step-by-step guide: How to revoke token access",
                    "</DocLink>",
                    "",
                    '<YouTube id="abc123" />',
                    "",
                    "<Divider />",
                ]
            )
        )

        self.assertIn("### Giveaway and airdrop scams", body_markdown)
        self.assertIn("No one is giving away free ETH.", body_markdown)
        # Custom MDX wrappers should disappear, but their learner-facing copy still needs to survive the cleanup pass.
        self.assertNotIn("ExpandableCard", body_markdown)
        self.assertNotIn("DocLink", body_markdown)
        self.assertNotIn("YouTube", body_markdown)
        self.assertNotIn("Divider", body_markdown)
        self.assertIn("[Step-by-step guide: How to revoke token access](/guides/how-to-revoke-token-access/)", body_markdown)
        self.assertIn("https://www.youtube.com/watch?v=abc123", body_markdown)

    def test_clean_markdown_source_preserves_markdown_tables(self) -> None:
        _, body_markdown, _ = clean_markdown_source(
            "\n".join(
                [
                    "## A comparison",
                    "",
                    "| Left | Right |",
                    "| --- | --- |",
                    "| Own your assets | Rent an asset |",
                ]
            )
        )

        self.assertIn("| Left | Right |", body_markdown)
        self.assertIn("| --- | --- |", body_markdown)
        self.assertIn("| Own your assets | Rent an asset |", body_markdown)

    def test_clean_asciidoc_source_converts_html_table_to_markdown_table(self) -> None:
        title, body_markdown, _ = clean_asciidoc_source(
            "\n".join(
                [
                    "== The Blockchain",
                    "",
                    '<table id="block_structure1">',
                    "<caption>The structure of a block</caption>",
                    "<tr><th>Size</th><th>Field</th></tr>",
                    "<tr><td>4 bytes</td><td>Block size</td></tr>",
                    "</table>",
                ]
            )
        )

        self.assertEqual(title, "The Blockchain")
        self.assertIn("The structure of a block", body_markdown)
        self.assertIn("| Size | Field |", body_markdown)
        self.assertIn("| 4 bytes | Block size |", body_markdown)

    def test_clean_asciidoc_source_preserves_link_targets_for_frontend_rendering(self) -> None:
        _, body_markdown, _ = clean_asciidoc_source(
            "\n".join(
                [
                    "== The Blockchain",
                    "",
                    "Visit https://blockstream.info[Blockstream Explorer] for a live example.",
                ]
            )
        )

        self.assertIn("[Blockstream Explorer](https://blockstream.info)", body_markdown)

    def test_clean_markdown_source_discards_doclink_closing_tags(self) -> None:
        _, body_markdown, _ = clean_markdown_source(
            "\n".join(
                [
                    '<DocLink href="/guides/">',
                    "Step by step guides",
                    "</DocLink>",
                ]
            ),
            repo_name="ethereum/ethereum-org-website",
        )

        self.assertIn("[Step by step guides](https://ethereum.org/guides/)", body_markdown)
        self.assertNotIn("</DocLink>", body_markdown)

    def test_extract_concept_cards_captures_core_fields_from_markdown(self) -> None:
        body_markdown = "\n".join(
            [
                "# Wallet Safety",
                "Wallet safety explains how users protect funds with deliberate operational steps.",
                "Users should verify addresses before acting because sending funds to the wrong destination is risky.",
                "A common misconception is that a familiar interface removes the need for checks.",
                "If a learner is unsure, they should pause and compare the destination details carefully.",
            ]
        )
        body_text = body_markdown.replace("# ", "")

        cards = extract_concept_cards(title="Wallet Safety", body_markdown=body_markdown, body_text=body_text)

        self.assertTrue(cards)
        self.assertTrue(all(card.concept for card in cards))
        self.assertTrue(all(card.mechanism for card in cards))
        self.assertTrue(all(card.risk for card in cards))
        self.assertTrue(all(card.misconception for card in cards))
        self.assertTrue(all(card.scenario for card in cards))
        self.assertTrue(all(card.source_excerpt for card in cards))

    def test_validate_quiz_draft_rejects_generic_distractors(self) -> None:
        draft = _build_mock_quiz_draft("Wallet Safety")
        draft.questions[0].options[1] = "The topic guarantees profits with no trade-offs."

        issues = validate_quiz_draft(draft=draft, body_text=" ".join(_stub_sentences_for_title("Wallet Safety")))

        self.assertTrue(any("generic distractor" in issue for issue in issues))

    def test_compact_option_text_trims_overlong_multi_clause_options(self) -> None:
        value = "Unlike custodial cards, which require users to deposit funds with a third party, self-custodial cards enable real-world payments such as Visa and Mastercard while preserving onchain control."
        compacted = _compact_option_text(value)

        self.assertLessEqual(len(compacted.split()), 16)
        self.assertEqual(compacted, "Unlike custodial cards")

    def test_validate_quiz_draft_rejects_markup_artifacts(self) -> None:
        draft = _build_mock_quiz_draft("Wallet Safety")
        draft.questions[0].options[1] = '<Card Faster Transfers description="International wire transfers take several days to process."'

        issues = validate_quiz_draft(draft=draft, body_text=" ".join(_stub_sentences_for_title("Wallet Safety")))

        self.assertTrue(any("markup artifacts" in issue for issue in issues))

    def test_sanitize_display_text_cleans_card_markup(self) -> None:
        value = '<Card title="Faster Transfers" emoji="📶" description="International wire transfers take several days to process." />'
        self.assertEqual(
            sanitize_display_text(value),
            "Faster Transfers: International wire transfers take several days to process.",
        )

    def test_sanitize_display_text_cleans_table_rows(self) -> None:
        value = "| MetaMask Card | ✅ | ✅ | Wallet stays in MetaMask; auto off-ramp at payment |"
        self.assertEqual(
            sanitize_display_text(value),
            "MetaMask Card: Wallet stays in MetaMask; auto off-ramp at payment",
        )

    def test_sanitize_display_text_cleans_broken_card_fragments(self) -> None:
        value = '<Card Faster Transfers description="International wire transfers take several days to process."'
        self.assertEqual(
            sanitize_display_text(value),
            "Faster Transfers: International wire transfers take several days to process.",
        )

    def test_sanitize_display_text_collapses_empty_table_columns_after_cleanup(self) -> None:
        value = "MetaMask Card: : : Wallet stays in MetaMask; auto off-ramp at payment"
        self.assertEqual(
            sanitize_display_text(value),
            "MetaMask Card: Wallet stays in MetaMask; auto off-ramp at payment",
        )

    def test_sanitize_display_text_removes_bullet_prefix(self) -> None:
        value = "- Travala.com: This travel booking platform allows users to pay for hotels and flights using Ethereum."
        self.assertEqual(
            sanitize_display_text(value),
            "Travala.com: This travel booking platform allows users to pay for hotels and flights using Ethereum.",
        )

    def test_sanitize_markdown_text_preserves_headings_lists_and_quotes(self) -> None:
        value = "\n".join(
            [
                "# Wallet Safety",
                "",
                "Intro paragraph with **bold** context.",
                "",
                "## Steps",
                "",
                "1. Verify the address",
                "2. Confirm the network",
                "",
                "> Never rush a transfer.",
            ]
        )

        self.assertEqual(
            sanitize_markdown_text(value),
            value,
        )

    def test_sanitize_snapshot_payload_keeps_body_markdown_multiline(self) -> None:
        snapshot = sanitize_snapshot_payload(
            {
                "catalog_json": {
                    "tracks": [
                        {
                            "units": [
                                {
                                    "learning": {
                                        "body_markdown": "# Wallet Safety\n\n## Steps\n\n1. Verify the address\n2. Confirm the network",
                                        "body_text": "Wallet Safety Steps Verify the address Confirm the network",
                                    }
                                }
                            ]
                        }
                    ]
                },
                "quiz_catalog_json": {},
            }
        )

        body_markdown = snapshot["catalog_json"]["tracks"][0]["units"][0]["learning"]["body_markdown"]
        # Snapshot sanitization must not flatten markdown into display text, otherwise the frontend renderer loses headings and ordered steps.
        self.assertIn("\n\n## Steps\n\n", body_markdown)
        self.assertIn("\n2. Confirm the network", body_markdown)

    def test_build_catalog_generates_fixed_track_unit_and_question_counts(self) -> None:
        with (
            patch("quizzes.catalog._fetch_source_document", side_effect=_build_stub_source) as fetch_source_document_mock,
            patch("quizzes.generation._request_quiz_draft", side_effect=_mock_request_quiz_draft) as request_quiz_draft_mock,
        ):
            catalog = build_catalog_payload()

        self.assertEqual(len(catalog["tracks"]), 3)
        units = [unit for track in catalog["tracks"] for unit in track["units"]]
        questions = [question for unit in units for question in unit["quiz"]["questions"]]
        options = [option for question in questions for option in question["options"]]

        self.assertEqual(len(units), 21)
        self.assertEqual(len(questions), 210)
        self.assertEqual(len(options), 840)
        self.assertEqual(fetch_source_document_mock.call_count, 21)
        self.assertEqual(request_quiz_draft_mock.call_count, 21)
        self.assertTrue(all(unit["quiz"]["external_id"] == unit["external_id"] for unit in units))
        self.assertTrue(all(len(question["options"]) == 4 for question in questions))
        self.assertTrue(all(question["explanation"] for question in questions))
        self.assertTrue(all(len({question["competency"] for question in unit["quiz"]["questions"]}) == 10 for unit in units))
        self.assertTrue(all("generation_metadata" in unit for unit in units))
        self.assertTrue(all("answer_position_balanced" in unit["generation_metadata"]["quality_checks"] for unit in units))
        self.assertTrue(all(sorted(get_correct_position_counts(unit["quiz"]["questions"])) == [2, 2, 3, 3] for unit in units))

    def test_regenerate_publishes_catalog_and_syncs_live_quiz_tables(self) -> None:
        with (
            patch("quizzes.catalog._fetch_source_document", side_effect=_build_stub_source) as fetch_source_document_mock,
            patch("quizzes.generation._request_quiz_draft", side_effect=_mock_request_quiz_draft),
        ):
            published_catalog = regenerate_and_publish_catalog(allow_model_generation=True)

        self.assertTrue(published_catalog.version_hash)
        self.assertEqual(PublishedCatalog.objects.count(), 1)
        self.assertEqual(Lesson.objects.filter(is_active=True).count(), 3)
        self.assertEqual(Quiz.objects.filter(is_active=True).count(), 21)
        self.assertEqual(Question.objects.filter(is_active=True).count(), 210)
        self.assertEqual(Option.objects.filter(is_active=True).count(), 840)
        self.assertEqual(Quiz.objects.get(external_id="beginner-01-create-ethereum-account").lesson.external_id, "track-beginner")
        self.assertEqual(fetch_source_document_mock.call_count, 21)

    def test_regenerate_reuses_previous_quiz_when_source_is_unchanged(self) -> None:
        with (
            patch("quizzes.catalog._fetch_source_document", side_effect=_build_stub_source),
            patch("quizzes.generation._request_quiz_draft", side_effect=_mock_request_quiz_draft) as request_quiz_draft_mock,
        ):
            first_catalog = regenerate_and_publish_catalog(allow_model_generation=True)

        self.assertEqual(request_quiz_draft_mock.call_count, 21)
        first_questions = first_catalog.catalog_json["tracks"][0]["units"][0]["quiz"]["questions"]
        self.assertEqual(sorted(get_correct_position_counts(first_questions)), [2, 2, 3, 3])

        with (
            patch("quizzes.catalog._fetch_source_document", side_effect=_build_stub_source),
            patch("quizzes.generation._request_quiz_draft", side_effect=AssertionError("Should reuse previous quiz content")) as second_request_mock,
        ):
            second_catalog = regenerate_and_publish_catalog(allow_model_generation=True)

        self.assertEqual(second_request_mock.call_count, 0)
        second_questions = second_catalog.catalog_json["tracks"][0]["units"][0]["quiz"]["questions"]
        self.assertEqual(first_questions, second_questions)
        self.assertEqual(second_catalog.catalog_json["tracks"][0]["units"][0]["generation_metadata"]["reuse_reason"], "source_unchanged")
        self.assertEqual(sorted(get_correct_position_counts(second_questions)), [2, 2, 3, 3])

    def test_regenerate_force_refresh_ignores_unchanged_source_reuse(self) -> None:
        with (
            patch("quizzes.catalog._fetch_source_document", side_effect=_build_stub_source),
            patch("quizzes.generation._request_quiz_draft", side_effect=_mock_request_quiz_draft) as request_quiz_draft_mock,
        ):
            regenerate_and_publish_catalog(allow_model_generation=True)

        self.assertEqual(request_quiz_draft_mock.call_count, 21)

        with (
            patch("quizzes.catalog._fetch_source_document", side_effect=_build_stub_source),
            patch("quizzes.generation._request_quiz_draft", side_effect=_mock_request_quiz_draft) as second_request_mock,
        ):
            regenerate_and_publish_catalog(allow_model_generation=True, force_refresh=True)

        self.assertEqual(second_request_mock.call_count, 21)

    def test_regenerate_can_target_specific_units_without_full_refresh(self) -> None:
        with (
            patch("quizzes.catalog._fetch_source_document", side_effect=_build_stub_source),
            patch("quizzes.generation._request_quiz_draft", side_effect=_mock_request_quiz_draft),
        ):
            first_catalog = regenerate_and_publish_catalog(allow_model_generation=True)

        target_external_id = "beginner-03-crypto-payments"

        def changed_fetch(spec):
            source, raw_text = _build_stub_source(spec)
            if spec.external_id == target_external_id:
                raw_text = raw_text + "\n\nThis refreshed source adds a targeted update."
            return source, raw_text

        with (
            patch("quizzes.catalog._fetch_source_document", side_effect=changed_fetch) as fetch_source_document_mock,
            patch("quizzes.generation._request_quiz_draft", side_effect=_mock_request_quiz_draft) as request_quiz_draft_mock,
        ):
            second_catalog = regenerate_and_publish_catalog(
                allow_model_generation=True,
                force_refresh=True,
                target_unit_ids={target_external_id},
            )

        self.assertEqual(fetch_source_document_mock.call_count, 1)
        self.assertEqual(request_quiz_draft_mock.call_count, 1)
        unchanged_first_unit = next(
            unit
            for track in first_catalog.catalog_json["tracks"]
            for unit in track["units"]
            if unit["external_id"] == "beginner-01-create-ethereum-account"
        )
        unchanged_second_unit = next(
            unit
            for track in second_catalog.catalog_json["tracks"]
            for unit in track["units"]
            if unit["external_id"] == "beginner-01-create-ethereum-account"
        )
        self.assertEqual(unchanged_first_unit, unchanged_second_unit)

    def test_regenerate_reuses_previous_quiz_when_new_generation_fails(self) -> None:
        with (
            patch("quizzes.catalog._fetch_source_document", side_effect=_build_stub_source),
            patch("quizzes.generation._request_quiz_draft", side_effect=_mock_request_quiz_draft),
        ):
            first_catalog = regenerate_and_publish_catalog(allow_model_generation=True)

        target_external_id = "advanced-07-bitcoin-blockchain"
        first_target_unit = next(
            unit
            for track in first_catalog.catalog_json["tracks"]
            for unit in track["units"]
            if unit["external_id"] == target_external_id
        )

        def changed_fetch(spec):
            source, raw_text = _build_stub_source(spec)
            if spec.external_id == target_external_id:
                raw_text = raw_text + "\n\nThis updated source now adds a fresh operational nuance."
            return source, raw_text

        def flaky_request(*, title: str, cards, revision_feedback=None):
            if title == target_external_id.replace("-", " ").title():
                raise RuntimeError("model failed")
            return _mock_request_quiz_draft(title=title, cards=cards, revision_feedback=revision_feedback)

        with (
            patch("quizzes.catalog._fetch_source_document", side_effect=changed_fetch),
            patch("quizzes.generation._request_quiz_draft", side_effect=flaky_request),
        ):
            second_catalog = regenerate_and_publish_catalog(allow_model_generation=True)

        second_target_unit = next(
            unit
            for track in second_catalog.catalog_json["tracks"]
            for unit in track["units"]
            if unit["external_id"] == target_external_id
        )
        self.assertEqual(first_target_unit["quiz"]["questions"], second_target_unit["quiz"]["questions"])
        self.assertEqual(second_target_unit["generation_metadata"]["reuse_reason"], "quality_fallback")
        self.assertIn("fallback_error", second_target_unit["generation_metadata"])

    def test_regenerate_refuses_to_reuse_non_vetted_previous_quiz_on_generation_failure(self) -> None:
        with (
            patch("quizzes.catalog._fetch_source_document", side_effect=_build_stub_source),
            patch("quizzes.generation._request_quiz_draft", side_effect=_mock_request_quiz_draft),
        ):
            previous_catalog = build_catalog_payload()
        target_external_id = "beginner-03-crypto-payments"
        target_unit = next(
            unit
            for track in previous_catalog["tracks"]
            for unit in track["units"]
            if unit["external_id"] == target_external_id
        )
        target_unit["generation_metadata"] = {
            "reuse_reason": "quality_fallback",
            "reused_from_previous_publish": True,
        }

        def changed_fetch(spec):
            source, raw_text = _build_stub_source(spec)
            if spec.external_id == target_external_id:
                raw_text = raw_text + "\n\nThis refreshed source adds a targeted update."
            return source, raw_text

        with (
            patch("quizzes.catalog._fetch_source_document", side_effect=changed_fetch),
            patch("quizzes.generation._request_quiz_draft", side_effect=RuntimeError("model failed")),
        ):
            with self.assertRaises(CatalogGenerationError):
                build_catalog_payload(previous_catalog=previous_catalog, target_unit_ids={target_external_id})

    def test_regenerate_failure_keeps_previous_snapshot(self) -> None:
        with (
            patch("quizzes.catalog._fetch_source_document", side_effect=_build_stub_source) as fetch_source_document_mock,
            patch("quizzes.generation._request_quiz_draft", side_effect=_mock_request_quiz_draft),
        ):
            first_catalog = regenerate_and_publish_catalog(allow_model_generation=True)
        first_hash = first_catalog.version_hash

        def failing_fetch(spec):
            if spec.external_id == "advanced-07-bitcoin-blockchain":
                raise CatalogGenerationError("Missing source document for advanced-07-bitcoin-blockchain.")
            return _build_stub_source(spec)

        with (
            patch("quizzes.catalog._fetch_source_document", side_effect=failing_fetch),
            patch("quizzes.generation._request_quiz_draft", side_effect=_mock_request_quiz_draft),
        ):
            with self.assertRaises(CatalogGenerationError):
                regenerate_and_publish_catalog(allow_model_generation=True)

        self.assertEqual(PublishedCatalog.objects.count(), 1)
        self.assertEqual(PublishedCatalog.objects.get().version_hash, first_hash)
        self.assertEqual(Quiz.objects.filter(is_active=True).count(), 21)

    def test_regenerate_is_locked_without_explicit_allow_flag(self) -> None:
        with self.assertRaises(CatalogRegenerationLockedError):
            regenerate_and_publish_catalog()


class CatalogApiTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.admin_user = User.objects.create_superuser(
            username="admin@example.com",
            email="admin@example.com",
            password="test-password-123",
        )

    def test_catalog_endpoints_expose_published_snapshot(self) -> None:
        with (
            patch("quizzes.catalog._fetch_source_document", side_effect=_build_stub_source) as fetch_source_document_mock,
            patch("quizzes.generation._request_quiz_draft", side_effect=_mock_request_quiz_draft),
        ):
            regenerate_and_publish_catalog(allow_model_generation=True)

        catalog_response = self.client.get("/api/v1/catalog/")
        quiz_catalog_response = self.client.get("/api/v1/quiz-catalog/")

        self.assertEqual(catalog_response.status_code, status.HTTP_200_OK)
        self.assertEqual(quiz_catalog_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(catalog_response.json()["tracks"]), 3)
        self.assertEqual(len(quiz_catalog_response.json()["lessons"]), 3)

    def test_catalog_regenerate_endpoint_requires_admin_and_stays_locked(self) -> None:
        unauthenticated_response = self.client.post("/api/v1/catalog/regenerate/")
        self.client.force_authenticate(user=self.admin_user)
        authenticated_response = self.client.post("/api/v1/catalog/regenerate/")

        self.assertEqual(unauthenticated_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(authenticated_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("manage.py regenerate_catalog", authenticated_response.json()["detail"])

    @patch("quizzes.management.commands.regenerate_catalog.regenerate_and_publish_catalog")
    def test_regenerate_catalog_management_command_explicitly_allows_model_generation(self, regenerate_catalog_mock) -> None:
        PublishedCatalog.objects.create(
            singleton_key=1,
            version_hash="hash-123",
            catalog_json={"tracks": [{}, {}, {}]},
            quiz_catalog_json={"lessons": [{}, {}, {}]},
            published_at=timezone.now(),
        )
        regenerate_catalog_mock.return_value = PublishedCatalog.objects.get(singleton_key=1)

        call_command("regenerate_catalog")

        regenerate_catalog_mock.assert_called_once_with(
            allow_model_generation=True,
            force_refresh=False,
            target_unit_ids=None,
        )

    @patch("quizzes.management.commands.regenerate_catalog.regenerate_and_publish_catalog")
    def test_regenerate_catalog_management_command_passes_force_refresh_flag(self, regenerate_catalog_mock) -> None:
        PublishedCatalog.objects.create(
            singleton_key=1,
            version_hash="hash-123",
            catalog_json={"tracks": [{}, {}, {}]},
            quiz_catalog_json={"lessons": [{}, {}, {}]},
            published_at=timezone.now(),
        )
        regenerate_catalog_mock.return_value = PublishedCatalog.objects.get(singleton_key=1)

        call_command("regenerate_catalog", "--force-refresh")

        regenerate_catalog_mock.assert_called_once_with(
            allow_model_generation=True,
            force_refresh=True,
            target_unit_ids=None,
        )

    @patch("quizzes.management.commands.regenerate_catalog.regenerate_and_publish_catalog")
    def test_regenerate_catalog_management_command_passes_target_units(self, regenerate_catalog_mock) -> None:
        PublishedCatalog.objects.create(
            singleton_key=1,
            version_hash="hash-123",
            catalog_json={"tracks": [{}, {}, {}]},
            quiz_catalog_json={"lessons": [{}, {}, {}]},
            published_at=timezone.now(),
        )
        regenerate_catalog_mock.return_value = PublishedCatalog.objects.get(singleton_key=1)

        call_command("regenerate_catalog", "--units", "beginner-03-crypto-payments,intermediate-07-real-world-assets")

        regenerate_catalog_mock.assert_called_once_with(
            allow_model_generation=True,
            force_refresh=False,
            target_unit_ids={"beginner-03-crypto-payments", "intermediate-07-real-world-assets"},
        )

    def test_rebalance_quiz_answers_management_command_repairs_catalog_database_and_snapshot(self) -> None:
        quiz_external_id = UNIT_SPECS[0].external_id
        tracks = []
        for level, order_index in ((Quiz.BEGINNER, 1), (Quiz.INTERMEDIATE, 2), (Quiz.ADVANCED, 3)):
            units = []
            for spec in UNIT_SPECS:
                if spec.level != level:
                    continue
                units.append(
                    {
                        "external_id": spec.external_id,
                        "title": spec.external_id.replace("-", " ").title(),
                        "level": spec.level,
                        "order_index": spec.order_index,
                        "source": {"provider": "local"},
                        "learning": {
                            "format": "markdown",
                            "body_markdown": f"# {spec.external_id}\n{spec.external_id} teaches verification before action.",
                            "body_text": f"{spec.external_id} teaches verification before action.",
                            "excerpt": f"{spec.external_id} teaches verification before action.",
                            "estimated_minutes": 4,
                            "is_active": True,
                        },
                        "quiz": {
                            "external_id": spec.external_id,
                            "pass_mark": 7,
                            "questions": _build_unbalanced_catalog_questions(quiz_external_id=spec.external_id),
                        },
                        "generation_metadata": {"strategy": "static_snapshot"},
                    }
                )
            tracks.append(
                {
                    "external_id": f"track-{level}",
                    "title": level.title(),
                    "level": level,
                    "order_index": order_index,
                    "units": units,
                }
            )
        catalog_json = {
            "generated_at": timezone.now().isoformat(),
            "tracks": tracks,
        }
        quiz_catalog_json = project_quiz_catalog(catalog_json)
        sync_quiz_catalog_payload(quiz_catalog_json)
        PublishedCatalog.objects.create(
            singleton_key=1,
            version_hash="before-rebalance",
            catalog_json=catalog_json,
            quiz_catalog_json=quiz_catalog_json,
            published_at=timezone.now(),
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            snapshot_path = Path(tmpdir) / "published_catalog.json"
            with patch.dict("os.environ", {"STATIC_PUBLISHED_CATALOG_PATH": str(snapshot_path)}):
                call_command("rebalance_quiz_answers")

                published_catalog = PublishedCatalog.objects.get(singleton_key=1)
                rebalanced_questions = published_catalog.catalog_json["tracks"][0]["units"][0]["quiz"]["questions"]
                self.assertEqual(sorted(get_correct_position_counts(rebalanced_questions)), [2, 2, 3, 3])
                self.assertNotEqual(published_catalog.version_hash, "before-rebalance")
                self.assertTrue(snapshot_path.exists())

                snapshot_payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
                snapshot_questions = snapshot_payload["catalog_json"]["tracks"][0]["units"][0]["quiz"]["questions"]
                self.assertEqual(sorted(get_correct_position_counts(snapshot_questions)), [2, 2, 3, 3])

        database_questions = [
            {
                "external_id": question.external_id,
                "options": [
                    {
                        "external_id": option.external_id,
                        "text": option.text,
                        "is_correct": option.is_correct,
                        "is_active": option.is_active,
                    }
                    for option in question.options.order_by("external_id")
                ],
            }
            for question in Question.objects.filter(quiz__external_id=quiz_external_id).order_by("external_id")
        ]
        self.assertEqual(sorted(get_correct_position_counts(database_questions)), [2, 2, 3, 3])


class StaticCatalogBootstrapTests(TestCase):
    def test_bootstrap_imports_static_snapshot_when_database_is_empty(self) -> None:
        snapshot_payload = {
            "version_hash": "static-hash-123",
            "published_at": timezone.now().isoformat(),
            "catalog_json": {
                "generated_at": timezone.now().isoformat(),
                "tracks": [
                    {
                        "external_id": "track-beginner",
                        "title": "Beginner",
                        "level": Quiz.BEGINNER,
                        "order_index": 1,
                        "units": [
                            {
                                "external_id": "beginner-01",
                                "title": "Wallet Basics",
                                "level": Quiz.BEGINNER,
                                "order_index": 1,
                                "source": {"provider": "local"},
                                "learning": {
                                    "format": "markdown",
                                    "body_markdown": "# Wallet Basics\nWallet basics teach verification before action.",
                                    "body_text": "Wallet basics teach verification before action.",
                                    "excerpt": "Wallet basics teach verification before action.",
                                    "estimated_minutes": 4,
                                    "is_active": True,
                                },
                                "quiz": {
                                    "external_id": "beginner-01",
                                    "pass_mark": 1,
                                    "questions": [
                                        {
                                            "external_id": "beginner-01-q01",
                                            "text": "What should a learner do first?",
                                            "question_type": Question.MULTIPLE_CHOICE,
                                            "marks": 1,
                                            "explanation": "The lesson says learners should verify first.",
                                            "is_active": True,
                                            "options": [
                                                {
                                                    "external_id": "beginner-01-q01-o01",
                                                    "text": "Verify the destination before acting.",
                                                    "is_correct": True,
                                                    "is_active": True,
                                                },
                                                {
                                                    "external_id": "beginner-01-q01-o02",
                                                    "text": "Skip checks if the interface looks familiar.",
                                                    "is_correct": False,
                                                    "is_active": True,
                                                },
                                                {
                                                    "external_id": "beginner-01-q01-o03",
                                                    "text": "Wait for rumours before deciding.",
                                                    "is_correct": False,
                                                    "is_active": True,
                                                },
                                                {
                                                    "external_id": "beginner-01-q01-o04",
                                                    "text": "Ignore the workflow and move faster.",
                                                    "is_correct": False,
                                                    "is_active": True,
                                                },
                                            ],
                                        }
                                    ],
                                },
                                "generation_metadata": {"strategy": "static_snapshot"},
                            }
                        ],
                    },
                    {"external_id": "track-intermediate", "title": "Intermediate", "level": Quiz.INTERMEDIATE, "order_index": 2, "units": []},
                    {"external_id": "track-advanced", "title": "Advanced", "level": Quiz.ADVANCED, "order_index": 3, "units": []},
                ],
            },
            "quiz_catalog_json": {
                "generated_at": timezone.now().isoformat(),
                "lessons": [
                    {
                        "external_id": "track-beginner",
                        "title": "Beginner",
                        "slug": "beginner",
                        "description": "Beginner track",
                        "is_active": True,
                        "quizzes": [
                            {
                                "external_id": "beginner-01",
                                "title": "Wallet Basics",
                                "description": "Wallet basics teach verification before action.",
                                "level": Quiz.BEGINNER,
                                "order_index": 1,
                                "pass_mark": 1,
                                "is_active": True,
                                "questions": [
                                    {
                                        "external_id": "beginner-01-q01",
                                        "text": "What should a learner do first?",
                                        "question_type": Question.MULTIPLE_CHOICE,
                                        "marks": 1,
                                        "explanation": "The lesson says learners should verify first.",
                                        "is_active": True,
                                        "options": [
                                            {
                                                "external_id": "beginner-01-q01-o01",
                                                "text": "Verify the destination before acting.",
                                                "is_correct": True,
                                                "is_active": True,
                                            },
                                            {
                                                "external_id": "beginner-01-q01-o02",
                                                "text": "Skip checks if the interface looks familiar.",
                                                "is_correct": False,
                                                "is_active": True,
                                            },
                                            {
                                                "external_id": "beginner-01-q01-o03",
                                                "text": "Wait for rumours before deciding.",
                                                "is_correct": False,
                                                "is_active": True,
                                            },
                                            {
                                                "external_id": "beginner-01-q01-o04",
                                                "text": "Ignore the workflow and move faster.",
                                                "is_correct": False,
                                                "is_active": True,
                                            },
                                        ],
                                    }
                                ],
                            }
                        ],
                    },
                    {"external_id": "track-intermediate", "title": "Intermediate", "slug": "intermediate", "description": "Intermediate track", "is_active": True, "quizzes": []},
                    {"external_id": "track-advanced", "title": "Advanced", "slug": "advanced", "description": "Advanced track", "is_active": True, "quizzes": []},
                ],
            },
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            snapshot_path = Path(tmpdir) / "published_catalog.json"
            snapshot_path.write_text(json.dumps(snapshot_payload), encoding="utf-8")

            with patch.dict("os.environ", {"STATIC_PUBLISHED_CATALOG_PATH": str(snapshot_path)}):
                catalog = bootstrap_published_catalog_from_static_snapshot()

        self.assertIsNotNone(catalog)
        self.assertEqual(PublishedCatalog.objects.count(), 1)
        self.assertEqual(PublishedCatalog.objects.get().version_hash, "static-hash-123")
        self.assertEqual(Quiz.objects.filter(is_active=True).count(), 1)
        self.assertEqual(Question.objects.filter(is_active=True).count(), 1)
        self.assertEqual(Option.objects.filter(is_active=True).count(), 4)
