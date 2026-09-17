"""Axborot tizimiga o'zgartirish kiritish buyurtmalari bo'yicha bildirishnomalar xizmati."""
import logging
from django.db.models import Q

from apps.accounts.models import GlobalRole, Specialty, User
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify, notify_many

logger = logging.getLogger(__name__)


def order_url(order):
    order_id = getattr(order, "pk", None) or getattr(order, "id", None) or order
    return f"/buyurtma/{order_id}"


def get_order_notification_recipients(order=None, exclude_id=None):
    """Buyurtmaga bevosita aloqador foydalanuvchilar (realtime va bildirishnoma uchun):
    - Buyurtma egasi (order.created_by)
    - Mas'ul PM (order.assigned_pm)
    - Loyiha menejeri (order.project.manager)
    - Mas'ul dasturchi (order.assigned_developer)
    - Agar PM tayinlanmagan bo'lsa: IT boshqaruvchilari.
    Boshqa aloqasiz sohaviy boshqarma xodimlariga MUTLAQO bormaydi."""
    recipients = []
    if order:
        if order.created_by and order.created_by_id != exclude_id:
            recipients.append(order.created_by)
        if getattr(order, "assigned_pm", None):
            pm = order.assigned_pm
            if pm.is_active and pm.id != exclude_id and pm not in recipients:
                recipients.append(pm)
        if getattr(order, "project", None) and order.project.manager:
            pm = order.project.manager
            if pm.is_active and pm.id != exclude_id and pm not in recipients:
                recipients.append(pm)
        if getattr(order, "assigned_developer", None):
            dev = order.assigned_developer
            if dev.is_active and dev.id != exclude_id and dev not in recipients:
                recipients.append(dev)

    # Agar hali birorta ham PM / mas'ul bo'lmasa, IT ma'muriyatiga
    if not any(getattr(u, "global_role", None) in [GlobalRole.ADMIN, GlobalRole.BOSS, GlobalRole.MANAGER] for u in recipients):
        qs = User.objects.filter(
            Q(is_superuser=True) | Q(global_role__in=[GlobalRole.ADMIN, GlobalRole.BOSS, GlobalRole.MANAGER]),
            is_active=True,
        ).exclude(global_role=GlobalRole.DEVELOPER).exclude(global_role=GlobalRole.SOHAVIY)
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)
        for u in qs:
            if getattr(u, "can_access_orders", False) and u not in recipients:
                recipients.append(u)

    return recipients


def get_order_pm_recipients(order=None, exclude_id=None):
    """Yangi buyurtma tushganda yoki buyurtmachi yangi TZ versiyasini yuklaganda
    bildirishnoma oluvchi mas'ul PM yoki IT ma'muriyati.
    Faqat ushbu buyurtmaga mas'ul PM yoki loyiha menejeriga boradi.
    Agar hali PM biriktirilmagan bo'lsa (yangi buyurtmada), IT boshqaruvchilariga boradi.
    Sohaviy boshqarmalarga MUTLAQO bormaydi."""
    recipients = []

    # 1. Buyurtmaga biriktirilgan aniq PM
    if order and getattr(order, "assigned_pm", None):
        pm = order.assigned_pm
        if pm.is_active and pm.id != exclude_id:
            recipients.append(pm)

    # 2. Agar buyurtma loyihaga biriktirilgan bo'lsa va unda PM bo'lsa
    if order and getattr(order, "project", None) and order.project.manager:
        pm = order.project.manager
        if pm.is_active and pm.id != exclude_id and pm not in recipients:
            recipients.append(pm)

    # 3. Agar hali aniq mas'ul PM bo'lmasa (masalan, yangi buyurtma endi tushganda),
    # buyurtmalarni qabul qiluvchi IT menejerlari va adminlarga yuboramiz
    if not recipients:
        qs = User.objects.filter(
            Q(is_superuser=True)
            | Q(global_role__in=[GlobalRole.ADMIN, GlobalRole.BOSS, GlobalRole.MANAGER]),
            is_active=True,
        ).exclude(global_role=GlobalRole.DEVELOPER).exclude(global_role=GlobalRole.SOHAVIY)

        if exclude_id:
            qs = qs.exclude(pk=exclude_id)

        for u in qs:
            if getattr(u, "can_access_orders", False) and u not in recipients:
                recipients.append(u)

    return recipients


