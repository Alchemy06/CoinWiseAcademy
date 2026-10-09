from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Prefetch
from rest_framework import generics, permissions, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.response import Response
from rest_framework.views import APIView

from config.locale import resolve_request_locale
from .catalog import CatalogGenerationError, bootstrap_published_catalog_from_static_snapshot, get_published_catalog_or_raise
from .feedback import generate_quiz_feedback, has_quiz_feedback_api_key
from .localization import get_localized_catalog_payload, get_localized_question_copy, get_localized_quiz_copy
from.models import LearnUnitCompletion, Lesson, Option, Question, QuestionResponse, Quiz, QuizAttempt
from.serializers import LessonSerializer, QuizFeedbackRequestSerializer, QuizSerializer
from .sanitize import sanitize_display_text
from.services import (
    build_quiz_path_payload,
    get_catalog_unit_external_ids,
    get_completed_unit_external_ids,
    get_supported_active_quiz_by_id,
)


class LessonListView(generics.ListAPIView):
    """
    GET /api/lessons/
    Returns all lessons, each with its quizzes and questions.
    """
    serializer_class = LessonSerializer
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Seed from the checked-in snapshot on first access so local/dev environments can serve quizzes before any live sync runs.
        bootstrap_published_catalog_from_static_snapshot()
        return Lesson.objects.filter(is_active=True).prefetch_related(
            Prefetch(
                "quizzes",
                queryset=Quiz.objects.filter(is_active=True).prefetch_related(
                    Prefetch(
                        "questions",
                        queryset=Question.objects.filter(is_active=True).prefetch_related(
                            Prefetch("options", queryset=Option.objects.filter(is_active=True).order_by("id"))
                        ).order_by("id"),
                    )
                ),
            )
        )


class QuizDetailView(generics.RetrieveAPIView):
    """
    GET /api/quizzes/<id>/
    Returns a single quiz with its questions and options.
    """
    serializer_class = QuizSerializer
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        # Restrict detail access to the curated live path so hidden or unsupported quizzes never leak to the client.
        quiz = get_supported_active_quiz_by_id(self.kwargs["pk"])
        if quiz is None:
            raise Http404
        return quiz


class QuizPathView(APIView):
    """
    GET /api/quiz-path/
    Returns the authenticated user's current quiz progression path.
    """

    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # The path payload is computed server-side so unlock logic stays authoritative and consistent across clients.
        return Response(build_quiz_path_payload(user=request.user, locale=resolve_request_locale(request)))


class SubmitQuizView(APIView):
    """
    POST /api/quizzes/<quiz_id>/submit/
    """
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, quiz_id: int):
        locale = resolve_request_locale(request)
        # Submission is limited to the same supported live quizzes the path exposes, keeping route behavior aligned.
        quiz = get_supported_active_quiz_by_id(quiz_id)
        if quiz is None:
            return Response({"detail": "未找到该测验。" if locale == "zh-CN" else "Quiz not found."}, status=status.HTTP_404_NOT_FOUND)

        questions = list(quiz.questions.all())
        answers = request.data.get("answers", [])
        # Index incoming answers once so scoring can iterate in canonical quiz order instead of trusting payload order.
        answers_by_question_id = {
            answer.get("question_id"): answer
            for answer in answers
            if isinstance(answer, dict) and answer.get("question_id") is not None
        }

        # Persist the attempt before scoring so every submission produces an auditable record, even if the score is zero.
        attempt = QuizAttempt.objects.create(
            user=request.user,
            guest_id=None,
            quiz=quiz
        )

        total_score = 0.0
        correct_count = 0
        results: list[dict[str, object]] = []

        for question in questions:
            # Missing answers are treated as unanswered rather than invalid so the UI can submit immediately after the last pick.
            answer = answers_by_question_id.get(question.id, {})
            selected_option_id = answer.get("selected_option_id") if isinstance(answer, dict) else None

            selected_option = None
            # Return the authoritative correct option id so the frontend can render review states without recomputing correctness.
            correct_option = next((option for option in question.options.all() if option.is_correct), None)
            is_correct = False
            score_awarded = 0.0

            if selected_option_id is not None:
                # Constrain submitted option ids to the current question so cross-question ids cannot be replayed into this attempt.
                selected_option = get_object_or_404(Option, id=selected_option_id, question=question, is_active=True)
                is_correct = selected_option.is_correct
                if is_correct:
                    score_awarded = float(question.marks)
                    correct_count += 1

            # Store per-question grading so later review screens do not have to infer correctness from raw answers.
            QuestionResponse.objects.create(
                attempt=attempt,
                question=question,
                selected_option=selected_option,
                written_answer="",
                is_correct=is_correct,
                score_awarded=score_awarded
            )

            total_score += score_awarded
            localized_question_copy = get_localized_question_copy(locale, question.external_id) or {}
            # Mirror the persisted grading data in the response so the client can render an immediate result view.
            results.append(
                {
                    "questionId": question.id,
                    "selectedOptionId": selected_option.id if selected_option is not None else None,
                    "correctOptionId": correct_option.id if correct_option is not None else None,
                    "isCorrect": is_correct,
                    "scoreAwarded": score_awarded,
                    "explanation": sanitize_display_text(localized_question_copy.get("explanation") or question.explanation),
                }
            )

        attempt.total_score = total_score
        attempt.completed_at = timezone.now()
        attempt.save()

        max_score = sum(question.marks for question in questions)
        pass_score = quiz.pass_mark
        passed = total_score >= pass_score

        return Response(
            {
                "attempt_id": attempt.id,
                "total_score": total_score,
                "maxScore": max_score,
                "passScore": pass_score,
                "passed": passed,
                "correctCount": correct_count,
                "questionCount": len(questions),
                "results": results,
                "message": "测验提交成功。" if locale == "zh-CN" else "Quiz submitted successfully."
            }
        )


