from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

User = get_user_model()

ASSET_CHOICES = [("BTC", "Bitcoin"), ("ETH", "Ethereum")]
DIRECTION_CHOICES = [("up", "Up"), ("down", "Down")]
ACTUAL_DIRECTION_CHOICES = [("up", "Up"), ("down", "Down"), ("flat", "Flat")]
STATUS_CHOICES = [("pending", "Pending"), ("resolved", "Resolved")]
RESULT_CHOICES = [("correct", "Correct"), ("incorrect", "Incorrect")]
CONFIDENCE_CHOICES = [(1, "1 – Not very sure"), (2, "2 – Slightly unsure"), (3, "3 – Neutral"),
                      (4, "4 – Fairly confident"), (5, "5 – Very confident")]
CALIBRATION_CHOICES = [
    ("cautious", "Cautious"),
    ("developing", "Developing"),
    ("well_calibrated", "Well Calibrated"),
    ("overconfident", "Overconfident"),
    ("insufficient_data", "Insufficient Data"),
]

# Allowed timeframe values in minutes — anything else is rejected at validation time.
ALLOWED_TIMEFRAME_MINUTES = {5, 10, 60, 1440, 10080}

TIMEFRAME_LABELS = {5: "5 min", 10: "10 min", 60: "1 hour", 1440: "1 day", 10080: "1 week"}


class Prediction(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="predictions")
    asset = models.CharField(max_length=10, choices=ASSET_CHOICES)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    timeframe_minutes = models.PositiveIntegerField()
    confidence = models.PositiveSmallIntegerField(
        choices=CONFIDENCE_CHOICES,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )

    # Prices — stored as high-precision decimals because crypto can trade above $100k.
    entry_price = models.DecimalField(max_digits=20, decimal_places=6)
    exit_price = models.DecimalField(max_digits=20, decimal_places=6, null=True, blank=True)
    source_currency = models.CharField(max_length=3, default="usd")

    # Timing
    entry_timestamp = models.DateTimeField()
    resolve_at = models.DateTimeField()
    resolved_at = models.DateTimeField(null=True, blank=True)

    # Results — populated on resolution.
    actual_direction = models.CharField(
        max_length=10, choices=ACTUAL_DIRECTION_CHOICES, null=True, blank=True
    )
    price_change_percent = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    result = models.CharField(max_length=10, choices=RESULT_CHOICES, null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")

    # Educational output.
    reflection_text = models.TextField(blank=True)
    calibration_label = models.CharField(
        max_length=20, choices=CALIBRATION_CHOICES, null=True, blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        label = TIMEFRAME_LABELS.get(self.timeframe_minutes, f"{self.timeframe_minutes}m")
        return f"{self.user} | {self.asset} {self.direction} {label} | {self.status}"

    @property
    def timeframe_label(self) -> str:
        return TIMEFRAME_LABELS.get(self.timeframe_minutes, f"{self.timeframe_minutes} min")

    @property
    def is_due(self) -> bool:
        return self.status == "pending" and timezone.now() >= self.resolve_at
