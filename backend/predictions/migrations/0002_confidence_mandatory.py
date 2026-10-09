from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ("predictions", "0001_initial"),
    ]

    operations = [
        # Step 1: backfill any existing null confidence values to 3 (neutral).
        migrations.RunSQL(
            sql="UPDATE predictions_prediction SET confidence = 3 WHERE confidence IS NULL;",
            reverse_sql=migrations.RunSQL.noop,
        ),
        # Step 2: make the column NOT NULL and add validators.
        migrations.AlterField(
            model_name="prediction",
            name="confidence",
            field=models.PositiveSmallIntegerField(
                choices=[
                    (1, "1 – Not very sure"),
                    (2, "2 – Slightly unsure"),
                    (3, "3 – Neutral"),
                    (4, "4 – Fairly confident"),
                    (5, "5 – Very confident"),
                ],
                validators=[
                    django.core.validators.MinValueValidator(1),
                    django.core.validators.MaxValueValidator(5),
                ],
            ),
        ),
    ]
