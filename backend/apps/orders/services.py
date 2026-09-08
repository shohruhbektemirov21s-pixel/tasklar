"""Axborot tizimiga o'zgartirish kiritish buyurtmalari bo'yicha bildirishnomalar xizmati."""
import logging
from django.db.models import Q

from apps.accounts.models import GlobalRole, Specialty, User
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify, notify_many

logger = logging.getLogger(__name__)

URL = "/buyurtmalar"


def get_order_notification_recipients(order=None, exclude_id=None):
    """Buyurtma bildirishnomalarini qabul qiluvchilar:
    Sohaviy boshqarmalar xodimlari, tizim ma'murlari (adminlar), boshliq va
    loyiha menejerlari (PM).
    """
    qs = User.objects.filter(
        Q(is_superuser=True)
        | Q(global_role__in=[GlobalRole.ADMIN, GlobalRole.BOSS, GlobalRole.MANAGER, GlobalRole.SOHAVIY])
        | Q(specialty=Specialty.SOHAVIY),
        is_active=True,
    )
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    recipients = list(qs)

    # Agar buyurtma aniq bir loyihaga biriktirilgan bo'lsa va uning o'z menejeri bo'lsa
    if order and getattr(order, "project", None) and order.project.manager:
        pm = order.project.manager
        if pm.is_active and pm.id != exclude_id and pm not in recipients:
            recipients.append(pm)

    return recipients


def notify_order_created(order):
    """Yangi buyurtma (TZ) yaratilganda manfaatdorlarga bildirishnoma yuborish."""
    recipients = get_order_notification_recipients(order=order, exclude_id=order.created_by_id)
    if not recipients:
        return 0

    dept = order.department or "Sohaviy boshqarma"
    sys_name = order.system_name or "TeamFlow"
    prj_name = f" [{order.project.name}]" if getattr(order, "project", None) else ""
    mod = f" ({order.module})" if order.module else ""

    return notify_many(
        recipients,
        NotificationKind.ORDER_NEW,
        title=f"Yangi buyurtma (TZ): {order.request_no}",
        body=f"{dept} — {sys_name}{prj_name}{mod}",
        url=URL,
        actor=order.created_by,
        meta={"order_id": order.pk, "request_no": order.request_no},
    )


def notify_order_status(order, actor, old_status, new_status):
    """Buyurtma holati o'zgarganda muallifga va manfaatdorlarga bildirishnoma yuborish."""
    if not order.created_by:
        return None
    if actor and getattr(actor, "pk", None) == order.created_by_id:
        return None

    status_label = order.get_status_display()
    return notify(
        order.created_by,
        NotificationKind.ORDER_STATUS,
        title=f"Buyurtma holati o'zgardi: {order.request_no}",
        body=f"Yangi holat: {status_label}",
        url=URL,
        actor=actor,
        meta={"order_id": order.pk, "status": new_status, "old_status": old_status},
    )


def notify_pm_decision(order, pm_user):
    """PM buyurtma bo'yicha muddat va holatni belgilaganda buyurtmachiga va dasturchiga bildirishnoma yuborish."""
    parts = [f"Holati: {order.get_status_display()}"]
    if order.assigned_developer:
        parts.append(f"Mas'ul dasturchi: {order.assigned_developer.full_name}")
    if order.pm_estimated_duration:
        parts.append(f"Qanchada tugashi: {order.pm_estimated_duration}")
    if order.pm_deadline:
        parts.append(f"Belgilangan muddat: {order.pm_deadline}")

    body_text = "; ".join(parts)

    if order.created_by and order.created_by_id != pm_user.id:
        notify(
            order.created_by,
            NotificationKind.ORDER_STATUS,
            title=f"Buyurtma holati: {order.request_no}",
            body=f"{pm_user.full_name}: {body_text}",
            url=URL,
            actor=pm_user,
            meta={
                "order_id": order.pk,
                "status": order.status,
                "pm_estimated_duration": order.pm_estimated_duration,
                "pm_deadline": str(order.pm_deadline) if order.pm_deadline else None,
            },
        )

    if order.assigned_developer and order.assigned_developer_id != pm_user.id:
        notify(
            order.assigned_developer,
            NotificationKind.ORDER_STATUS,
            title=f"Sizga yangi buyurtma/topshiriq topshirildi: {order.request_no}",
            body=f"Loyiha: {order.project.name if order.project else order.system_name}. {body_text}",
            url=URL,
            actor=pm_user,
            meta={
                "order_id": order.pk,
                "status": order.status,
                "pm_estimated_duration": order.pm_estimated_duration,
                "pm_deadline": str(order.pm_deadline) if order.pm_deadline else None,
            },
        )


def notify_order_new_version(order, version_obj, actor):
    """Buyurtma (TZ) ning yangi versiyasi yuklanganda PM va manfaatdorlarga bildirishnoma yuborish."""
    recipients = get_order_notification_recipients(order=order, exclude_id=actor.id)
    if not recipients:
        return 0

    prj_name = f" [{order.project.name}]" if getattr(order, "project", None) else ""
    note_preview = f" — «{version_obj.change_note[:80]}»" if version_obj.change_note else ""

    return notify_many(
        recipients,
        NotificationKind.ORDER_NEW,
        title=f"Yangi TZ versiyasi (v{version_obj.version}): {order.request_no}{prj_name}",
        body=f"{actor.full_name} tomonidan yangi versiya yuklandi{note_preview}. PM ko'rib chiqishi kutilmoqda.",
        url=URL,
        actor=actor,
        meta={
            "order_id": order.pk,
            "request_no": order.request_no,
            "version": version_obj.version,
        },
    )

