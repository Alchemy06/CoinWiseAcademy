from django.core.management.base import BaseCommand, CommandError

from quizzes.content_sync import QuizCatalogSyncError, sync_quiz_catalog


class Command(BaseCommand):
    help = "Compatibility wrapper that syncs the quiz catalog from the upstream content API."

    def handle(self, *args, **options):
        try:
            sync_quiz_catalog(force=True)
        except QuizCatalogSyncError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(self.style.SUCCESS("Quiz path sync complete."))
