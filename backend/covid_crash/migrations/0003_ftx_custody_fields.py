"""
0003 — FTX Collapse (Scenario 3) field additions.

Adds:
  Scenario.uses_custody_split
  UserScenarioAttempt.btc_on_ftx_satoshis
  UserScenarioAttempt.btc_in_self_custody_satoshis
  UserScenarioAttempt.ftx_withdrawals_halted
  UserScenarioAttempt.ftx_bankruptcy_triggered

Data migration: copies existing btc_held_satoshis → btc_in_self_custody_satoshis
for all existing attempts so Scenario 1 & 2 attempts remain correct.
The old btc_held_satoshis column is kept but no longer written to by new code.
"""

from django.db import migrations, models


def copy_btc_to_self_custody(apps, schema_editor):
    """Backfill btc_in_self_custody_satoshis from the old btc_held_satoshis."""
    Attempt = apps.get_model('covid_crash', 'UserScenarioAttempt')
    Attempt.objects.filter(btc_in_self_custody_satoshis=0, btc_held_satoshis__gt=0).update(
        btc_in_self_custody_satoshis=models.F('btc_held_satoshis')
    )


class Migration(migrations.Migration):

    dependencies = [
        ('covid_crash', '0002_scenario2_fields'),
    ]

    operations = [
        # ── Scenario: custody split flag ─────────────────────────────────────
        migrations.AddField(
            model_name='scenario',
            name='uses_custody_split',
            field=models.BooleanField(default=False),
        ),

        # ── UserScenarioAttempt: custody split BTC fields ────────────────────
        migrations.AddField(
            model_name='userscenarioattempt',
            name='btc_on_ftx_satoshis',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='userscenarioattempt',
            name='btc_in_self_custody_satoshis',
            field=models.IntegerField(default=0),
        ),

        # ── UserScenarioAttempt: FTX state flags ─────────────────────────────
        migrations.AddField(
            model_name='userscenarioattempt',
            name='ftx_withdrawals_halted',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='userscenarioattempt',
            name='ftx_bankruptcy_triggered',
            field=models.BooleanField(default=False),
        ),

        # ── Data migration ────────────────────────────────────────────────────
        migrations.RunPython(
            copy_btc_to_self_custody,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
