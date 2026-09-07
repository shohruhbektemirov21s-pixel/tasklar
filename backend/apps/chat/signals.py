from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.projects.models import ProjectMember
from apps.workspaces.models import WorkspaceMember
from .services import invalidate_can_read


@receiver([post_save, post_delete], sender=ProjectMember)
def on_project_member_changed(sender, instance, **kwargs):
    if instance.user_id and instance.project_id:
        invalidate_can_read(instance.user_id, project_id=instance.project_id)


@receiver([post_save, post_delete], sender=WorkspaceMember)
def on_workspace_member_changed(sender, instance, **kwargs):
    if instance.user_id and instance.workspace_id:
        invalidate_can_read(instance.user_id, workspace_id=instance.workspace_id)
