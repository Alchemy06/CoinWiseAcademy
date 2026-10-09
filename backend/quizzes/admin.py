from django.contrib import admin
from.models import (
    Lesson,
    LearnUnitCompletion,
    Quiz,
    Question,
    Option,
    PublishedCatalog,
    QuizCatalogSyncState,
    WrittenAnswerMarkScheme,
    QuizAttempt,
    QuestionResponse
)


class OptionInline(admin.TabularInline):
    model = Option
    extra = 2


class QuestionAdmin(admin.ModelAdmin):
    inlines = [OptionInline]
    list_display = ("text", "quiz", "question_type", "marks", "is_active")


admin.site.register(Lesson)


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    # Surface progression fields in the changelist so staff can review ordering and pass thresholds without opening each record.
    list_display = ("title", "lesson", "external_id", "level", "order_index", "pass_mark", "is_active")
    list_filter = ("level", "is_active")
    ordering = ("order_index", "id")


admin.site.register(Question, QuestionAdmin)
admin.site.register(Option)
admin.site.register(WrittenAnswerMarkScheme)
admin.site.register(QuizAttempt)
admin.site.register(QuestionResponse)
admin.site.register(QuizCatalogSyncState)
admin.site.register(PublishedCatalog)
admin.site.register(LearnUnitCompletion)
