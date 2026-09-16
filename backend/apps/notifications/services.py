"""Bildirishnoma yaratish va uni real vaqtda yetkazish uchun yagona kirish nuqtasi.

Barcha viewlar shu yerdagi `notify()` ni chaqiradi - shunda bildirishnoma
bir xil formatda saqlanadi va WebSocket orqali darrov egasiga boradi.
"""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)


def user_group(user_id):
    """Bitta foydalanuvchining shaxsiy kanali."""
    return "user.{}".format(user_id)


def send_to_user(user_id, payload):
    """Foydalanuvchining ochiq WebSocket ulanishlariga xabar uzatadi.

    Redis ishlamay qolsa ham asosiy amal buzilmasligi kerak - shuning uchun
    xatolik faqat logga yoziladi.
    """
    try:
        layer = get_channel_layer()
        if layer is None:
            return False
        async_to_sync(layer.group_send)(user_group(user_id), {"type": "fanout", "payload": payload})
        return True
    except Exception:
        logger.exception("WebSocket orqali yuborib bo'lmadi: user=%s", user_id)
        return False


def send_to_users(users, payload):
    """Bir nechta odamning shaxsiy kanaliga bir xil xabar uzatadi.

    Bu bildirishnoma EMAS: bazaga hech narsa yozilmaydi va qo'ng'iroq
    chalinmaydi. Bu - ochiq turgan sahifaga "shu joyda nimadir o'zgardi"
    degan kichik signal (masalan doska o'zini yangilashi uchun). Shuning
    uchun uni ko'p yuborish ham xavfsiz.
    """
    sent = 0
    seen = set()
    for user in users:
        uid = getattr(user, "pk", user)
        if not uid or uid in seen:
            continue
        seen.add(uid)
        if send_to_user(uid, payload):
            sent += 1
    return sent


def get_unread_count(user):
    """Foydalanuvchining o'qilmagan bildirishnomalari soni (Redis kesh bilan)."""
    from django.core.cache import cache
    from .models import Notification

    uid = getattr(user, "pk", user)
    if not uid:
        return 0
    key = "notif:unread:{}".format(uid)
    cached = cache.get(key)
    if cached is not None:
        return cached

    count = Notification.objects.filter(recipient_id=uid, is_read=False).count()
    cache.set(key, count, 60)
    return count


def invalidate_unread_count(user_id):
    """Keshni tozalash - yangi bildirishnoma kelganda yoki o'qilganda."""
    from django.core.cache import cache
    if user_id:
        cache.delete("notif:unread:{}".format(user_id))


def serialize(notification):
    from .serializers import NotificationSerializer

    return NotificationSerializer(notification).data


def clip(text, limit):
    """Matnni ustunga sig'diradi - BELGI emas, BAYT bo'yicha.

    Db2 da `CharField(max_length=200)` VARCHAR(200) bo'lib, uning o'lchovi
    baytda. O'zbekcha matnda esa bitta belgi ko'pincha ikki-uch bayt:
    «—», «…», ismlardagi «ʻ». Shu sabab 200 belgilik matn bemalol 400
    baytdan oshib ketardi va yozuv `SQL0302N` (SQLSTATE 22001) bilan
    yiqilardi - bildirishnoma umuman yozilmasdi.

    Kesilgan joyda yarim belgi qolmasin uchun `errors="ignore"` bilan
    qaytariladi: buzuq bayt tashlab yuboriladi.
    """
    data = (text or "").encode("utf-8")
    if len(data) <= limit:
        return text or ""
    return data[:limit].decode("utf-8", "ignore")


def notify(recipient, kind, title, body="", url="", actor=None, meta=None, collapse=False):
    """Bitta odamga bildirishnoma yozadi va darrov yuboradi.

    `collapse=True` bo'lsa (masalan chat xabarlari) - o'sha havola bo'yicha
    o'qilmagan bildirishnoma bor bo'lsa, yangisini yaratmay eskisini yangilaydi.
    Shunda 50 ta chat xabari 50 ta qo'ng'iroq bo'lib qolmaydi.
    """
    from .models import Notification

    if recipient is None or not getattr(recipient, "pk", None):
        return None
    # O'z harakati uchun o'ziga xabar kelmasin.
    if actor is not None and getattr(actor, "pk", None) == recipient.pk:
        return None

    # Dasturchilarga buyurtma (order.*) bildirishnomalari bormasin
    if kind and str(kind).startswith("order."):
        if not getattr(recipient, "can_access_orders", False):
            return None

    try:
        obj = None
        if collapse and url:
            obj = Notification.objects.filter(
                recipient=recipient, kind=kind, url=url, is_read=False).first()

        if obj is not None:
            obj.title = clip(title, 200)
            obj.body = clip(body, 400)
            obj.actor = actor if (actor and getattr(actor, "pk", None)) else None
            obj.meta = meta or {}
            obj.save(update_fields=["title", "body", "actor", "meta"])
        else:
            obj = Notification.objects.create(
                recipient=recipient,
                actor=actor if (actor and getattr(actor, "pk", None)) else None,
                kind=kind, title=clip(title, 200), body=clip(body, 400),
                url=clip(url, 300),
                meta=meta or {},
            )
    except Exception:
        logger.exception("Bildirishnoma yozib bo'lmadi: %s", kind)
        return None

    invalidate_unread_count(obj.recipient_id)
    send_to_user(obj.recipient_id, {"event": "notification", "notification": serialize(obj)})
    _to_telegram(obj)
    return obj


