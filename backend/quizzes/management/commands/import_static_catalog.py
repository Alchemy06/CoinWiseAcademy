from django.core.management.base import BaseCommand, CommandError

from quizzes.catalog import bootstrap_published_catalog_from_static_snapshot


class Command(BaseCommand):
    help = "Load the repository static quiz catalog snapshot into the local database."

    def handle(self, *args, **options):
        # Import is intentionally bootstrap-only; it should not silently clobber an already populated quiz database.
        catalog = bootstrap_published_catalog_from_static_snapshot()
        if catalog is None:
            raise CommandError("No static quiz catalog snapshot is available to import.")
        self.stdout.write(self.style.SUCCESS(f"Static quiz catalog imported. Version: {catalog.version_hash}"))
