import datetime

from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone

User = get_user_model()


class ReplayScenario(models.Model):
    title = models.CharField(max_length=200)
    subtitle = models.CharField(max_length=300)
    asset_symbol = models.CharField(max_length=10, default="BTC")
    asset_name = models.CharField(max_length=100, default="Bitcoin")
    historical_start_date = models.DateField()
    historical_end_date = models.DateField()
    accent_color = models.CharField(max_length=7, default="#E8354A")
    lesson_tag = models.CharField(max_length=100)
    difficulty = models.CharField(max_length=20, default="Intermediate")
    real_event_reference = models.TextField()
    is_active = models.BooleanField(default=True)
    order = models.IntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self) -> str:
        return self.title


class ReplayCandle(models.Model):
    scenario = models.ForeignKey(
        ReplayScenario, on_delete=models.CASCADE, related_name="candles"
    )
    date = models.DateTimeField()
    open_pence = models.IntegerField()
    high_pence = models.IntegerField()
    low_pence = models.IntegerField()
    close_pence = models.IntegerField()
    volume = models.BigIntegerField(default=0)


    open_micropence = models.IntegerField(default=0)
    close_micropence = models.IntegerField(default=0)

    class Meta:
        ordering = ["date"]
        unique_together = [("scenario", "date")]

    def __str__(self) -> str:
        return f"{self.scenario.asset_symbol} {self.date} close={self.close_pence}"


class ReplayNewsEvent(models.Model):
    scenario = models.ForeignKey(
        ReplayScenario, on_delete=models.CASCADE, related_name="news_events"
    )
    date = models.DateField()
    headline = models.CharField(max_length=500)
    body = models.TextField()
    impact = models.CharField(
        max_length=10,
        choices=[
            ("low", "Low"),
            ("medium", "Medium"),
            ("high", "High"),
            ("critical", "Critical"),
        ],
    )
    btc_context = models.TextField(blank=True)

    class Meta:
        ordering = ["date"]

    def __str__(self) -> str:
        return f"[{self.date}] {self.headline[:60]}"


class ReplayAttempt(models.Model):
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="replay_attempts"
    )
    scenario = models.ForeignKey(ReplayScenario, on_delete=models.CASCADE)
    attempt_date = models.DateField()
    started_at = models.DateTimeField(auto_now_add=True)
    starting_balance_pence = models.IntegerField(default=1_000_000)
    cash_pence = models.IntegerField(default=1_000_000)
    btc_held_satoshis = models.IntegerField(default=0)
    is_complete = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    action_log = models.JSONField(default=list)
    behaviour_pattern = models.CharField(max_length=50, blank=True)

    class Meta:
        unique_together = [("user", "scenario", "attempt_date")]

    def __str__(self) -> str:
        return f"{self.user} | {self.scenario.title} | {self.attempt_date}"

    def get_simulated_datetime(self) -> datetime.datetime:
        now = timezone.now()


        completed_hours = now.hour
        elapsed_seconds = completed_hours * 3600.0
        elapsed_fraction = elapsed_seconds / 86_400.0

        scenario_start = datetime.datetime.combine(
            self.scenario.historical_start_date,
            datetime.time.min,
            tzinfo=datetime.timezone.utc,
        )
        scenario_end = datetime.datetime.combine(
            self.scenario.historical_end_date,
            datetime.time(23, 59, 59),
            tzinfo=datetime.timezone.utc,
        )

        scenario_seconds = (scenario_end - scenario_start).total_seconds()
        simulated_seconds = elapsed_fraction * scenario_seconds
        result = scenario_start + datetime.timedelta(seconds=simulated_seconds)


        return min(result, scenario_end)

    def get_simulated_date(self) -> datetime.date:
        return self.get_simulated_datetime().date()
