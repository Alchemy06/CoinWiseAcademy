from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("market_replay", "0002_candle_datetime"),
    ]

    operations = [
        migrations.AddField(
            model_name="replaycandle",
            name="open_micropence",
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name="replaycandle",
            name="close_micropence",
            field=models.IntegerField(default=0),
        ),
    ]
