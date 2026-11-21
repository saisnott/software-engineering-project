from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from .wallet_service import ensure_user_wallet


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_wallet_for_new_user(sender, instance, created, raw=False, **kwargs):
    if created and not raw:
        ensure_user_wallet(instance)
