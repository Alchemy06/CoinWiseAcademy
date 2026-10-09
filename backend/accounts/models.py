from django.conf import settings
from django.db import models


class Profile(models.Model):
    # Keep auth-facing profile data separate from Django's built-in User so course-specific fields can grow independently.
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    display_name = models.CharField(max_length=150)
    # Reserved for future email-verification UX while already matching the frontend auth payload shape.
    email_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.display_name or self.user.get_username()