class QuizFeedbackView(APIView):
    # Feedback reuses the learner's own completed attempt data, so keep it behind the same session auth as quiz play.
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, quiz_id: int):
        locale = resolve_request_locale(request)
        # Match the feedback route to the curated live quiz set so stale or hidden quizzes cannot request summaries.
        quiz = get_supported_active_quiz_by_id(quiz_id)
        if quiz is None:
            return Response({"detail": "未找到该测验。" if locale == "zh-CN" else "Quiz not found."}, status=status.HTTP_404_NOT_FOUND)

        # Accept only a concrete attempt id because feedback must be anchored to one finished submission record.
        serializer = QuizFeedbackRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Prefetch the full review graph once so prompt assembly never falls back into per-question query churn.
        attempt = QuizAttempt.objects.prefetch_related(
            Prefetch("responses", queryset=QuestionResponse.objects.select_related("question", "selected_option")),
            Prefetch("quiz__questions", queryset=Question.objects.filter(is_active=True).prefetch_related("options").order_by("id")),
        ).select_related("quiz").filter(id=serializer.validated_data["attempt_id"]).first()

        if attempt is None:
            return Response({"detail": "未找到该次测验记录。" if locale == "zh-CN" else "Quiz attempt not found."}, status=status.HTTP_404_NOT_FOUND)

        # Ownership must stay authoritative server-side because attempt ids are easy to replay from the client.
        if attempt.user_id != request.user.id:
            return Response({"detail": "该测验记录不属于当前用户。" if locale == "zh-CN" else "Quiz attempt does not belong to the current user."}, status=status.HTTP_403_FORBIDDEN)

        # Cross-check route quiz id against the attempt so one quiz page cannot fetch feedback for another quiz's run.
        if attempt.quiz_id != quiz.id:
            return Response({"detail": "该测验记录与当前测验不匹配。" if locale == "zh-CN" else "Quiz attempt does not match this quiz."}, status=status.HTTP_404_NOT_FOUND)

        # Only validated, user-owned attempts should reach model-backed feedback generation.
        if not has_quiz_feedback_api_key():
            return Response(
                {"detail": "服务器缺少 OPENAI_API_KEY。" if locale == "zh-CN" else "OPENAI_API_KEY is missing on the server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        try:
            # Keep prompt loading and model generation inside one boundary so operational failures map to one API contract.
            feedback = generate_quiz_feedback(attempt, locale=locale)
        except FileNotFoundError:
            return Response(
                {"detail": "服务器上找不到测验反馈提示词文件。" if locale == "zh-CN" else "Quiz feedback prompt file was not found on the server."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as exc:  # noqa: BLE001
            return Response(
                {"detail": f"获取测验反馈失败：{exc}" if locale == "zh-CN" else f"Failed to get quiz feedback: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY
            )

        return Response({"feedback": feedback}, status=status.HTTP_200_OK)


class CatalogView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        # Publish the richer learning catalog publicly so external tooling can inspect source, learning copy, and quiz metadata together.
        locale = resolve_request_locale(request)
        try:
            catalog = get_published_catalog_or_raise()
        except CatalogGenerationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)

        return Response(get_localized_catalog_payload(locale, section="catalog_json") or catalog.catalog_json)


class QuizCatalogView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        # Expose the reduced quiz-only projection separately because the sync/import pipeline does not need full learning content.
        locale = resolve_request_locale(request)
        try:
            catalog = get_published_catalog_or_raise()
        except CatalogGenerationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)

        return Response(get_localized_catalog_payload(locale, section="quiz_catalog_json") or catalog.quiz_catalog_json)


class CatalogRegenerateView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        # HTTP writes stay locked out so heavy regeneration always runs from an explicit management command with operator intent.
        return Response(
            {
                "detail": "HTTP 请求不允许在本地重新生成测验目录。请使用明确的 manage.py regenerate_catalog 命令。"
                if resolve_request_locale(request) == "zh-CN"
                else "Local quiz regeneration is disabled for HTTP requests. Use the explicit manage.py regenerate_catalog command."
            },
            status=status.HTTP_403_FORBIDDEN,
        )


class LearnProgressView(APIView):
    # Progress belongs to the signed-in learner, so keep the endpoint behind the same session gate as quiz routes.
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Return only external ids so the client can reconcile completion against the published catalog snapshot.
        return Response(
            {
                "completedUnitExternalIds": get_completed_unit_external_ids(user=request.user)
            },
            status=status.HTTP_200_OK,
        )


class LearnProgressCompleteView(APIView):
    # Completion writes are user-specific mutations, so they stay behind authenticated session access as well.
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, unit_external_id: str):
        locale = resolve_request_locale(request)
        # Validate against the current published catalog so arbitrary ids cannot create orphaned completion rows.
        if unit_external_id not in get_catalog_unit_external_ids():
            return Response({"detail": "未找到该学习单元。" if locale == "zh-CN" else "Learn unit not found."}, status=status.HTTP_404_NOT_FOUND)

        completion, created = LearnUnitCompletion.objects.get_or_create(
            user=request.user,
            unit_external_id=unit_external_id,
        )
        if created:
            # Refresh only on first insert so the response always includes the DB-generated completion timestamp.
            completion.refresh_from_db(fields=["completed_at"])

        return Response(
            {
                "unitExternalId": completion.unit_external_id,
                "completedAt": completion.completed_at.isoformat(),
            },
            status=status.HTTP_200_OK,
        )
    
class UserDashboardView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        locale = resolve_request_locale(request)
        user = request.user
        attempts = QuizAttempt.objects.filter(
            user=user, completed_at__isnull=False
        ).select_related("quiz")

        quizzes_attempted = attempts.count()
        quizzes_passed = sum(
            1 for a in attempts if a.total_score >= a.quiz.pass_mark
        )

        scores = [a.total_score for a in attempts]
        average_score = round(sum(scores) / len(scores), 1) if scores else 0

        from .models import QuestionResponse
        responses = QuestionResponse.objects.filter(
            attempt__user=user, attempt__completed_at__isnull=False
        )
        total_questions = responses.count()
        correct_answers = responses.filter(is_correct=True).count()
        accuracy = round((correct_answers / total_questions) * 100, 1) if total_questions else 0

        lessons_completed = LearnUnitCompletion.objects.filter(user=user).count()

        # Level breakdown
        level_breakdown = {}
        for level in [Quiz.BEGINNER, Quiz.INTERMEDIATE, Quiz.ADVANCED]:
            level_attempts = attempts.filter(quiz__level=level)
            level_passed = sum(
                1 for a in level_attempts if a.total_score >= a.quiz.pass_mark
            )
            level_breakdown[level] = {
                "attempted": level_attempts.count(),
                "passed": level_passed
            }

        # Recent attempts (last 5)
        recent = attempts.order_by("-completed_at")[:5]
        recent_attempts = [
            {
                "quizTitle": (get_localized_quiz_copy(locale, a.quiz.external_id) or {}).get("title") or a.quiz.title,
                "score": a.total_score,
                "passMark": a.quiz.pass_mark,
                "passed": a.total_score >= a.quiz.pass_mark,
                "completedAt": a.completed_at.isoformat(),
                "level": a.quiz.level,
            }
            for a in recent
        ]

        return Response({
            "quizzesAttempted": quizzes_attempted,
            "quizzesPassed": quizzes_passed,
            "averageScore": average_score,
            "totalQuestionsAnswered": total_questions,
            "correctAnswers": correct_answers,
            "accuracyPercent": accuracy,
            "lessonsCompleted": lessons_completed,
            "levelBreakdown": level_breakdown,
            "recentAttempts": recent_attempts,
        })
