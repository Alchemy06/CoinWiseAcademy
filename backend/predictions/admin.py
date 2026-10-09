from django.contrib import admin

from .models import Prediction


@admin.register(Prediction)
class PredictionAdmin(admin.ModelAdmin):
    list_display = [
        "user", "asset", "direction", "timeframe_minutes", "confidence",
        "entry_price", "exit_price", "result", "status", "resolve_at", "created_at",
    ]
    list_filter = ["asset", "direction", "status", "result"]
    readonly_fields = [
        "entry_price", "exit_price", "entry_timestamp", "resolve_at", "resolved_at",
        "actual_direction", "price_change_percent", "result", "reflection_text",
        "calibration_label", "created_at", "updated_at",
    ]
    search_fields = ["user__username", "asset"]
    ordering = ["-created_at"]
