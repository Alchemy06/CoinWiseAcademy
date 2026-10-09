from django.contrib import admin

from .models import ReplayAttempt, ReplayCandle, ReplayNewsEvent, ReplayScenario


@admin.register(ReplayScenario)
class ReplayScenarioAdmin(admin.ModelAdmin):
    list_display = ["id", "title", "asset_symbol", "historical_start_date", "historical_end_date", "is_active", "order"]
    list_filter = ["is_active", "asset_symbol"]


@admin.register(ReplayCandle)
class ReplayCandleAdmin(admin.ModelAdmin):
    list_display = ["scenario", "date", "open_pence", "close_pence"]
    list_filter = ["scenario"]
    ordering = ["scenario", "date"]


@admin.register(ReplayNewsEvent)
class ReplayNewsEventAdmin(admin.ModelAdmin):
    list_display = ["scenario", "date", "impact", "headline"]
    list_filter = ["scenario", "impact"]
    ordering = ["scenario", "date"]


@admin.register(ReplayAttempt)
class ReplayAttemptAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "scenario", "attempt_date", "cash_pence", "btc_held_satoshis", "is_complete"]
    list_filter = ["scenario", "is_complete", "attempt_date"]
    ordering = ["-attempt_date"]
