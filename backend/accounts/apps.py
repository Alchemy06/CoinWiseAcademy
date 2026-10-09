from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "accounts"

    def ready(self) -> None:
        # Import signal registrations at app boot so every newly created User gets a Profile automatically.
        from . import signals  # noqa: F401