def notify_order_created(order):
    """Yangi buyurtma (TZ) yaratilganda/yuborilganda IT ma'murlariga va mas'ul PMga bildirishnoma yuborish.
    Boshqa sohaviy boshqarma xodimlariga bormaydi."""
    recipients = get_order_pm_recipients(order=order, exclude_id=order.created_by_id)
    if not recipients:
        return 0

    dept = order.department or "Sohaviy boshqarma"
    sys_name = order.system_name or "TeamFlow"
    prj_name = f" [{order.project.name}]" if getattr(order, "project", None) else ""
    mod = f" ({order.module})" if order.module else ""

    return notify_many(
        recipients,
        NotificationKind.ORDER_NEW,
        title=f"Yangi buyurtma (TZ): {order.system_name}",
        body=f"{dept} — {sys_name}{prj_name}{mod}",
        url=order_url(order),
        actor=order.created_by,
        meta={"order_id": order.pk},
    )


def notify_order_status(order, actor, old_status, new_status):
    """Buyurtma holati o'zgarganda FAQAT buyurtma yaratuvchisiga bildirishnoma yuborish."""
    if not order.created_by:
        return None
    if actor and getattr(actor, "pk", None) == order.created_by_id:
        return None

    status_label = order.get_status_display()
    return notify(
        order.created_by,
        NotificationKind.ORDER_STATUS,
        title=f"Buyurtma holati o'zgardi: {order.system_name}",
        body=f"Yangi holat: {status_label}",
        url=order_url(order),
        actor=actor,
        meta={"order_id": order.pk, "status": new_status, "old_status": old_status},
    )


def notify_pm_decision(order, pm_user):
    """PM buyurtma bo'yicha muddat va holatni belgilaganda FAQAT buyurtmachiga bildirishnoma yuborish."""
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
            title=f"Buyurtma holati: {order.system_name}",
            body=f"{pm_user.full_name}: {body_text}",
            url=order_url(order),
            actor=pm_user,
            meta={
                "order_id": order.pk,
                "status": order.status,
                "pm_estimated_duration": order.pm_estimated_duration,
                "pm_deadline": str(order.pm_deadline) if order.pm_deadline else None,
            },
        )


def notify_order_new_version(order, version_obj, actor):
    """Buyurtma (TZ) ning yangi versiyasi yuklanganda FAQAT mas'ul PMga bildirishnoma yuborish.
    Boshqa sohaviy xodimlarga va begona PMlarga bormaydi."""
    recipients = get_order_pm_recipients(order=order, exclude_id=actor.id)
    if not recipients:
        return 0

    prj_name = f" [{order.project.name}]" if getattr(order, "project", None) else ""
    note_preview = f" — «{version_obj.change_note[:80]}»" if version_obj.change_note else ""

    return notify_many(
        recipients,
        NotificationKind.ORDER_NEW,
        title=f"Yangi TZ versiyasi (v{version_obj.version}): {order.system_name}{prj_name}",
        body=f"{actor.full_name} tomonidan yangi versiya yuklandi{note_preview}. PM ko'rib chiqishi kutilmoqda.",
        url=order_url(order),
        actor=actor,
        meta={
            "order_id": order.pk,
            "version": version_obj.version,
        },
    )


def notify_order_completion_submitted(order, actor):
    """PM tugatilgan ish hujjati bilan boshqarmaga topshirganda FAQAT buyurtmachiga bildirishnoma boradi."""
    recipients = []
    if order.created_by and order.created_by_id != actor.id:
        recipients.append(order.created_by)

    if not recipients:
        return 0

    return notify_many(
        recipients,
        NotificationKind.ORDER_STATUS,
        title=f"Ish yakunlandi va tasdiqlash uchun topshirildi: {order.system_name}",
        body=f"{actor.full_name} ishni yakunladi va tugatilgan ish hujjatini biriktirdi. Iltimos, tekshirib tasdiqlang yoki kamchilik bo'lsa qaytaring.",
        url=order_url(order),
        actor=actor,
        meta={"order_id": order.pk, "status": order.status},
    )


