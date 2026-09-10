import logging
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .export import generate_order_docx
from .models import (
    ChangeRequest,
    ChangeRequestPriority,
    ChangeRequestStatus,
    ChangeRequestType,
    ChangeRequestVersion,
    OrderAttachment,
)
from .serializers import ChangeRequestSerializer, PMDecisionSerializer, OrderAttachmentSerializer
from .services import (
    notify_order_created,
    notify_order_new_version,
    notify_order_status,
    notify_pm_decision,
    notify_order_completion_submitted,
    notify_order_client_approved,
    notify_order_completion_rejected,
    notify_order_version_approved,
    notify_order_version_rejected,
)

logger = logging.getLogger(__name__)


class CanAccessOrders(permissions.BasePermission):
    """Buyurtmalar bo'limini Sohaviy boshqarmalar, PM (loyiha menejerlari), Boshliq va adminlar ko'ra oladi.

    Lekin yangi buyurtma yaratish (POST) faqat Sohaviy boshqarmalar (va admin/boshliq) ga ruxsat etiladi.
    Loyiha menejeri (PM) yangi buyurtma yarata olmaydi.
    """
    message = "Buyurtmalar bo'limi Sohaviy boshqarmalar va loyiha menejerlari uchun mo'ljallangan."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False

        can_access = bool(
            user.is_platform_admin
            or getattr(user, "is_boss", False)
            or getattr(user, "is_manager", False)
            or getattr(user, "can_access_orders", False)
            or getattr(user, "is_sohaviy_boshqarma", False)
        )
        if not can_access:
            return False

        # Yangi buyurtma yaratish (POST create) faqat sohaviy boshqarma va admin/boss uchun.
        # PM yangi buyurtma yarata olmaydi.
        if request.method == "POST" and getattr(view, "action", "") == "create":
            is_sohaviy_or_admin = bool(
                getattr(user, "is_sohaviy_boshqarma", False)
                or user.is_platform_admin
                or getattr(user, "is_boss", False)
            )
            if not is_sohaviy_or_admin:
                self.message = "Yangi buyurtma (TZ) yaratish faqat sohaviy boshqarma vakillariga ruxsat etilgan. PM buyurtma yarata olmaydi."
                return False

        return True


# Ruxsat etilgan xavfsiz fayl turlari (whitelist)
ALLOWED_ORDER_EXTENSIONS = {
    "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "rtf",
    "zip", "rar", "7z",
    "png", "jpg", "jpeg", "webp",
}
MAX_ORDER_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


def validate_order_file(file_obj):
    """Buyurtma ilovasi / TZ faylini xavfsizlik va hajm bo'yicha tekshirish."""
    name = getattr(file_obj, "name", "") or ""
    size = getattr(file_obj, "size", 0) or 0
    if not name or size == 0:
        raise ValidationError({"detail": "Yuklangan fayl bo'sh yoki uning nomi mavjud emas."})
    if size > MAX_ORDER_UPLOAD_BYTES:
        raise ValidationError({"detail": f"Fayl hajmi juda katta: {MAX_ORDER_UPLOAD_BYTES // (1024 * 1024)} MB dan oshmasin ({name})."})
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if not ext or ext not in ALLOWED_ORDER_EXTENSIONS:
        raise ValidationError({
            "detail": f"«.{ext}» formatidagi fayllarni yuklash taqiqlangan. "
                      "Faqat PDF, Word, Excel, ZIP va rasmlar (PNG, JPG) qabul qilinadi."
        })
    return file_obj


def validate_order_files(file_list):
    for f in file_list:
        validate_order_file(f)


