"""Axborot tizimiga o'zgartirish kiritish buyurtmalari bo'yicha bildirishnomalar xizmati."""
import datetime
import logging
import mimetypes

from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import GlobalRole, Specialty, User
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify, notify_many

from .models import ChangeRequest, ChangeRequestStatus
from .workflow import is_admin_or_boss

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


# ---------------------------------------------------------------- loyiha bilan bog'lash
#
# Buyurtma asosida loyiha ochiladi yoki mavjud loyihaga biriktiriladi. Bu
# qoida ilgari `projects/api.py` da, ikki joyda (yaratish va tahrirlash)
# har xil yozilgan edi: biri holatni shartsiz `ASSIGNED_TO_DEV` qilardi
# (yopilgan buyurtmani ham), ikkinchisi faqat NEW/ACCEPTED dan. Ikkovi ham
# buyurtmaga kim egalik qilishini tekshirmasdi - istalgan menejer boshqa
# PM ning buyurtmasini o'z loyihasiga tortib ola olardi. Ikkovi ham
# istisnoni yutardi - `@transaction.atomic` ichida esa bu tranzaksiyani
# buzadi.
#
# Endi `projects` buyurtmaning ichki tuzilishini bilmaydi: shu ikki
# funksiyani chaqiradi, xolos.

def order_earliest_start(order_id):
    """Loyiha bu buyurtmadan oldin boshlana olmaydi - eng erta sana yoki None."""
    order = ChangeRequest.objects.filter(pk=order_id).first()
    if not order:
        return None
    order_date = order.request_date or (order.created_at.date() if order.created_at else None)
    dates = [d for d in (order.pm_start_date, order_date) if d]
    return min(dates) if dates else None


def _normalize_project_doc_date(project, raw_date):
    """Hujjat sanasini loyiha boshlanish va tugash chegaralariga moslashtiradi."""
    if not raw_date:
        raw_date = timezone.now()
    elif isinstance(raw_date, datetime.date) and not isinstance(raw_date, datetime.datetime):
        raw_date = timezone.make_aware(datetime.datetime.combine(raw_date, datetime.time(12, 0)))
    elif timezone.is_naive(raw_date):
        raw_date = timezone.make_aware(raw_date)

    day = timezone.localtime(raw_date).date()
    if project.start_date and day < project.start_date:
        raw_date = timezone.make_aware(datetime.datetime.combine(project.start_date, datetime.time(12, 0)))
    elif project.due_date and day > project.due_date:
        raw_date = timezone.make_aware(datetime.datetime.combine(project.due_date, datetime.time(12, 0)))
    return raw_date


def _attach_single_file_to_project(project, file_field, original_name, size, description, raw_date, uploaded_by, actor):
    """Bitta faylni loyihaga ProjectFile sifatida saqlaydi yoki nusxalaydi."""
    if not file_field or not getattr(file_field, "name", None):
        return None

    from apps.projects.models import ProjectFile

    filename = (original_name or file_field.name.rsplit("/", 1)[-1])[:255]
    if not filename:
        return None

    # Takrorlanmaslik tekshiruvi: ushbu loyihada ayni nomli faol fayl bo'lsa, qayta yaratilmaydi
    if ProjectFile.objects.filter(project=project, original_name=filename, deleted_at__isnull=True).exists():
        return None

    doc_date = _normalize_project_doc_date(project, raw_date)
    content_type, _ = mimetypes.guess_type(filename)
    content_type = (content_type or "")[:120]
    file_size = size or getattr(file_field, "size", 0) or 0
    user = uploaded_by or actor

    proj_file = ProjectFile(
        project=project,
        original_name=filename,
        size=file_size,
        content_type=content_type,
        description=(description or filename)[:250],
        doc_date=doc_date,
        uploaded_by=user,
        version=1,
    )

    saved = False
    try:
        # Fayl baytlarini ochib, loyihaning o'z saqlash yo'liga nusxalaymiz
        with file_field.open("rb") as f:
            proj_file.file.save(filename, f, save=True)
            saved = True
    except Exception:
        # Fallback: agar open("rb") bo'lmasa, mavjud yo'l orqali biriktiramiz
        try:
            proj_file.file.name = file_field.name
            proj_file.save()
            saved = True
        except Exception:
            logger.exception("Faylni loyihaga biriktirishda xatolik: %s (loyiha: %s)", filename, project.pk)

    if saved:
        return proj_file
    return None


