from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):

    def handle(self, *args, **options):
        steps = [
            ("seed_covid_crash",        "Crash 1 — The COVID Crash"),
            ("seed_luna_collapse",      "Crash 2 — The Luna Collapse"),
            ("seed_ftx_collapse",       "Crash 3 — The FTX Collapse"),
            ("seed_gamestop_squeeze",   "Crash 4 — The GameStop Short Squeeze"),
            ("seed_gfc_2008",           "Crash 5 — The Great Financial Crisis"),
            ("seed_market_replay",      "Market Replay scenarios"),
        ]

        for command, label in steps:
            self.stdout.write(self.style.MIGRATE_HEADING(f"\n{label}"))
            try:
                call_command(command)
            except Exception as exc:
                self.stdout.write(
                    self.style.ERROR(f"  Failed: {exc}")
                )
                raise

        self.stdout.write(
            self.style.SUCCESS("\nAll scenarios seeded. Lobbies are ready.")
        )