def notify_order_client_approved(order, actor):
    """Boshqarma ishni tasdiqlab qabul qilganda (yopilganda) FAQAT mas'ul PM va dasturchiga bildirishnoma boradi."""
    recipients = []
    if order.assigned_pm and order.assigned_pm_id != actor.id:
        recipients.append(order.assigned_pm)
    if order.assigned_developer and order.assigned_developer_id != actor.id and order.assigned_developer not in recipients:
        recipients.append(order.assigned_developer)

    if not recipients:
        return 0

    return notify_many(
        recipients,
        NotificationKind.ORDER_STATUS,
        title=f"Boshqarma ishni tasdiqladi va qabul qildi: {order.system_name}",
        body=f"{actor.full_name} tomonidan bajarilgan ish to'liq tasdiqlandi va buyurtma muvaffaqiyatli yakunlandi.",
        url=order_url(order),
        actor=actor,
        meta={"order_id": order.pk, "status": order.status},
    )


def notify_order_completion_rejected(order, actor, feedback_note):
    """Boshqarma ishda kamchilik aniqlab qayta ishlashga yuborganda FAQAT mas'ul PMga bildirishnoma boradi."""
    recipients = []
    if order.assigned_pm and order.assigned_pm_id != actor.id:
        recipients.append(order.assigned_pm)

    if not recipients:
        return 0

    note_text = f": «{feedback_note[:100]}»" if feedback_note else "."

    return notify_many(
        recipients,
        NotificationKind.ORDER_STATUS,
        title=f"Ishda kamchilik aniqlandi (Qayta ishlashga): {order.system_name}",
        body=f"Boshqarma vakili ({actor.full_name}) kamchiliklarni ko'rsatib ishni qayta tugatishga yubordi{note_text}",
        url=order_url(order),
        actor=actor,
        meta={"order_id": order.pk, "status": order.status, "feedback_note": feedback_note},
    )


def notify_order_version_approved(order, version_obj, actor, decision_note=""):
    """PM yangi TZ versiyasini tasdiqlaganda FAQAT buyurtmachi va versiyani yuklaganga bildirishnoma boradi."""
    recipients = []
    if order.created_by and order.created_by_id != actor.id:
        recipients.append(order.created_by)
    if version_obj.uploaded_by and version_obj.uploaded_by_id != actor.id and version_obj.uploaded_by not in recipients:
        recipients.append(version_obj.uploaded_by)

    if not recipients:
        return 0

    note = (version_obj.decision_note or decision_note or order.pm_notes or "").strip()
    body = note if note else f"PM ({actor.full_name}) yangi TZ versiyasini tasdiqladi."

    return notify_many(
        recipients,
        NotificationKind.ORDER_STATUS,
        title=f"Yangi TZ versiyasi tasdiqlandi (v{version_obj.version}): {order.system_name}",
        body=body,
        url=order_url(order),
        actor=actor,
        meta={"order_id": order.pk, "version": version_obj.version, "status": "ACCEPTED", "decision_note": note},
    )


def notify_order_version_rejected(order, version_obj, actor, reason):
    """PM yangi TZ versiyasini rad etganda FAQAT buyurtmachi va versiyani yuklaganga bildirishnoma boradi."""
    recipients = []
    if order.created_by and order.created_by_id != actor.id:
        recipients.append(order.created_by)
    if version_obj.uploaded_by and version_obj.uploaded_by_id != actor.id and version_obj.uploaded_by not in recipients:
        recipients.append(version_obj.uploaded_by)

    if not recipients:
        return 0

    reason_clean = (reason or "").strip()
    body = reason_clean if reason_clean else f"PM ({actor.full_name}) TZ versiyasini rad etdi."
    return notify_many(
        recipients,
        NotificationKind.ORDER_STATUS,
        title=f"Yangi TZ versiyasi rad etildi (v{version_obj.version}): {order.system_name}",
        body=body,
        url=order_url(order),
        actor=actor,
        meta={"order_id": order.pk, "version": version_obj.version, "reason": reason_clean, "status": "REJECTED"},
    )
