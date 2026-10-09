from django.db import models
from django.contrib.auth.models import User


class Scenario(models.Model):
    title = models.CharField(max_length=200)
    subtitle = models.CharField(max_length=300)
    historical_period = models.CharField(max_length=100)
    lesson_tag = models.CharField(max_length=100)
    accent_color = models.CharField(max_length=7, default='#E8354A')
    starting_balance_pence = models.IntegerField(default=1000000)
    is_active = models.BooleanField(default=True)
    order = models.IntegerField(default=0)

    asset_symbol = models.CharField(max_length=10, default='BTC')
    asset_name = models.CharField(max_length=50, default='Bitcoin')

    chart_log_scale = models.BooleanField(default=False)

    recommended_prerequisite = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='dependents',
    )

    uses_custody_split = models.BooleanField(default=False)

    uses_broker_mechanics = models.BooleanField(default=False)


    asset_unit = models.CharField(max_length=20, default='satoshis')

    asset_unit_label = models.CharField(max_length=20, default='BTC')

    is_multi_asset = models.BooleanField(default=False)


    available_assets = models.JSONField(default=list)

    class Meta:
        app_label = 'covid_crash'
        ordering = ['order']

    def __str__(self):
        return self.title


class ScenarioRound(models.Model):
    scenario = models.ForeignKey(Scenario, on_delete=models.CASCADE, related_name='rounds')
    round_index = models.IntegerField()
    scenario_date = models.DateField()
    price_pence = models.IntegerField()
    context_paragraph = models.TextField()

    structural_signal_text = models.CharField(max_length=300, blank=True, default='')

    wsb_feed_text = models.CharField(max_length=500, blank=True, default='')
    candles = models.JSONField(default=list)


    asset_closing_prices = models.JSONField(default=dict)


    intraday_ticks = models.JSONField(default=list)


    news_flashes = models.JSONField(default=list)

    class Meta:
        app_label = 'covid_crash'
        unique_together = [('scenario', 'round_index')]
        ordering = ['round_index']

    def __str__(self):
        return f"{self.scenario.title} — Round {self.round_index} ({self.scenario_date})"


class ScenarioFinale(models.Model):
    scenario = models.OneToOneField(Scenario, on_delete=models.CASCADE, related_name='finale')
    end_date = models.DateField()
    end_price_pence = models.IntegerField()
    candles = models.JSONField(default=list)


    class Meta:
        app_label = 'covid_crash'

    def __str__(self):
        return f"{self.scenario.title} — Finale ({self.end_date})"


class LessonNarrative(models.Model):
    scenario = models.ForeignKey(Scenario, on_delete=models.CASCADE, related_name='narratives')
    pattern_key = models.CharField(max_length=30)

    headline = models.CharField(max_length=200)
    body_template = models.TextField()

    takeaway = models.CharField(max_length=300)

    class Meta:
        app_label = 'covid_crash'
        unique_together = [('scenario', 'pattern_key')]

    def __str__(self):
        return f"{self.scenario.title} — {self.pattern_key}"


class UserScenarioAttempt(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='covid_crash_attempts')
    scenario = models.ForeignKey(Scenario, on_delete=models.CASCADE)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)


    starting_balance_pence = models.IntegerField()
    cash_pence = models.IntegerField()


    btc_held_satoshis = models.IntegerField(default=0)

    btc_on_ftx_satoshis = models.IntegerField(default=0)
    btc_in_self_custody_satoshis = models.IntegerField(default=0)

    ftx_withdrawals_halted = models.BooleanField(default=False)
    ftx_bankruptcy_triggered = models.BooleanField(default=False)


    broker_choice = models.CharField(max_length=30, blank=True, default='')

    margin_borrowed_pence = models.IntegerField(default=0)

    margin_called_at_round = models.IntegerField(null=True, blank=True)

    broker_pco_active = models.BooleanField(default=False)

    total_commissions_paid_pence = models.IntegerField(default=0)


    asset_holdings = models.JSONField(default=dict)

    current_round_index = models.IntegerField(default=0)
    is_complete = models.BooleanField(default=False)
    action_log = models.JSONField(default=list)


    final_state_snapshot = models.JSONField(default=dict, blank=True)


    class Meta:
        app_label = 'covid_crash'
        ordering = ['-started_at']

    def __str__(self):
        return f"{self.user.username} — {self.scenario.title} ({'complete' if self.is_complete else 'in progress'})"


class UserTradingProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='covid_crash_profile')

    cumulative_balance_pence = models.IntegerField(default=1000000)
    scenarios_completed = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'covid_crash'

    def __str__(self):
        return f"{self.user.username} trading profile"
