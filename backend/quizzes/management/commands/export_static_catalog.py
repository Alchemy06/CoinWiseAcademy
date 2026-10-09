from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError

from quizzes.catalog import get_published_catalog_or_raise, get_static_published_catalog_path
from quizzes.sanitize import sanitize_snapshot_payload


class Command(BaseCommand):
    help = "Export the current published quiz catalog into the repository static snapshot file."

    def handle(self, *args, **options):
        try:
            catalog = get_published_catalog_or_raise()
        except Exception as exc:  # noqa: BLE001
            raise CommandError(str(exc)) from exc

        path = get_static_published_catalog_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        # Re-sanitize on export so the repository snapshot stays clean even if older database rows predate current cleanup logic.
        payload = sanitize_snapshot_payload(
            {
                "version_hash": catalog.version_hash,
                "published_at": catalog.published_at.isoformat() if catalog.published_at else None,
                "catalog_json": catalog.catalog_json,
                "quiz_catalog_json": catalog.quiz_catalog_json,
            }
        )
        path.write_text(json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True), encoding="utf-8")
        self.stdout.write(self.style.SUCCESS(f"Static quiz catalog exported to {path}"))
