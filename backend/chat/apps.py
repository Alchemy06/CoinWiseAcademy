from django.apps import AppConfig


class ChatConfig(AppConfig):
    # Register the Django app that owns the stateless chat endpoint.
    default_auto_field = "django.db.models.BigAutoField"
    name = "chat"