def copy_order_files_to_project(order, project, actor=None):
    """Buyurtmaga biriktirilgan barcha fayllarni (TZ, ilovalar, versiyalar) loyihaga biriktiradi."""
    if not order or not project:
        return []

    created_files = []
    seen_file_names = set()

    # 1. Asosiy TZ fayli
    if order.tz_file:
        tz_name = (order.tz_file_name or order.tz_file.name.rsplit("/", 1)[-1])[:255]
        desc = f"Texnik topshiriq (Buyurtma #{order.id})"
        res = _attach_single_file_to_project(
            project=project,
            file_field=order.tz_file,
            original_name=tz_name,
            size=order.tz_file_size,
            description=desc,
            raw_date=order.request_date or order.created_at,
            uploaded_by=order.created_by,
            actor=actor,
        )
        if res:
            created_files.append(res)
            seen_file_names.add(tz_name.lower())

    # 2. Buyurtmaga biriktirilgan ilovalar (OrderAttachment)
    for att in order.attachments.all():
        if not att.file:
            continue
        att_name = (att.original_name or att.file.name.rsplit("/", 1)[-1])[:255]
        if att_name.lower() in seen_file_names:
            continue
        desc = att.original_name or f"Buyurtma ilovasi (#{order.id})"
        res = _attach_single_file_to_project(
            project=project,
            file_field=att.file,
            original_name=att_name,
            size=att.size,
            description=desc,
            raw_date=att.created_at,
            uploaded_by=att.uploaded_by or order.created_by,
            actor=actor,
        )
        if res:
            created_files.append(res)
            seen_file_names.add(att_name.lower())

    # 3. TZ versiyalaridagi fayllar (ChangeRequestVersion)
    for ver in order.versions.all():
        if not ver.tz_file:
            continue
        ver_name = (ver.tz_file_name or ver.tz_file.name.rsplit("/", 1)[-1])[:255]
        if ver_name.lower() in seen_file_names:
            continue
        desc = f"TZ v{ver.version} (Buyurtma #{order.id}) - {ver.change_note or 'Versiya hujjati'}"
        res = _attach_single_file_to_project(
            project=project,
            file_field=ver.tz_file,
            original_name=ver_name,
            size=ver.tz_file_size,
            description=desc,
            raw_date=ver.created_at,
            uploaded_by=ver.uploaded_by or order.created_by,
            actor=actor,
        )
        if res:
            created_files.append(res)
            seen_file_names.add(ver_name.lower())

    # 4. Kamchilik / Boshqarma fikri hujjati (client_feedback_file)
    if order.client_feedback_file:
        fb_name = (order.client_feedback_file_name or order.client_feedback_file.name.rsplit("/", 1)[-1])[:255]
        if fb_name.lower() not in seen_file_names:
            desc = f"Boshqarma kamchilik TZ hujjati (Buyurtma #{order.id})"
            res = _attach_single_file_to_project(
                project=project,
                file_field=order.client_feedback_file,
                original_name=fb_name,
                size=order.client_feedback_file_size,
                description=desc,
                raw_date=order.client_approved_at or order.updated_at,
                uploaded_by=order.client_approved_by or order.created_by,
                actor=actor,
            )
            if res:
                created_files.append(res)
                seen_file_names.add(fb_name.lower())

    # 5. Tugatilgan ish hujjati (completion_file)
    if order.completion_file:
        comp_name = (order.completion_file_name or order.completion_file.name.rsplit("/", 1)[-1])[:255]
        if comp_name.lower() not in seen_file_names:
            desc = f"Bajarilgan ish hujjati (Buyurtma #{order.id})"
            res = _attach_single_file_to_project(
                project=project,
                file_field=order.completion_file,
                original_name=comp_name,
                size=order.completion_file_size,
                description=desc,
                raw_date=order.completed_at or order.updated_at,
                uploaded_by=order.assigned_pm or actor,
                actor=actor,
            )
            if res:
                created_files.append(res)
                seen_file_names.add(comp_name.lower())

    # Jurnal va realtime xabarlar
    if created_files:
        try:
            from apps.activity.services import log
            log(
                actor=actor or order.created_by,
                verb="project.file",
                project=project,
                target=project,
                summary=f"Buyurtma #{order.id} dan {len(created_files)} ta hujjat biriktirildi",
                detail=", ".join(x.original_name for x in created_files),
                meta={"order_id": order.id, "files": [x.original_name for x in created_files]},
            )
        except Exception:
            logger.exception("Audit log yozishda xatolik")

        try:
            from apps.notifications.services import send_to_users
            active_users = [m.user for m in project.memberships.filter(is_active=True).select_related("user")]
            send_to_users(active_users, {
                "event": "project.update",
                "action": "file",
                "project": project.pk,
                "actor": getattr(actor, "pk", None),
                "count": len(created_files),
            })
        except Exception:
            logger.exception("Realtime signal yuborishda xatolik")

    return created_files


