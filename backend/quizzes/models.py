from django.db import models
from django.contrib.auth.models import User


class Lesson(models.Model):
    # external_id lets published catalog snapshots upsert lessons deterministically across environments.
    external_id = models.CharField(max_length=120, unique=True, null=True, blank=True)
    title = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    # Soft-deactivate synced lessons instead of deleting them so historical attempts remain referentially intact.
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return self.title


class Quiz(models.Model):
    # The staged levels drive both ordering and the labels shown in the learning-path UI.
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"

    LEVEL_CHOICES = [
        (BEGINNER, "Beginner"),
        (INTERMEDIATE, "Intermediate"),
        (ADVANCED, "Advanced"),
    ]

    lesson = models.ForeignKey(Lesson, on_delete=models.CASCADE, related_name="quizzes")
    external_id = models.CharField(max_length=120, unique=True, null=True, blank=True)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    # Progression metadata lives on the quiz so unlock rules do not depend on hard-coded ids or titles.
    level = models.CharField(max_length=20, choices=LEVEL_CHOICES, default=BEGINNER)
    order_index = models.PositiveIntegerField(default=0)
    pass_mark = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return f"{self.lesson.title} - {self.title}"


class Question(models.Model):
    MULTIPLE_CHOICE = "MCQ"
    SHORT_ANSWER = "SAQ"

    QUESTION_TYPES = [
        (MULTIPLE_CHOICE, "Multiple Choice"),
        (SHORT_ANSWER, "Short Answer"),
    ]

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="questions")
    external_id = models.CharField(max_length=120, unique=True, null=True, blank=True)
    text = models.TextField()
    question_type = models.CharField(max_length=3, choices=QUESTION_TYPES, default=MULTIPLE_CHOICE)
    marks = models.PositiveIntegerField(default=1)
    explanation = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return self.text[:50]


class Option(models.Model):
    # external_id preserves option-slot identity even when answer balancing rewrites option text between publishes.
    external_id = models.CharField(max_length=120, unique=True, null=True, blank=True)
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="options")
    text = models.CharField(max_length=300)
    # Correctness is serialized to the quiz client so the result screen can mark answers without a second grading call.
    is_correct = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return self.text[:50]


class WrittenAnswerMarkScheme(models.Model):
    question = models.OneToOneField(Question, on_delete=models.CASCADE, related_name="mark_scheme")
    key_points = models.TextField(
        help_text="Key points that a good written answer should include."
    )

    def __str__(self) -> str:
        return f"Mark scheme for question {self.question.id}"


class QuizAttempt(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="quiz_attempts",
        null=True,
        blank=True
    )
    # guest_id keeps anonymous quiz progress linkable until login merges it into a real user account.
    guest_id = models.CharField(max_length=80, null=True, blank=True)
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="attempts")
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    total_score = models.FloatField(default=0)

    def __str__(self) -> str:
        return f"{self.user or 'Anon'} - {self.quiz.title} ({self.total_score})"


class QuestionResponse(models.Model):
    attempt = models.ForeignKey(QuizAttempt, on_delete=models.CASCADE, related_name="responses")
    question = models.ForeignKey(Question, on_delete=models.CASCADE)
    selected_option = models.ForeignKey(
        Option,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    written_answer = models.TextField(blank=True)
    is_correct = models.BooleanField(default=False)
    score_awarded = models.FloatField(default=0)
    ai_feedback = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"Response to Q{self.question.id} in attempt {self.attempt.id}"


class QuizCatalogSyncState(models.Model):
    # The sync state is a singleton row because the product currently publishes exactly one shared upstream quiz catalog.
    singleton_key = models.PositiveSmallIntegerField(default=1, unique=True)
    last_attempted_at = models.DateTimeField(null=True, blank=True)
    last_successful_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)
    last_payload_hash = models.CharField(max_length=64, blank=True)

    def __str__(self) -> str:
        return "Quiz catalog sync state"


class PublishedCatalog(models.Model):
    # Keep the last published catalog in one singleton row so HTTP reads and management commands share the same source of truth.
    singleton_key = models.PositiveSmallIntegerField(default=1, unique=True)
    version_hash = models.CharField(max_length=64, blank=True)
    catalog_json = models.JSONField(default=dict, blank=True)
    quiz_catalog_json = models.JSONField(default=dict, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return "Published content catalog"


class LearnUnitCompletion(models.Model):
    # Persist completion by catalog unit id so learn progress stays stable even if relational quiz ids differ across environments.
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="learn_unit_completions")
    unit_external_id = models.CharField(max_length=120)
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # One user/unit row keeps completion writes idempotent even if the client replays the same lesson-finished event.
        constraints = [
            models.UniqueConstraint(fields=["user", "unit_external_id"], name="unique_learn_unit_completion_per_user")
        ]

    def __str__(self) -> str:
        return f"{self.user} completed {self.unit_external_id}"
