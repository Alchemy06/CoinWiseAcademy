from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from quizzes.answer_balance import rebalance_catalog_payload
from quizzes.catalog import _compute_version_hash, get_published_catalog_or_raise, get_static_published_catalog_path, project_quiz_catalog
from quizzes.content_sync import sync_quiz_catalog_payload
from quizzes.sanitize import sanitize_snapshot_payload


class Command(BaseCommand):
    help = "Rebalance correct answer positions in the published quiz catalog without regenerating quiz content."

    def handle(self, *args, **options):
        try:
            published_catalog = get_published_catalog_or_raise()
        except Exception as exc:  # noqa: BLE001
            raise CommandError(str(exc)) from exc

        # Rebuild both catalog shapes from the same rebalanced source so snapshot, DB JSON, and relational sync stay aligned.
        rebalanced_catalog_json = rebalance_catalog_payload(published_catalog.catalog_json)
        rebalanced_quiz_catalog_json = project_quiz_catalog(rebalanced_catalog_json)
        version_hash = _compute_version_hash(rebalanced_catalog_json, rebalanced_quiz_catalog_json)
        published_at = timezone.now()

        published_catalog.catalog_json = rebalanced_catalog_json
        published_catalog.quiz_catalog_json = rebalanced_quiz_catalog_json
        published_catalog.version_hash = version_hash
        published_catalog.published_at = published_at
        published_catalog.save(update_fields=["catalog_json", "quiz_catalog_json", "version_hash", "published_at"])

        sync_quiz_catalog_payload(rebalanced_quiz_catalog_json)

        snapshot_path = get_static_published_catalog_path()
        snapshot_path.parent.mkdir(parents=True, exist_ok=True)
        # Persist the repaired version immediately so future bootstrap/import flows inherit the balanced answer positions.
        snapshot_payload = sanitize_snapshot_payload(
            {
                "version_hash": version_hash,
                "published_at": published_at.isoformat(),
                "catalog_json": rebalanced_catalog_json,
                "quiz_catalog_json": rebalanced_quiz_catalog_json,
            }
        )
        snapshot_path.write_text(json.dumps(snapshot_payload, ensure_ascii=True, indent=2, sort_keys=True), encoding="utf-8")

        self.stdout.write(self.style.SUCCESS(f"Quiz answer positions rebalanced and snapshot updated at {snapshot_path}"))
