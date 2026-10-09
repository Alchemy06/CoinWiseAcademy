# Generated manually — changes ReplayCandle.date from DateField to DateTimeField
# so that hourly candles (fetched from CoinGecko) can be stored with sub-day precision.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("market_replay", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="replaycandle",
            name="date",
            field=models.DateTimeField(),
        ),
    ]
