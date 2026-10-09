from django.core.management.base import BaseCommand, CommandError

from quizzes.content_sync import QuizCatalogSyncError, sync_quiz_catalog


class Command(BaseCommand):
    help = "Fetch the quiz catalog from the upstream content API and sync it into the local database."

    def handle(self, *args, **options):
        try:
            # Command-driven sync is the strict path: bubble failures to the shell instead of degrading silently like login hooks do.
            sync_quiz_catalog(force=True)
        except QuizCatalogSyncError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(self.style.SUCCESS("Quiz catalog sync complete."))
