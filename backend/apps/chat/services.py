"""Chat xabarini xonadagi barcha ochiq ulanishlarga tarqatish."""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def members_of(*, project=None, workspace=None):
    """Xona a'zolari - bildirishnoma kimga ketishini shu belgilaydi."""
    if project is not None:
        return [m.user for m in project.memberships.filter(is_active=True).select_related("user")]
    if workspace is not None:
        return [m.user for m in workspace.memberships.select_related("user")]
    return []


def get_can_read_cache_key(user_id, *, project_id=None, workspace_id=None, partner_id=None):
    if partner_id is not None:
        return "chat:can_read:u{}:dir:{}".format(user_id, partner_id)
    if project_id is not None:
        return "chat:can_read:u{}:prj:{}".format(user_id, project_id)
    if workspace_id is not None:
        return "chat:can_read:u{}:ws:{}".format(user_id, workspace_id)
    return None


def invalidate_can_read(user_id, *, project_id=None, workspace_id=None, partner_id=None):
    from django.core.cache import cache
    key = get_can_read_cache_key(user_id, project_id=project_id,
                                 workspace_id=workspace_id, partner_id=partner_id)
    if key:
        cache.delete(key)


def can_read(user, *, project=None, workspace=None, partner=None):
    """Shu suhbatni o'qiy oladimi.

    Loyiha va ish maydoni suhbati - JAMOA ichida. Istisno faqat hamma
    loyihada hamma amalni bajaradiganlarda (`runs_everything`: tizim
    admini va boshliq).

    1000+ bir vaqtda foydalanuvchilar yuklamasida Db2 ga minglab tekshiruv
    so'rovlari tushmasligi uchun natija Redis keshida (60 soniya) saqlanadi.
    """
    from django.core.cache import cache

    from apps.projects.permissions import manages_all_projects, runs_everything

    if not user or not user.is_authenticated:
        return False

    user_id = getattr(user, "pk", None)
    partner_id = getattr(partner, "pk", partner) if partner is not None else None
    project_id = getattr(project, "pk", project) if project is not None else None
    workspace_id = getattr(workspace, "pk", workspace) if workspace is not None else None

    cache_key = get_can_read_cache_key(user_id, project_id=project_id,
                                       workspace_id=workspace_id, partner_id=partner_id)
    if cache_key:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

    allowed = False
    if partner_id is not None:
        partner_obj = partner if hasattr(partner, "is_active") else None
        if partner_obj is None:
            from django.contrib.auth import get_user_model
            partner_obj = get_user_model().objects.filter(pk=partner_id, is_active=True).first()
        allowed = bool(partner_obj and partner_obj.is_active and partner_obj.pk != user.pk)
    elif runs_everything(user):
        allowed = True
    elif project_id is not None:
        if manages_all_projects(user):
            allowed = True
        else:
            from apps.projects.models import ProjectMember
            allowed = ProjectMember.objects.filter(
                project_id=project_id, user_id=user_id, is_active=True).exists()
    elif workspace_id is not None:
        from apps.workspaces.models import WorkspaceMember
        allowed = WorkspaceMember.objects.filter(
            workspace_id=workspace_id, user_id=user_id).exists()

    if cache_key:
        cache.set(cache_key, allowed, 60)

    return allowed


def _send(message, payload):
    """Xona guruhiga uzatadi. Redis yiqilsa ham asosiy amal buzilmaydi."""
    try:
        layer = get_channel_layer()
        if layer is None:
            return False
        async_to_sync(layer.group_send)(
            message.room, {"type": "fanout", "payload": payload})
        return True
    except Exception:
        logger.exception("Chat signalini tarqatib bo'lmadi: %s", message.pk)
        return False


def broadcast(message):
    """Yangi xabarni xonadagi barcha ochiq ulanishlarga uzatadi."""
    from .serializers import ChatMessageSerializer

    return _send(message, {"event": "chat.message",
                           "message": ChatMessageSerializer(message).data})


def broadcast_delete(message):
    """Xabar o'chirilganini xonaga bildiradi.

    Ilgari o'chirish faqat bazaga tegardi: boshqalarning ochiq turgan
    suhbat oynasida xabar sahifa yangilanmaguncha turaverardi.
    """
    return _send(message, {"event": "chat.deleted", "id": message.pk,
                           "room": message.room})
