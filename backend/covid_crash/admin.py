from django.contrib import admin
from .models import Scenario, ScenarioRound, ScenarioFinale, LessonNarrative, UserScenarioAttempt

@admin.register(Scenario)
class ScenarioAdmin(admin.ModelAdmin):
    list_display = ['title', 'order', 'is_active']

@admin.register(ScenarioRound)
class ScenarioRoundAdmin(admin.ModelAdmin):
    list_display = ['scenario', 'round_index', 'scenario_date', 'price_pence']

@admin.register(ScenarioFinale)
class ScenarioFinaleAdmin(admin.ModelAdmin):
    list_display = ['scenario', 'end_date', 'end_price_pence']

@admin.register(LessonNarrative)
class LessonNarrativeAdmin(admin.ModelAdmin):
    list_display = ['scenario', 'pattern_key', 'headline']

@admin.register(UserScenarioAttempt)
class UserScenarioAttemptAdmin(admin.ModelAdmin):
    list_display = ['user', 'scenario', 'is_complete', 'started_at']
    readonly_fields = ['action_log', 'final_state_snapshot']