def _to_telegram(notification):
    """Bildirishnomani Telegramga ham uzatadi - bog'langan bo'lsa.

    Alohida funksiyada, chunki qoida bitta: Telegram TASHQI xizmat va u
    ishlamay qolgani uchun bildirishnoma yozilmay qolmasligi kerak.
    Import ham shu yerda - `apps.telegram` yuklanmagan holatda ham
    (masalan tanlab o'chirilganda) `notify()` ishlayversin.
    """
    try:
        from apps.telegram.services import send_notification

        send_notification(notification)
    except Exception:
        logger.exception("Telegramga uzatib bo'lmadi: id=%s", getattr(notification, "pk", None))


def notify_many(recipients, kind, title, body="", url="", actor=None, meta=None, collapse=False):
    """Bir nechta odamga bir xil bildirishnoma."""
    out = []
    seen = set()
    for user in recipients:
        uid = getattr(user, "pk", None)
        if not uid or uid in seen:
            continue
        seen.add(uid)
        obj = notify(user, kind, title, body=body, url=url, actor=actor,
                     meta=meta, collapse=collapse)
        if obj is not None:
            out.append(obj)
    return out


def mark_task_notifications_read(task, user):
    """Foydalanuvchi vazifani ochib ko'rganda, unga tegishli o'qilmagan vazifa bildirishnomalarini o'qilgan deb belgilaydi."""
    from .models import Notification

    if not user or not getattr(user, "pk", None) or not task:
        return 0
    task_pk = getattr(task, "pk", task)
    updated = Notification.objects.filter(
        recipient=user,
        is_read=False,
        url="/vazifa/{}".format(task_pk),
    ).update(is_read=True)
    if updated:
        invalidate_unread_count(user.pk)
    return updated


def check_unopened_task_notifications(now=None, hours=3):
    """Biriktirilganidan so'ng 3 soat ichida ochilmagan vazifalar bo'yicha PMga ogohlantirish yuboradi.

    `(yuborilgan_ogohlantirishlar)` sonini qaytaradi.
    """
    from datetime import timedelta
    from django.utils import timezone
    from apps.projects.models import ProjectRole
    from apps.tasks.models import Task, TaskStatus
    from .models import Notification, NotificationKind

    now = now or timezone.now()
    cutoff = now - timedelta(hours=hours)

    unopened_notifs = (
        Notification.objects.filter(
            kind__in=[NotificationKind.TASK_ASSIGNED, NotificationKind.TASK_REASSIGNED],
            is_read=False,
            created_at__lte=cutoff,
        )
        .select_related("recipient", "actor")
        .order_by("id")
    )

    sent_count = 0
    for notif in unopened_notifs:
        meta = notif.meta or {}
        if meta.get("unopened_warned"):
            continue

        task_id = meta.get("task")
        if not task_id and notif.url and notif.url.startswith("/vazifa/"):
            try:
                task_id = int(notif.url.split("/")[-1])
            except (ValueError, IndexError):
                task_id = None

        if not task_id:
            meta["unopened_warned"] = True
            notif.meta = meta
            notif.save(update_fields=["meta"])
            continue

        task = (
            Task.objects.select_related("project", "project__manager", "created_by")
            .prefetch_related("assignments")
            .filter(pk=task_id, deleted_at__isnull=True)
            .first()
        )

        if not task or task.status in (TaskStatus.DONE, TaskStatus.CANCELLED):
            meta["unopened_warned"] = True
            notif.meta = meta
            notif.save(update_fields=["meta"])
            continue

        # Ijrochi hali ham bu vazifaga biriktirilganligini tekshiramiz
        is_still_assigned = task.assignments.filter(
            user=notif.recipient, is_active=True
        ).exists()
        if not is_still_assigned:
            meta["unopened_warned"] = True
            notif.meta = meta
            notif.save(update_fields=["meta"])
            continue

        # PM yoki mas'ul menejerlarni aniqlaymiz
        managers = set()
        if task.project.manager_id and task.project.manager_id != notif.recipient_id:
            managers.add(task.project.manager)

        if not managers:
            for m in task.project.memberships.filter(
                is_active=True, role__in=[ProjectRole.MANAGER, ProjectRole.ADMIN]
            ).select_related("user"):
                if m.user_id != notif.recipient_id:
                    managers.add(m.user)

        if notif.actor and notif.actor_id != notif.recipient_id:
            if getattr(notif.actor, "is_manager", False) or getattr(notif.actor, "is_boss", False) or getattr(notif.actor, "is_platform_admin", False):
                managers.add(notif.actor)

        if not managers and task.created_by and task.created_by_id != notif.recipient_id:
            managers.add(task.created_by)

        assignee_name = notif.recipient.full_name or notif.recipient.username
        title = "Vazifa ochilmadi: {}".format(assignee_name)
        body = "{} «{} - {}» vazifasini 3 soatdan beri ochib ko'rmadi.".format(
            assignee_name, task.code, task.title
        )
        url = "/vazifa/{}".format(task.pk)
        warn_meta = {
            "task": task.pk,
            "project": task.project_id,
            "assignee_id": notif.recipient_id,
            "assignee_name": assignee_name,
            "original_notification_id": notif.pk,
        }

        for mgr in managers:
            res = notify(
                recipient=mgr,
                kind=NotificationKind.TASK_UNOPENED_WARNING,
                title=title,
                body=body,
                url=url,
                actor=notif.recipient,
                meta=warn_meta,
            )
            if res is not None:
                sent_count += 1

        meta["unopened_warned"] = True
        meta["unopened_warned_at"] = str(now)
        notif.meta = meta
        notif.save(update_fields=["meta"])

    return sent_count

