from __future__ import annotations

import json
from copy import deepcopy

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from quizzes.catalog import (
    TRACK_LABELS,
    UNIT_SPECS,
    _compute_version_hash,
    _estimate_minutes,
    _extract_excerpt,
    _fetch_source_document,
    clean_asciidoc_source,
    clean_markdown_source,
    get_published_catalog_or_raise,
    get_static_published_catalog_path,
    project_quiz_catalog,
)
from quizzes.content_sync import sync_quiz_catalog_payload
from quizzes.sanitize import sanitize_snapshot_payload


class Command(BaseCommand):
    help = "Rebuild published lesson markdown from upstream source documents while preserving the current quizzes."

    def handle(self, *args, **options):
        try:
            published_catalog = get_published_catalog_or_raise()
        except Exception as exc:  # noqa: BLE001
            raise CommandError(str(exc)) from exc

        previous_catalog = deepcopy(published_catalog.catalog_json)
        previous_units = {
            unit["external_id"]: unit
            for track in previous_catalog.get("tracks", [])
            for unit in track.get("units", [])
            if isinstance(unit, dict) and isinstance(unit.get("external_id"), str)
        }

        tracks: list[dict[str, object]] = []
        for level in ("beginner", "intermediate", "advanced"):
            units: list[dict[str, object]] = []
            for spec in [candidate for candidate in UNIT_SPECS if candidate.level == level]:
                previous_unit = previous_units.get(spec.external_id)
                if not previous_unit:
                    raise CommandError(f"Published catalog is missing unit {spec.external_id}.")

                source, raw_text = _fetch_source_document(spec)
                if spec.path.endswith(".adoc"):
                    title, body_markdown, body_text = clean_asciidoc_source(raw_text, repo_name=spec.repo_name)
                    learning_format = "asciidoc"
                else:
                    title, body_markdown, body_text = clean_markdown_source(raw_text, repo_name=spec.repo_name)
                    learning_format = "markdown"

                updated_unit = deepcopy(previous_unit)
                updated_unit["title"] = title
                updated_unit["level"] = spec.level
                updated_unit["order_index"] = spec.order_index
                updated_unit["source"] = source
                updated_unit["learning"] = {
                    # Reuse the published unit shell so quizzes, external ids, and any synced metadata survive a markdown-only repair pass.
                    **deepcopy(previous_unit.get("learning") or {}),
                    "format": learning_format,
                    "body_markdown": body_markdown,
                    "body_text": body_text,
                    "excerpt": _extract_excerpt(body_text),
                    "estimated_minutes": _estimate_minutes(body_text),
                    "is_active": True,
                }
                units.append(updated_unit)

            tracks.append(
                {
                    "external_id": f"track-{level}",
                    "title": TRACK_LABELS[level],
                    "level": level,
                    "order_index": ("beginner", "intermediate", "advanced").index(level) + 1,
                    "units": units,
                }
            )

        catalog = {
            "generated_at": timezone.now().isoformat(),
            "tracks": tracks,
        }
        quiz_catalog = project_quiz_catalog(catalog)
        version_hash = _compute_version_hash(catalog, quiz_catalog)

        with transaction.atomic():
            # Persist the relational snapshot and the denormalized published payload together so API readers never observe mixed versions.
            published_catalog.version_hash = version_hash
            published_catalog.catalog_json = catalog
            published_catalog.quiz_catalog_json = quiz_catalog
            published_catalog.published_at = timezone.now()
            published_catalog.save(update_fields=["version_hash", "catalog_json", "quiz_catalog_json", "published_at"])
            sync_quiz_catalog_payload(quiz_catalog)

        payload = sanitize_snapshot_payload(
            {
                "version_hash": version_hash,
                "published_at": published_catalog.published_at.isoformat() if published_catalog.published_at else timezone.now().isoformat(),
                "catalog_json": catalog,
                "quiz_catalog_json": quiz_catalog,
            }
        )
        path = get_static_published_catalog_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        # Rewrite the checked-in snapshot with the same sanitizer path used at runtime so fresh environments bootstrap the repaired markdown immediately.
        path.write_text(json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True), encoding="utf-8")

        self.stdout.write(self.style.SUCCESS(f"Learning markdown repaired and snapshot updated at {path}"))
