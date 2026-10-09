from rest_framework import serializers

from .models import ALLOWED_TIMEFRAME_MINUTES, Prediction


class PredictionSerializer(serializers.ModelSerializer):
    timeframe_label = serializers.ReadOnlyField()

    class Meta:
        model = Prediction
        fields = [
            "id",
            "asset",
            "direction",
            "timeframe_minutes",
            "timeframe_label",
            "confidence",
            "entry_price",
            "exit_price",
            "source_currency",
            "entry_timestamp",
            "resolve_at",
            "resolved_at",
            "actual_direction",
            "price_change_percent",
            "result",
            "status",
            "reflection_text",
            "calibration_label",
            "created_at",
        ]
        read_only_fields = [
            "id", "entry_price", "exit_price", "source_currency",
            "entry_timestamp", "resolve_at", "resolved_at",
            "actual_direction", "price_change_percent", "result",
            "status", "reflection_text", "calibration_label",
            "timeframe_label", "created_at",
        ]


class PredictionCreateSerializer(serializers.Serializer):
    asset = serializers.ChoiceField(choices=["BTC", "ETH"])
    direction = serializers.ChoiceField(choices=["up", "down"])
    timeframe_minutes = serializers.IntegerField()
    confidence = serializers.IntegerField(min_value=1, max_value=5)

    def validate_timeframe_minutes(self, value: int) -> int:
        if value not in ALLOWED_TIMEFRAME_MINUTES:
            allowed = ", ".join(str(v) for v in sorted(ALLOWED_TIMEFRAME_MINUTES))
            raise serializers.ValidationError(
                f"Invalid timeframe. Allowed values (in minutes): {allowed}."
            )
        return value
