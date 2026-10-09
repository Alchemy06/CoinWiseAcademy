from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from quizzes.catalog import get_published_catalog_or_raise, get_static_published_catalog_path
from quizzes.content_sync import sync_quiz_catalog_payload
from quizzes.sanitize import sanitize_snapshot_payload


class Command(BaseCommand):
    help = "Repair visible quiz text artifacts in the current published catalog and static snapshot without regenerating."

    def handle(self, *args, **options):
        try:
            catalog = get_published_catalog_or_raise()
        except Exception as exc:  # noqa: BLE001
            raise CommandError(str(exc)) from exc

        # Repair both DB and snapshot from one sanitized payload so future exports/imports do not reintroduce old artifacts.
        payload = sanitize_snapshot_payload(
            {
                "version_hash": catalog.version_hash,
                "published_at": catalog.published_at.isoformat() if catalog.published_at else timezone.now().isoformat(),
                "catalog_json": catalog.catalog_json,
                "quiz_catalog_json": catalog.quiz_catalog_json,
            }
        )

        catalog.catalog_json = payload["catalog_json"]
        catalog.quiz_catalog_json = payload["quiz_catalog_json"]
        catalog.save(update_fields=["catalog_json", "quiz_catalog_json"])
        sync_quiz_catalog_payload(payload["quiz_catalog_json"])

        path = get_static_published_catalog_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True), encoding="utf-8")

        self.stdout.write(self.style.SUCCESS(f"Catalog artifacts repaired and snapshot updated at {path}"))
