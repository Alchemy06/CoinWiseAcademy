from django.conf import settings
from django.db import models


class Conversation(models.Model):
    # The client generates ids up front so guest and authenticated flows can refer to the same conversation seamlessly.
    id = models.CharField(primary_key=True, max_length=80)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="conversations",
        null=True,
        blank=True
    )
    # guest_id temporarily owns anonymous conversations until they are merged into a real user account.
    guest_id = models.CharField(max_length=80, blank=True, default="")
    title = models.CharField(max_length=120, default="New Chat")
    summary = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_message_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Order newest conversations first so list endpoints can be rendered directly by the history UI.
        ordering = ["-last_message_at", "-updated_at"]

    def __str__(self) -> str:
        return self.title


class ChatMessage(models.Model):
    # Persist individual turns so authenticated users can reopen full history without sending it back from the client.
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    role = models.CharField(max_length=20)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Preserve transcript order exactly as it was generated so the frontend can render without re-sorting heuristics.
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.role}: {self.content[:40]}"
