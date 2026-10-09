from rest_framework import serializers
from config.locale import DEFAULT_LOCALE, resolve_request_locale
from.models import Lesson, Quiz, Question, Option, QuizAttempt, QuestionResponse
from .localization import (
    get_localized_lesson_title_for_quiz,
    get_localized_option_text,
    get_localized_question_copy,
    get_localized_quiz_copy,
)
from .sanitize import sanitize_display_text


class QuizFeedbackRequestSerializer(serializers.Serializer):
    # Feedback generation only needs the persisted attempt reference because the server reconstructs the full context.
    attempt_id = serializers.IntegerField(min_value=1)


class OptionSerializer(serializers.ModelSerializer):
    # Include correctness so the frontend can show instant review states after a submission.
    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        locale = resolve_request_locale(request) if request is not None else DEFAULT_LOCALE
        # Strip visible content artifacts at the API boundary so stale synced text does not leak straight into the UI.
        data["text"] = sanitize_display_text(get_localized_option_text(locale, instance.external_id) or data["text"])
        return data

    class Meta:
        model = Option
        fields = ["id", "text", "is_correct"]


class QuestionSerializer(serializers.ModelSerializer):
    options = serializers.SerializerMethodField()

    def get_options(self, obj):
        # Filter in serializer space as a final guard so inactive synced options never reach the client.
        options = [option for option in obj.options.all() if option.is_active]
        return OptionSerializer(options, many=True, context=self.context).data

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        locale = resolve_request_locale(request) if request is not None else DEFAULT_LOCALE
        localized_copy = get_localized_question_copy(locale, instance.external_id) or {}
        # Question text and explanations can originate from imported content, so sanitize both before shipping them.
        data["text"] = sanitize_display_text(localized_copy.get("text") or data["text"])
        data["explanation"] = sanitize_display_text(localized_copy.get("explanation") or data["explanation"])
        return data

    class Meta:
        model = Question
        fields = ["id", "text", "question_type", "marks", "explanation", "options"]


class QuizSerializer(serializers.ModelSerializer):
    questions = serializers.SerializerMethodField()

    def get_questions(self, obj):
        # Keep inactive questions hidden even if a broader queryset accidentally prefetched them upstream.
        questions = [question for question in obj.questions.all() if question.is_active]
        return QuestionSerializer(questions, many=True, context=self.context).data

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        locale = resolve_request_locale(request) if request is not None else DEFAULT_LOCALE
        localized_copy = get_localized_quiz_copy(locale, instance.external_id) or {}
        localized_lesson_title = get_localized_lesson_title_for_quiz(locale, instance.external_id)
        # Quiz copy is shared across path/detail payloads, so clean it once here for every consumer.
        data["title"] = sanitize_display_text(localized_copy.get("title") or localized_lesson_title or data["title"])
        data["description"] = sanitize_display_text(localized_copy.get("description") or data["description"])
        return data

    class Meta:
        model = Quiz
        # Ship progression fields with the quiz detail payload so the session view can stay self-contained.
        fields = ["id", "external_id", "title", "description", "level", "order_index", "pass_mark", "questions"]


class LessonSerializer(serializers.ModelSerializer):
    quizzes = serializers.SerializerMethodField()

    def get_quizzes(self, obj):
        # Lessons remain in the payload even as quizzes are activated/deactivated over time, so filter dynamically.
        quizzes = [quiz for quiz in obj.quizzes.all() if quiz.is_active]
        return QuizSerializer(quizzes, many=True, context=self.context).data

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        locale = resolve_request_locale(request) if request is not None else DEFAULT_LOCALE
        first_quiz = next((quiz for quiz in instance.quizzes.all() if quiz.is_active), None)
        localized_title = get_localized_lesson_title_for_quiz(locale, first_quiz.external_id if first_quiz else None)
        # Lesson titles/descriptions come from synced catalog metadata and need the same artifact cleanup as quizzes.
        data["title"] = sanitize_display_text(localized_title or data["title"])
        data["description"] = sanitize_display_text(data["description"])
        return data

    class Meta:
        model = Lesson
        fields = ["id", "title", "slug", "description", "quizzes"]


class QuizAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizAttempt
        fields = ["id", "quiz", "total_score", "started_at", "completed_at"]


class QuestionResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionResponse
        fields = [
            "id",
            "question",
            "selected_option",
            "written_answer",
            "is_correct",
            "score_awarded",
            "ai_feedback"
        ]
