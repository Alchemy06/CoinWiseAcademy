"""
0004 — GameStop Short Squeeze (Scenario 4) field additions.

Adds:
  Scenario.uses_broker_mechanics
  Scenario.asset_unit
  Scenario.asset_unit_label
  ScenarioRound.wsb_feed_text
  UserScenarioAttempt.broker_choice
  UserScenarioAttempt.margin_borrowed_pence
  UserScenarioAttempt.margin_called_at_round
  UserScenarioAttempt.broker_pco_active
  UserScenarioAttempt.total_commissions_paid_pence

All fields are additive with safe defaults — existing S1/S2/S3 rows are
unaffected (they will have empty/zero/False for all new fields).
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('covid_crash', '0003_ftx_custody_fields'),
    ]

    operations = [
        # ── Scenario: broker mechanics flag + asset unit ─────────────────────
        migrations.AddField(
            model_name='scenario',
            name='uses_broker_mechanics',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='scenario',
            name='asset_unit',
            field=models.CharField(default='satoshis', max_length=20),
        ),
        migrations.AddField(
            model_name='scenario',
            name='asset_unit_label',
            field=models.CharField(default='BTC', max_length=20),
        ),

        # ── ScenarioRound: WSB sentiment feed text ───────────────────────────
        migrations.AddField(
            model_name='scenarioround',
            name='wsb_feed_text',
            field=models.CharField(blank=True, default='', max_length=500),
        ),

        # ── UserScenarioAttempt: broker/margin fields ────────────────────────
        migrations.AddField(
            model_name='userscenarioattempt',
            name='broker_choice',
            field=models.CharField(blank=True, default='', max_length=30),
        ),
        migrations.AddField(
            model_name='userscenarioattempt',
            name='margin_borrowed_pence',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='userscenarioattempt',
            name='margin_called_at_round',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='userscenarioattempt',
            name='broker_pco_active',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='userscenarioattempt',
            name='total_commissions_paid_pence',
            field=models.IntegerField(default=0),
        ),
    ]