def link_order_to_project(order_id, project, actor, *, created):
    """Buyurtmani loyihaga biriktiradi.

    `created=True` - loyiha shu buyurtma asosida hozirgina ochildi:
    buyurtma egasiga xabar ketadi va joriy TZ versiyasi ham yangilanadi.
    Holat faqat ochiq (NEW/ACCEPTED) buyurtmada `ASSIGNED_TO_DEV` ga
    o'tadi - ishdagi yoki yopilgan buyurtmaning holatiga tegilmaydi.
    """
    order = ChangeRequest.objects.select_for_update().filter(pk=order_id).first()
    if not order:
        raise ValidationError({"order_id": "Buyurtma topilmadi."})
    if order.status == ChangeRequestStatus.DRAFT:
        raise ValidationError({"order_id": "Qoralama buyurtmani loyihaga biriktirib bo'lmaydi."})
    # Allaqachon shu loyihada turgan buyurtma qayta tekshirilmaydi: tahrir
    # formasi uni har saqlashda qayta yuboradi, PM esa keyin almashgan
    # bo'lishi mumkin (`reassign-pm`) - loyihani saqlash to'xtab qolmasin.
    owners = {actor.pk, project.manager_id}
    if (order.project_id != project.pk and order.assigned_pm_id
            and order.assigned_pm_id not in owners and not is_admin_or_boss(actor)):
        raise ValidationError({"order_id": "Bu buyurtma boshqa loyiha menejeriga biriktirilgan."})

    order.project = project
    if not order.assigned_pm_id:
        order.assigned_pm_id = project.manager_id or actor.pk
    moved = order.status in (ChangeRequestStatus.NEW, ChangeRequestStatus.ACCEPTED)
    if moved:
        order.status = ChangeRequestStatus.ASSIGNED_TO_DEV
    order.save(update_fields=["project", "status", "assigned_pm", "updated_at"])

    # Buyurtmaga biriktirilgan barcha fayllarni loyiha hujjatlari sifatida biriktirish
    copy_order_files_to_project(order, project, actor)

    if created and moved:
        cur_ver = order.versions.filter(version=order.version).first()
        if cur_ver:
            cur_ver.status = ChangeRequestStatus.ASSIGNED_TO_DEV
            if not cur_ver.decided_by_id:
                cur_ver.decided_by_id = order.assigned_pm_id
                cur_ver.decided_at = timezone.now()
            cur_ver.save(update_fields=["status", "decided_by", "decided_at"])

    if created and order.created_by:
        try:
            notify(
                order.created_by,
                NotificationKind.TASK_ASSIGNED,
                title="Buyurtmangiz bo'yicha loyiha ochildi",
                body=f"«{project.name}» loyihasi ochildi va ishlar dasturchiga yo'naltirildi.",
                url=f"/loyiha/{project.pk}",
                actor=actor,
                meta={"project": project.pk, "order": order.pk},
            )
        except Exception:
            # Xabar - qo'shimcha. U yiqilsa bog'lash bekor bo'lmasin.
            logger.exception("Loyiha ochilgani haqida xabar yuborilmadi: buyurtma %s", order.pk)
    return order


def unlink_project_orders(project):
    """Loyihadan barcha buyurtmalarni ajratadi (formada buyurtma olib tashlandi)."""
    ChangeRequest.objects.filter(project=project).update(project=None)
