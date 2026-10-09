from django.core.management.base import BaseCommand, CommandError

from quizzes.catalog import CatalogGenerationError, UNIT_SPECS, regenerate_and_publish_catalog


class Command(BaseCommand):
    help = "Regenerate the published content catalog from official GitHub source documents."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force-refresh",
            action="store_true",
            help="Ignore unchanged-source reuse and regenerate every unit with the current quiz generator.",
        )
        parser.add_argument(
            "--units",
            type=str,
            help="Comma-separated unit external ids to regenerate. Untargeted units are reused from the published catalog.",
        )

    def handle(self, *args, **options):
        requested_units = {
            unit_id.strip()
            for unit_id in (options.get("units") or "").split(",")
            if unit_id.strip()
        }
        # Validate requested ids up front so operators fail fast before any network/model work starts.
        valid_unit_ids = {spec.external_id for spec in UNIT_SPECS}
        unknown_unit_ids = sorted(requested_units - valid_unit_ids)
        if unknown_unit_ids:
            raise CommandError(f"Unknown unit ids: {', '.join(unknown_unit_ids)}")

        try:
            catalog = regenerate_and_publish_catalog(
                allow_model_generation=True,
                force_refresh=bool(options.get("force_refresh")),
                target_unit_ids=requested_units or None,
            )
        except CatalogGenerationError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"Catalog regenerate complete. Version: {catalog.version_hash}"
            )
        )