class ChangeRequestViewSet(viewsets.ModelViewSet):
    """Axborot tizimiga o'zgartirish kiritish buyurtmalari (TZ) API-si."""

    queryset = (
        ChangeRequest.objects.all()
        .select_related("created_by", "project", "project__manager", "assigned_pm", "assigned_developer", "linked_task")
        .prefetch_related("versions__uploaded_by", "versions__decided_by", "attachments__uploaded_by")
    )
    serializer_class = ChangeRequestSerializer
    permission_classes = [permissions.IsAuthenticated, CanAccessOrders]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "priority", "department", "module", "project", "assigned_pm", "assigned_developer", "order_type"]
    search_fields = [
        "request_no",
        "system_name",
        "module",
        "department",
        "responsible_person",
        "requested_change",
        "project__name",
        "project__key",
        "assigned_developer__full_name",
    ]
    ordering_fields = [
        "request_date",
        "priority",
        "order_type",
        "status",
        "created_at",
        "due_date",
        "pm_deadline",
    ]
    ordering = ["-created_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        mine = self.request.query_params.get("mine")
        for_pm = self.request.query_params.get("for_pm")
        type_param = (
            self.request.query_params.get("order_type")
            or self.request.query_params.get("project_type")
            or self.request.query_params.get("type")
        )
        if type_param:
            qs = qs.filter(order_type=type_param)

        from django.db.models import Q
        is_admin_or_boss = bool(
            user.is_authenticated
            and (user.is_platform_admin or getattr(user, "is_boss", False))
        )
        is_sohaviy = bool(
            user.is_authenticated
            and (
                getattr(user, "is_sohaviy_boshqarma", False)
                or getattr(user, "specialty", "") == "SOHAVIY"
                or getattr(user, "global_role", "") == "SOHAVIY"
            )
        )

        if is_sohaviy and not is_admin_or_boss:
            # Sohaviy boshqarma vakili faqat o'zining yoki o'z boshqarmasining buyurtmalarini ko'radi.
            # DRAFT holatidagi buyurtmalar faqat uni yaratgan shaxsga ko'rinadi!
            sohaviy_q = Q(created_by=user)
            if getattr(user, "department_id", None) and user.department:
                sohaviy_q |= (
                    (Q(department__iexact=user.department.name) | Q(created_by__department=user.department))
                    & ~Q(status=ChangeRequestStatus.DRAFT)
                )
            elif getattr(user, "department_name", None) and user.department_name != "Sohaviy boshqarmalar":
                sohaviy_q |= (Q(department__iexact=user.department_name) & ~Q(status=ChangeRequestStatus.DRAFT))
            qs = qs.filter(sohaviy_q)
        else:
            if for_pm and user.is_authenticated:
                qs = qs.filter(Q(assigned_pm=user) | Q(project__manager=user)).exclude(status=ChangeRequestStatus.DRAFT)
            elif mine and user.is_authenticated:
                mine_q = Q(created_by=user) | Q(assigned_pm=user) | Q(project__manager=user)
                if getattr(user, "department_id", None) and user.department:
                    mine_q |= (
                        (Q(department__iexact=user.department.name) | Q(created_by__department=user.department))
                        & ~Q(status=ChangeRequestStatus.DRAFT)
                    )
                qs = qs.filter(mine_q)

        if not is_admin_or_boss:
            qs = qs.exclude(Q(status=ChangeRequestStatus.DRAFT) & ~Q(created_by=user))

        deadline_param = self.request.query_params.get("deadline")
        if deadline_param:
            import datetime
            today = timezone.localdate()
            if deadline_param.upper() == "OVERDUE":
                qs = qs.filter(
                    Q(pm_deadline__lt=today) | Q(pm_deadline__isnull=True, due_date__lt=today)
                ).exclude(status__in=[ChangeRequestStatus.COMPLETED, ChangeRequestStatus.REJECTED])
            elif deadline_param.upper() == "TODAY":
                qs = qs.filter(
                    Q(pm_deadline=today) | Q(pm_deadline__isnull=True, due_date=today)
                )
            elif deadline_param.upper() == "WEEK":
                next_week = today + datetime.timedelta(days=7)
                qs = qs.filter(
                    Q(pm_deadline__gte=today, pm_deadline__lte=next_week)
                    | Q(pm_deadline__isnull=True, due_date__gte=today, due_date__lte=next_week)
                )
            elif deadline_param.upper() == "URGENT":
                qs = qs.filter(priority__in=[ChangeRequestPriority.URGENT, ChangeRequestPriority.HIGH])

        period_param = self.request.query_params.get("period")
        metric_param = self.request.query_params.get("metric")
        if period_param:
            import datetime
            now_dt = timezone.localtime()
            today = now_dt.date()
            start = None
            end = None

            if period_param in ("month", "this_month"):
                first_day = today.replace(day=1)
                start = timezone.make_aware(datetime.datetime.combine(first_day, datetime.time.min))
            elif period_param == "last_month":
                first_of_this_month = today.replace(day=1)
                last_day_of_last_month = first_of_this_month - datetime.timedelta(days=1)
                first_of_last_month = last_day_of_last_month.replace(day=1)
                start = timezone.make_aware(datetime.datetime.combine(first_of_last_month, datetime.time.min))
                end = timezone.make_aware(datetime.datetime.combine(first_of_this_month, datetime.time.min))
            elif period_param in ("6_months", "6months", "half_year"):
                start_date = today - datetime.timedelta(days=180)
                start = timezone.make_aware(datetime.datetime.combine(start_date, datetime.time.min))
            elif period_param in ("year", "1_year", "1year"):
                start_date = today - datetime.timedelta(days=365)
                start = timezone.make_aware(datetime.datetime.combine(start_date, datetime.time.min))
            elif period_param == "week":
                from apps.core.periods import _period_start
                start = _period_start("week")

            if start:
                if end:
                    qs = qs.filter(created_at__gte=start, created_at__lt=end)
                else:
                    qs = qs.filter(created_at__gte=start)

            if metric_param == "submitted":
                pass
            elif metric_param in ("approved", "in_progress"):
                qs = qs.filter(
                    status__in=[
                        ChangeRequestStatus.ACCEPTED,
                        ChangeRequestStatus.ASSIGNED_TO_DEV,
                        ChangeRequestStatus.IN_PROGRESS,
                        ChangeRequestStatus.TESTING,
                        ChangeRequestStatus.READY_FOR_REVIEW,
                    ],
                )
            elif metric_param == "completed":
                qs = qs.filter(
                    Q(completed_at__gte=start)
                    | Q(client_approved_at__gte=start)
                    | Q(status=ChangeRequestStatus.COMPLETED)
                )
            elif metric_param == "rejected":
                qs = qs.filter(status=ChangeRequestStatus.REJECTED)
        elif metric_param:
            if metric_param == "rejected":
                qs = qs.filter(status=ChangeRequestStatus.REJECTED)
            elif metric_param in ("pending", "waiting", "new"):
                qs = qs.filter(status=ChangeRequestStatus.NEW)
            elif metric_param in ("in_progress", "progress"):
                qs = qs.filter(
                    status__in=[
                        ChangeRequestStatus.ACCEPTED,
                        ChangeRequestStatus.ASSIGNED_TO_DEV,
                        ChangeRequestStatus.IN_PROGRESS,
                        ChangeRequestStatus.TESTING,
                        ChangeRequestStatus.READY_FOR_REVIEW,
                    ]
                )
            elif metric_param == "ready_for_review":
                qs = qs.filter(status=ChangeRequestStatus.READY_FOR_REVIEW)
            elif metric_param == "completed":
                qs = qs.filter(status=ChangeRequestStatus.COMPLETED)

        return qs

    def _save_order_attachments(self, order):
        user = self.request.user if self.request.user.is_authenticated else None
        uploaded_files = []
        for key in ("files", "attachments"):
            for f in self.request.FILES.getlist(key):
                if f not in uploaded_files:
                    uploaded_files.append(f)

        single_tz = self.request.FILES.get("tz_file")
        if single_tz and single_tz not in uploaded_files:
            uploaded_files.append(single_tz)

        if uploaded_files:
            validate_order_files(uploaded_files)

        for f in uploaded_files:
            OrderAttachment.objects.create(
                order=order,
                file=f,
                original_name=getattr(f, "name", "")[:255],
                size=getattr(f, "size", 0),
                uploaded_by=user,
            )

        if not order.tz_file and uploaded_files:
            first_f = uploaded_files[0]
            order.tz_file = first_f
            order.tz_file_name = getattr(first_f, "name", "")[:255]
            order.tz_file_size = getattr(first_f, "size", 0)
            order.save(update_fields=["tz_file", "tz_file_name", "tz_file_size"])

    def perform_create(self, serializer):
        user = self.request.user
        is_sohaviy_or_admin = bool(
            getattr(user, "is_sohaviy_boshqarma", False)
            or user.is_platform_admin
            or getattr(user, "is_boss", False)
        )
        if not is_sohaviy_or_admin:
            raise ValidationError({"detail": "Yangi buyurtma (TZ) yaratish faqat sohaviy boshqarma vakillariga ruxsat etilgan. PM buyurtma yarata olmaydi."})

        with transaction.atomic():
            order = serializer.save(created_by=user)
            self._save_order_attachments(order)
            if order.tz_file and order.status != ChangeRequestStatus.DRAFT:
                ChangeRequestVersion.objects.create(
                    order=order,
                    version=1,
                    tz_file=order.tz_file,
                    tz_file_name=order.tz_file_name,
                    tz_file_size=order.tz_file_size,
                    change_note="Dastlabki yuborilgan TZ (v1)",
                    status=order.status,
                    uploaded_by=self.request.user,
                )

        # Agar buyurtma DRAFT bo'lsa, bildirishnoma yuborilmaydi ("junab ketib qolmasin")
        if order.status != ChangeRequestStatus.DRAFT:
            try:
                notify_order_created(order)
                from apps.notifications.services import send_to_users
                from .services import get_order_notification_recipients
                all_users = get_order_notification_recipients(order=order)
                if order.created_by:
                    all_users.append(order.created_by)
                send_to_users(all_users, {"event": "order.create", "order_id": order.pk})
            except Exception:
                logger.exception("Buyurtma yaratilganda bildirishnoma yuborishda xatolik: %s", order.pk)

    def perform_update(self, serializer):
        instance = serializer.instance
        user = self.request.user
        is_admin_or_boss = bool(user.is_platform_admin or getattr(user, "is_boss", False))

        # Agar buyurtma allaqachon yuborilgan bo'lsa (ya'ni DRAFT emas):
        # Na boshqarma, na PM buyurtmani to'g'ridan-to'g'ri tahrirlay oladi!
        if instance.status != ChangeRequestStatus.DRAFT and not is_admin_or_boss:
            raise ValidationError(
                {"detail": "Yuborilgan yoki qabul qilingan buyurtmani tahrirlab bo'lmaydi. Faqat qoralama (draft) holatidagi buyurtmani tahrirlash mumkin."}
            )

        # Agar DRAFT bo'lsa, faqat uni yaratgan shaxs tahrirlay oladi
        if instance.status == ChangeRequestStatus.DRAFT and not is_admin_or_boss and instance.created_by_id != user.id:
            raise ValidationError(
                {"detail": "Faqat buyurtmani yaratgan foydalanuvchi qoralamani tahrirlashi mumkin."}
            )

        old_status = instance.status
        with transaction.atomic():
            order = serializer.save()
            self._save_order_attachments(order)
        new_status = order.status

        # Agar qoralamadan NEW (yuborilgan) holatiga o'tkazilgan bo'lsa:
        if old_status == ChangeRequestStatus.DRAFT and new_status == ChangeRequestStatus.NEW:
            order.request_date = timezone.localdate()
            order.save(update_fields=["request_date", "updated_at"])
            if order.tz_file and not order.versions.exists():
                ChangeRequestVersion.objects.create(
                    order=order,
                    version=1,
                    tz_file=order.tz_file,
                    tz_file_name=order.tz_file_name,
                    tz_file_size=order.tz_file_size,
                    change_note="Dastlabki yuborilgan TZ (v1)",
                    status=order.status,
                    uploaded_by=user,
                )
            try:
                notify_order_created(order)
                from apps.notifications.services import send_to_users
                from .services import get_order_notification_recipients
                all_users = get_order_notification_recipients(order=order)
                if order.created_by:
                    all_users.append(order.created_by)
                send_to_users(all_users, {"event": "order.create", "order_id": order.pk})
            except Exception:
                pass
        elif old_status != new_status:
            try:
                notify_order_status(order, self.request.user, old_status, new_status)
            except Exception:
                logger.exception("Buyurtma holati o'zgarganda bildirishnoma yuborishda xatolik: %s", order.pk)

        try:
            from apps.notifications.services import send_to_users
            from .services import get_order_notification_recipients
            all_users = get_order_notification_recipients(order=order)
            if order.created_by:
                all_users.append(order.created_by)
            send_to_users(all_users, {"event": "order.update", "order_id": order.pk})
        except Exception:
            pass

    def perform_destroy(self, instance):
        user = self.request.user
        is_admin_or_boss = bool(user.is_platform_admin or getattr(user, "is_boss", False))

        # Yuborilgan buyurtmani o'chirish taqiqlanadi (PM ga ham, boshqarmaga ham)
        if instance.status != ChangeRequestStatus.DRAFT and not is_admin_or_boss:
            raise ValidationError(
                {"detail": "Yuborilgan buyurtmani o'chirib bo'lmaydi. Faqat qoralama (draft) holatidagi buyurtmani o'chirish mumkin."}
            )

        # Faqat o'zining DRAFT ini o'chira oladi
        if not is_admin_or_boss and instance.created_by_id != user.id:
            raise ValidationError(
                {"detail": "Faqat qoralamani yaratgan foydalanuvchi yoki tizim administratori o'chira oladi."}
            )

        order_pk = instance.pk
        super().perform_destroy(instance)
        try:
            from apps.notifications.services import send_to_users
            from .services import get_order_notification_recipients
            all_users = get_order_notification_recipients()
            send_to_users(all_users, {"event": "order.delete", "order_id": order_pk})
        except Exception:
            pass

    @action(detail=True, methods=["post"], url_path="send")
    def send_order(self, request, pk=None):
        """Qoralama holatidagi buyurtmani rasman yuborish."""
        order = self.get_object()
        user = request.user
        is_admin_or_boss = bool(user.is_platform_admin or getattr(user, "is_boss", False))

        if not is_admin_or_boss and order.created_by_id != user.id:
            return Response({"detail": "Faqat buyurtmani yaratgan foydalanuvchi uni yuborishi mumkin."}, status=403)

        if order.status != ChangeRequestStatus.DRAFT:
            return Response({"detail": "Ushbu buyurtma allaqachon yuborilgan."}, status=400)

        if not (order.system_name and order.system_name.strip()):
            return Response({"detail": "Tizim nomi ko'rsatilishi shart."}, status=400)

        with transaction.atomic():
            order.status = ChangeRequestStatus.NEW
            order.request_date = timezone.localdate()
            order.save(update_fields=["status", "request_date", "updated_at"])

            if order.tz_file and not order.versions.exists():
                ChangeRequestVersion.objects.create(
                    order=order,
                    version=1,
                    tz_file=order.tz_file,
                    tz_file_name=order.tz_file_name,
                    tz_file_size=order.tz_file_size,
                    change_note="Dastlabki yuborilgan TZ (v1)",
                    status=order.status,
                    uploaded_by=user,
                )

        try:
            notify_order_created(order)
            from apps.notifications.services import send_to_users
            from .services import get_order_notification_recipients
            all_users = get_order_notification_recipients(order=order)
            if order.created_by:
                all_users.append(order.created_by)
            send_to_users(all_users, {"event": "order.create", "order_id": order.pk})
        except Exception:
            logger.exception("Buyurtma yuborilganda bildirishnomada xatolik: %s", order.pk)

        return Response(ChangeRequestSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="attachments")
    def add_attachments(self, request, pk=None):
        order = self.get_object()
        user = request.user
        is_admin_or_boss = bool(user.is_platform_admin or getattr(user, "is_boss", False))
        if not is_admin_or_boss and order.created_by_id != user.id:
            return Response({"detail": "Fayl biriktirish huquqi yo'q."}, status=403)
        if order.status not in (ChangeRequestStatus.NEW, ChangeRequestStatus.REJECTED) and not is_admin_or_boss:
            return Response({"detail": "Qabul qilingan buyurtmaga fayl qo'shib bo'lmaydi."}, status=400)

        uploaded_files = []
        for key in ("files", "attachments"):
            for f in request.FILES.getlist(key):
                if f not in uploaded_files:
                    uploaded_files.append(f)
        single_tz = request.FILES.get("tz_file") or request.FILES.get("file")
        if single_tz and single_tz not in uploaded_files:
            uploaded_files.append(single_tz)

        if not uploaded_files:
            return Response({"detail": "Fayl tanlanmagan."}, status=400)

        validate_order_files(uploaded_files)

        created = []
        with transaction.atomic():
            for f in uploaded_files:
                att = OrderAttachment.objects.create(
                    order=order,
                    file=f,
                    original_name=getattr(f, "name", "")[:255],
                    size=getattr(f, "size", 0),
                    uploaded_by=user,
                )
                created.append(att)

            if not order.tz_file and uploaded_files:
                first_f = uploaded_files[0]
                order.tz_file = first_f
                order.tz_file_name = getattr(first_f, "name", "")[:255]
                order.tz_file_size = getattr(first_f, "size", 0)
                order.save(update_fields=["tz_file", "tz_file_name", "tz_file_size"])

        return Response(OrderAttachmentSerializer(created, many=True).data, status=201)

    @action(detail=True, methods=["delete"], url_path=r"attachments/(?P<attachment_id>\d+)")
    def delete_attachment(self, request, pk=None, attachment_id=None):
        order = self.get_object()
        user = request.user
        is_admin_or_boss = bool(user.is_platform_admin or getattr(user, "is_boss", False))
        if not is_admin_or_boss and order.created_by_id != user.id:
            return Response({"detail": "Faylni o'chirish huquqi yo'q."}, status=403)
        if order.status not in (ChangeRequestStatus.NEW, ChangeRequestStatus.REJECTED) and not is_admin_or_boss:
            return Response({"detail": "Qabul qilingan buyurtma faylini o'chirib bo'lmaydi."}, status=400)

        try:
            att = order.attachments.get(pk=attachment_id)
            att.file.delete(save=False)
            att.delete()
            return Response(status=204)
        except OrderAttachment.DoesNotExist:
            return Response({"detail": "Fayl topilmadi."}, status=404)

    @action(detail=True, methods=["post"], url_path="claim-order")
    def claim_order(self, request, pk=None):
        """Loyiha menejeri (PM) yangi yoki ochiq buyurtmani o'z zimmasiga olishi (biriktirishi)."""
        user = request.user
        is_pm_or_admin = bool(
            user.is_platform_admin
            or getattr(user, "is_boss", False)
            or getattr(user, "is_manager", False)
            or getattr(user, "specialty", "") == "PM"
            or getattr(user, "global_role", "") == "MANAGER"
        )
        if not is_pm_or_admin:
            return Response(
                {"detail": "Faqat loyiha menejeri (PM) yoki admin buyurtmani qabul qila oladi."},
                status=403,
            )

        order = self.get_object()

        # Agar bu buyurtmani allaqachon boshqa PM olgan bo'lsa:
        if order.assigned_pm_id and order.assigned_pm_id != user.id:
            if not (user.is_platform_admin or getattr(user, "is_boss", False)):
                raise ValidationError(
                    {"detail": f"Ushbu buyurtmani allaqachon boshqa loyiha menejeri ({order.assigned_pm.full_name}) o'z zimmasiga olgan. Boshqa PM bu ishni ololmaydi."}
                )

        with transaction.atomic():
            order.assigned_pm = user
            role_label = getattr(user, "get_global_role_display", lambda: "PM")()
            order.executor_signer = f"{user.full_name} ({role_label})"
            if order.status == ChangeRequestStatus.NEW:
                order.status = ChangeRequestStatus.ACCEPTED

            if "pm_estimated_duration" in request.data:
                order.pm_estimated_duration = request.data.get("pm_estimated_duration") or ""
            if "pm_deadline" in request.data and request.data.get("pm_deadline"):
                order.pm_deadline = request.data.get("pm_deadline")
            if "pm_notes" in request.data:
                order.pm_notes = request.data.get("pm_notes") or ""
            if "assigned_developer" in request.data:
                dev_id = request.data.get("assigned_developer")
                order.assigned_developer_id = dev_id if dev_id else None
                if dev_id and order.status == ChangeRequestStatus.ACCEPTED:
                    order.status = ChangeRequestStatus.ASSIGNED_TO_DEV

            order.save()

            cur_ver = order.versions.filter(version=order.version).first()
            if cur_ver:
                cur_ver.decided_by = user
                cur_ver.decided_at = timezone.now()
                if order.status == ChangeRequestStatus.ACCEPTED:
                    cur_ver.status = ChangeRequestStatus.ACCEPTED
                cur_ver.save()

        try:
            notify_pm_decision(order, user)
        except Exception:
            logger.exception("PM qabul qilishi bildirishnomasida xatolik: %s", order.pk)

        return Response(ChangeRequestSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="set-pm-decision")
    def set_pm_decision(self, request, pk=None):
        """PM (Loyiha menejeri) qarori, baholangan muddati va holatini belgilash."""
        user = request.user
        is_pm_or_admin = bool(
            user.is_platform_admin
            or getattr(user, "is_boss", False)
            or getattr(user, "is_manager", False)
        )
        if not is_pm_or_admin:
            return Response(
                {"detail": "Faqat loyiha menejeri (PM), boshliq yoki admin muddat va qaror belgilay oladi."},
                status=403,
            )

        order = self.get_object()

        # Agar bu buyurtmani allaqachon boshqa PM olgan bo'lsa:
        if order.assigned_pm_id and order.assigned_pm_id != user.id:
            if not (user.is_platform_admin or getattr(user, "is_boss", False)):
                raise ValidationError(
                    {"detail": f"Ushbu buyurtmani {order.assigned_pm.full_name} o'z zimmasiga olgan. Boshqa PM unga qaror yoki muddat belgilay olmaydi."}
                )

        serializer = PMDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if data["status"] == ChangeRequestStatus.COMPLETED:
            raise ValidationError(
                {"status": "Ishni to'g'ridan-to'g'ri yakunlab bo'lmaydi. Tugatilgan ish haqidagi hujjatni yuklab, boshqarma tasdig'iga yuborishingiz kerak."}
            )

        with transaction.atomic():
            order.status = data["status"]
            if "pm_estimated_duration" in data:
                order.pm_estimated_duration = data["pm_estimated_duration"]
            if "pm_deadline" in data:
                order.pm_deadline = data["pm_deadline"]
            if "pm_notes" in data:
                order.pm_notes = data["pm_notes"]
            if "assigned_developer" in data:
                order.assigned_developer = data["assigned_developer"]
            if "linked_task" in data:
                order.linked_task = data["linked_task"]

            if data.get("executor_signer"):
                order.executor_signer = data["executor_signer"]
            else:
                role_label = getattr(user, "get_global_role_display", lambda: "PM")()
                order.executor_signer = f"{user.full_name} ({role_label})"

            order.assigned_pm = user
            order.save()

            # Joriy versiyani ham yangilash
            cur_ver = order.versions.filter(version=order.version).first()
            if cur_ver:
                cur_ver.status = data["status"]
                cur_ver.decided_by = user
                cur_ver.decided_at = timezone.now()
                cur_ver.decision_note = data.get("pm_notes", "")
                cur_ver.save()

        try:
            notify_pm_decision(order, user)
        except Exception:
            logger.exception("PM qarori bildirishnomasini yuborishda xatolik: %s", order.pk)

        return Response(ChangeRequestSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="submit-completion")
    def submit_completion(self, request, pk=None):
        """PM ishni bajarib bo'lgach, tugatilgan ish hujjati bilan boshqarmaga topshirishi."""
        user = request.user
        is_pm_or_admin = bool(
            user.is_platform_admin
            or getattr(user, "is_boss", False)
            or getattr(user, "is_manager", False)
        )
        if not is_pm_or_admin:
            return Response(
                {"detail": "Faqat loyiha menejeri (PM) yoki admin tugatilgan ish haqida hujjat topshira oladi."},
                status=403,
            )

        order = self.get_object()

        # Agar bu buyurtmani allaqachon boshqa PM olgan bo'lsa:
        if order.assigned_pm_id and order.assigned_pm_id != user.id:
            if not (user.is_platform_admin or getattr(user, "is_boss", False)):
                raise ValidationError(
                    {"detail": f"Ushbu buyurtmani {order.assigned_pm.full_name} o'z zimmasiga olgan. Faqat mas'ul PM tugatilgan ish hisobotini topshira oladi."}
                )
        completion_file = request.FILES.get("completion_file")
        completion_note = (request.data.get("completion_note") or "").strip()

        if not completion_file and not completion_note:
            raise ValidationError({"completion_file": "Tugatilgan ish haqidagi hujjatni (fayl/rasm) yoki hisobot izohini kiriting."})

        if completion_file:
            from apps.core.uploads import check_upload
            check_upload(completion_file)

        with transaction.atomic():
            if completion_file:
                order.completion_file = completion_file
                order.completion_file_name = getattr(completion_file, "name", "")[:255]
                order.completion_file_size = getattr(completion_file, "size", 0)
            if completion_note:
                order.completion_note = completion_note

            order.completed_at = timezone.now()
            order.status = ChangeRequestStatus.READY_FOR_REVIEW
            order.save()

        try:
            notify_order_completion_submitted(order, user)
        except Exception:
            logger.exception("Tugatish xabarini yuborishda xatolik: %s", order.pk)

        return Response(ChangeRequestSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="client-approve")
    def client_approve(self, request, pk=None):
        """Boshqarma vakili bajarilgan ishni tasdiqlab, buyurtmani yakunlashi (yopishi)."""
        user = request.user
        order = self.get_object()

        can_approve = bool(
            getattr(user, "is_sohaviy_boshqarma", False)
            or user.is_platform_admin
            or getattr(user, "is_boss", False)
            or (order.created_by_id == user.id)
        )
        if not can_approve:
            return Response(
                {"detail": "Faqat buyurtmachi boshqarma vakili yoki admin ishni tasdiqlab yakunlay oladi."},
                status=403,
            )

        with transaction.atomic():
            order.status = ChangeRequestStatus.COMPLETED
            order.client_approved_at = timezone.now()
            order.client_approved_by = user
            dept_name = getattr(user, "department_name", "") or "Boshqarma"
            signer = request.data.get("client_signer") or f"{user.full_name} ({dept_name})"
            order.client_signer = signer[:200]
            if request.data.get("note"):
                order.test_result = request.data["note"]
            order.save()

        try:
            notify_order_client_approved(order, user)
        except Exception:
            logger.exception("Boshqarma tasdiq bildirishnomasini yuborishda xatolik: %s", order.pk)

        return Response(ChangeRequestSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="client-reject-completion")
    def client_reject_completion(self, request, pk=None):
        """Boshqarma kamchilik / xatolik aniqlaganda ishni qayta tugatishga yuborishi."""
        user = request.user
        order = self.get_object()

        can_reject = bool(
            getattr(user, "is_sohaviy_boshqarma", False)
            or user.is_platform_admin
            or getattr(user, "is_boss", False)
            or (order.created_by_id == user.id)
        )
        if not can_reject:
            return Response(
                {"detail": "Faqat buyurtmachi boshqarma vakili yoki admin kamchiliklarni ko'rsatib qaytara oladi."},
                status=403,
            )

        feedback_note = (request.data.get("feedback_note") or "").strip()
        if not feedback_note:
            raise ValidationError({"feedback_note": "Qaytarish sababi yoki aniqlangan kamchilik/xatolikni yozing."})

        with transaction.atomic():
            order.status = ChangeRequestStatus.IN_PROGRESS
            order.client_feedback_note = feedback_note
            order.save()

        try:
            notify_order_completion_rejected(order, user, feedback_note)
        except Exception:
            logger.exception("Qaytarish bildirishnomasini yuborishda xatolik: %s", order.pk)

        return Response(ChangeRequestSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="upload-version")
    def upload_version(self, request, pk=None):
        """Boshqarma tomonidan yangi TZ versiyasini (v2, v3...) yuborish.

        Ushbu versiya PM ko'rib chiqishi uchun NEW (kutilmoqda) holatida saqlanadi.
        Eski versiyadagi TZ PM yangi versiyani tasdiqlagunga qadar amalda qoladi.
        """
        user = request.user
        order = self.get_object()

        # Buyurtma yakunlangan yoki rad etilgan bo'lsa yangi versiya yuklanmaydi
        if order.status in [ChangeRequestStatus.COMPLETED, ChangeRequestStatus.REJECTED]:
            raise ValidationError({"detail": "Yakunlangan yoki rad etilgan buyurtmaga yangi versiya yuborib bo'lmaydi."})

        # Huquq tekshiruvi: faqat buyurtmachi (boshqarma), sohaviy yoki admin/boss
        is_owner = order.created_by_id == user.id
        is_sohaviy = bool(getattr(user, "is_sohaviy_boshqarma", False) or getattr(user, "specialty", "") == "SOHAVIY")
        is_admin_or_boss = bool(user.is_platform_admin or getattr(user, "is_boss", False))
        if not (is_owner or is_sohaviy or is_admin_or_boss):
            raise ValidationError({"detail": "Yangi versiya yuborish faqat buyurtmachi boshqarma vakillariga ruxsat etilgan."})

        tz_file = request.FILES.get("tz_file")
        if not tz_file:
            raise ValidationError({"tz_file": "Yangi TZ faylini yuklang."})

        from apps.core.uploads import check_upload
        check_upload(tz_file)

        change_note = (request.data.get("change_note") or "").strip()
        if not change_note:
            raise ValidationError({"change_note": "Ushbu versiyada nimalar o'zgarganini (sababi/izoh) yozing."})

        requested_change = (request.data.get("requested_change") or "").strip()

        with transaction.atomic():
            # Agar v1 versiya yozuvi hali yaratilmagan bo'lsa, avval uni kafolatlaymiz
            if not order.versions.filter(version=1).exists():
                ChangeRequestVersion.objects.create(
                    order=order,
                    version=1,
                    tz_file=order.tz_file,
                    tz_file_name=order.tz_file_name or "Dastlabki_TZ.pdf",
                    tz_file_size=order.tz_file_size or 0,
                    change_note="Dastlabki versiya (v1)",
                    requested_change=order.requested_change or "",
                    status=order.status if order.status != ChangeRequestStatus.NEW else ChangeRequestStatus.ACCEPTED,
                    uploaded_by=order.created_by,
                )

            last_ver = order.versions.order_by("-version").values_list("version", flat=True).first()
            next_ver = (last_ver or order.version or 1) + 1

            name = (getattr(tz_file, "name", "") or "").rsplit("/", 1)[-1][:255]
            size = getattr(tz_file, "size", 0) or 0

            ver = ChangeRequestVersion.objects.create(
                order=order,
                version=next_ver,
                tz_file=tz_file,
                tz_file_name=name,
                tz_file_size=size,
                change_note=change_note,
                requested_change=requested_change,
                status=ChangeRequestStatus.NEW,
                uploaded_by=request.user,
            )

        try:
            notify_order_new_version(order, ver, request.user)
        except Exception:
            logger.exception("Yangi versiya bildirishnomasini yuborishda xatolik: %s", order.pk)

        order = (
            ChangeRequest.objects.select_related("created_by", "project", "project__manager", "assigned_pm")
            .prefetch_related("versions__uploaded_by", "versions__decided_by")
            .get(pk=order.pk)
        )
        return Response(ChangeRequestSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="approve-version")
    def approve_version(self, request, pk=None):
        """PM yangi TZ versiyasini tasdiqlashi.

        Tasdiqlanganda:
        1. Eski versiyadagi TZ bekor qilinadi (atmen / CANCELLED).
        2. Yangi versiya ACCEPTED holatiga o'tadi.
        3. Buyurtma (ChangeRequest) yangi TZ fayli, versiya raqami va parametrlariga o'tkaziladi.
        """
        user = request.user
        is_pm_or_admin = bool(
            user.is_platform_admin
            or getattr(user, "is_boss", False)
            or getattr(user, "is_manager", False)
            or getattr(user, "specialty", "") == "PM"
            or getattr(user, "global_role", "") == "MANAGER"
        )
        if not is_pm_or_admin:
            return Response(
                {"detail": "Faqat loyiha menejeri (PM) yoki admin yangi versiyani tasdiqlay oladi."},
                status=403,
            )

        order = self.get_object()

        # Agar buyurtmani boshqa PM olgan bo'lsa
        if order.assigned_pm_id and order.assigned_pm_id != user.id:
            if not (user.is_platform_admin or getattr(user, "is_boss", False)):
                raise ValidationError(
                    {"detail": f"Ushbu buyurtmani {order.assigned_pm.full_name} o'z zimmasiga olgan. Boshqa PM versiyani tasdiqlay olmaydi."}
                )

        version_num = request.data.get("version")
        if version_num:
            target_version = order.versions.filter(version=version_num).first()
        else:
            # Agar versiya raqami ko'rsatilmagan bo'lsa, eng oxirgi NEW versiya olinadi
            target_version = order.versions.filter(status=ChangeRequestStatus.NEW).order_by("-version").first()

        if not target_version:
            raise ValidationError({"detail": "Tasdiqlash uchun yangi versiya topilmadi."})

        if target_version.status == ChangeRequestStatus.ACCEPTED and target_version.version == order.version:
            raise ValidationError({"detail": "Ushbu versiya allaqachon tasdiqlangan va amalda."})

        decision_note = (request.data.get("decision_note") or "").strip()
        pm_estimated_duration = (request.data.get("pm_estimated_duration") or "").strip()
        pm_deadline = request.data.get("pm_deadline")
        assigned_developer_id = request.data.get("assigned_developer")
        status_choice = request.data.get("status")

        with transaction.atomic():
            # 1. Eski tasdiqlangan barcha versiyalar atmen (CANCELLED) qilinadi
            order.versions.filter(
                version__lt=target_version.version
            ).exclude(
                status__in=[ChangeRequestStatus.CANCELLED, ChangeRequestStatus.REJECTED]
            ).update(
                status=ChangeRequestStatus.CANCELLED
            )

            # 2. Yangi versiya tasdiqlanadi
            target_version.status = ChangeRequestStatus.ACCEPTED
            target_version.decided_by = user
            target_version.decided_at = timezone.now()
            target_version.decision_note = decision_note
            target_version.save()

            # 3. Buyurtma yangi TZ ga o'tkaziladi
            order.version = target_version.version
            if target_version.tz_file:
                order.tz_file = target_version.tz_file
                order.tz_file_name = target_version.tz_file_name
                order.tz_file_size = target_version.tz_file_size
            if target_version.requested_change:
                order.requested_change = target_version.requested_change

            if pm_estimated_duration:
                order.pm_estimated_duration = pm_estimated_duration
            if pm_deadline:
                order.pm_deadline = pm_deadline
            if assigned_developer_id:
                order.assigned_developer_id = assigned_developer_id
            if decision_note:
                order.pm_notes = decision_note

            if not order.assigned_pm:
                order.assigned_pm = user

            # Buyurtma holati: agar yangi bo'lsa yoki maxsus status uzatilgan bo'lsa
            if status_choice and status_choice in ChangeRequestStatus.values:
                order.status = status_choice
            elif order.status == ChangeRequestStatus.NEW:
                order.status = ChangeRequestStatus.ACCEPTED

            order.save()

        try:
            notify_order_version_approved(order, target_version, user)
        except Exception:
            logger.exception("Versiya tasdiqlanganda bildirishnoma yuborishda xatolik: %s", order.pk)

        order = (
            ChangeRequest.objects.select_related("created_by", "project", "project__manager", "assigned_pm")
            .prefetch_related("versions__uploaded_by", "versions__decided_by")
            .get(pk=order.pk)
        )
        return Response(ChangeRequestSerializer(order, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="reject-version")
    def reject_version(self, request, pk=None):
        """PM yangi TZ versiyasini rad etishi.

        Rad etilganda yangi versiya REJECTED holatiga o'tadi, lekin
        eski versiyadagi TZ o'z kuchida qoladi.
        """
        user = request.user
        is_pm_or_admin = bool(
            user.is_platform_admin
            or getattr(user, "is_boss", False)
            or getattr(user, "is_manager", False)
            or getattr(user, "specialty", "") == "PM"
            or getattr(user, "global_role", "") == "MANAGER"
        )
        if not is_pm_or_admin:
            return Response(
                {"detail": "Faqat loyiha menejeri (PM) yoki admin yangi versiyani rad eta oladi."},
                status=403,
            )

        order = self.get_object()

        if order.assigned_pm_id and order.assigned_pm_id != user.id:
            if not (user.is_platform_admin or getattr(user, "is_boss", False)):
                raise ValidationError(
                    {"detail": f"Ushbu buyurtmani {order.assigned_pm.full_name} o'z zimmasiga olgan. Boshqa PM versiyani rad eta olmaydi."}
                )

        decision_note = (request.data.get("decision_note") or "").strip()
        if not decision_note:
            raise ValidationError({"decision_note": "Yangi TZ versiyasini rad etish sababini kiritish majburiy!"})

        version_num = request.data.get("version")
        if version_num:
            target_version = order.versions.filter(version=version_num).first()
        else:
            target_version = order.versions.filter(status=ChangeRequestStatus.NEW).order_by("-version").first()

        if not target_version:
            raise ValidationError({"detail": "Rad etish uchun yangi versiya topilmadi."})

        with transaction.atomic():
            target_version.status = ChangeRequestStatus.REJECTED
            target_version.decided_by = user
            target_version.decided_at = timezone.now()
            target_version.decision_note = decision_note
            target_version.save()

        try:
            notify_order_version_rejected(order, target_version, user, decision_note)
        except Exception:
            logger.exception("Versiya rad etilganda bildirishnoma yuborishda xatolik: %s", order.pk)

        order = (
            ChangeRequest.objects.select_related("created_by", "project", "project__manager", "assigned_pm")
            .prefetch_related("versions__uploaded_by", "versions__decided_by")
            .get(pk=order.pk)
        )
        return Response(ChangeRequestSerializer(order, context={"request": request}).data)


    @action(detail=True, methods=["get"], url_path="export-docx")
    def export_docx(self, request, pk=None):
        """Buyurtmani rasmiy Word (.docx) blanki ko'rinishida yuklab olish."""
        order = self.get_object()
        bio = generate_order_docx(order)
        filename = f"Buyurtma_{order.request_no}.docx"
        response = HttpResponse(
            bio.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    @action(detail=False, methods=["get"], url_path="stats")
    def stats(self, request):
        """Umumiy buyurtmalar ko'rsatkichlari (statistika)."""
        qs = self.get_queryset()
        total = qs.count()
        new_count = qs.filter(status=ChangeRequestStatus.NEW).count()
        accepted_count = qs.filter(status=ChangeRequestStatus.ACCEPTED).count()
        assigned_to_dev_count = qs.filter(status=ChangeRequestStatus.ASSIGNED_TO_DEV).count()
        in_progress_strict_count = qs.filter(status=ChangeRequestStatus.IN_PROGRESS).count()
        testing_count = qs.filter(status=ChangeRequestStatus.TESTING).count()
        in_progress = qs.filter(
            status__in=[
                ChangeRequestStatus.ACCEPTED,
                ChangeRequestStatus.ASSIGNED_TO_DEV,
                ChangeRequestStatus.IN_PROGRESS,
                ChangeRequestStatus.TESTING,
            ]
        ).count()
        completed = qs.filter(status=ChangeRequestStatus.COMPLETED).count()
        ready_for_review = qs.filter(status=ChangeRequestStatus.READY_FOR_REVIEW).count()
        rejected = qs.filter(status=ChangeRequestStatus.REJECTED).count()
        urgent = qs.filter(priority=ChangeRequestPriority.URGENT).count()
        high = qs.filter(priority=ChangeRequestPriority.HIGH).count()
        by_type = {
            "new": qs.filter(order_type=ChangeRequestType.NEW).count(),
            "continuation": qs.filter(order_type=ChangeRequestType.CONTINUATION).count(),
            "needs_classification": qs.filter(order_type=ChangeRequestType.NEEDS_CLASSIFICATION).count(),
            "modernization": qs.filter(order_type=ChangeRequestType.MODERNIZATION).count(),
            "maintenance": qs.filter(order_type=ChangeRequestType.MAINTENANCE).count(),
        }

        from apps.core.periods import PERIODS, _period_start
        period_starts = {key: _period_start(key) for key in PERIODS}
        in_progress_statuses = [
            ChangeRequestStatus.ACCEPTED,
            ChangeRequestStatus.ASSIGNED_TO_DEV,
            ChangeRequestStatus.IN_PROGRESS,
            ChangeRequestStatus.TESTING,
            ChangeRequestStatus.READY_FOR_REVIEW,
        ]

        periods = []
        for key in PERIODS:
            start = period_starts[key]
            p_submitted = qs.filter(created_at__gte=start).count()
            p_in_progress = qs.filter(created_at__gte=start, status__in=in_progress_statuses).count()
            p_completed = qs.filter(
                Q(completed_at__gte=start)
                | Q(client_approved_at__gte=start)
                | Q(created_at__gte=start, status=ChangeRequestStatus.COMPLETED)
            ).count()
            p_rejected = qs.filter(created_at__gte=start, status=ChangeRequestStatus.REJECTED).count()

            periods.append({
                "key": key,
                "since": period_starts[key].isoformat(),
                "submitted": p_submitted,
                "in_progress": p_in_progress,
                "approved": p_in_progress,
                "completed": p_completed,
                "rejected": p_rejected,
            })

        return Response({
            "total": total,
            "new": new_count,
            "accepted": accepted_count,
            "assigned_to_dev": assigned_to_dev_count,
            "in_progress": in_progress,
            "in_progress_strict": in_progress_strict_count,
            "testing": testing_count,
            "ready_for_review": ready_for_review,
            "completed": completed,
            "rejected": rejected,
            "urgent": urgent,
            "high": high,
            "by_type": by_type,
            "periods": periods,
            "deadlines": {
                "rejected": rejected,
                "pending": new_count,
                "ready_for_review": ready_for_review,
            },
        })
