from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Profile

User = get_user_model()


@receiver(post_save, sender=User)
def ensure_profile_exists(sender, instance, created, **kwargs):  # noqa: ANN001,ANN003
    if created:
        # Seed a usable display name immediately so the frontend header badge never waits on a manual profile edit.
        Profile.objects.create(user=instance, display_name=instance.email or instance.username)
        return

    # Backfill profiles for legacy users created before the signal/profile model existed.
    Profile.objects.get_or_create(
        user=instance,
        defaults={"display_name": instance.email or instance.username}
    )
