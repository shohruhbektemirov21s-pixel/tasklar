import logging
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
)
from .serializers import ChangeRequestSerializer, PMDecisionSerializer
from .services import notify_order_created, notify_order_new_version, notify_order_status, notify_pm_decision

logger = logging.getLogger(__name__)


class CanAccessOrders(permissions.BasePermission):
    """Buyurtmalar bo'limini Sohaviy boshqarmalar, PM (loyiha menejerlari), Boshliq va adminlar ko'ra oladi."""
    message = "Buyurtmalar bo'limi Sohaviy boshqarmalar va loyiha menejerlari uchun mo'ljallangan."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return bool(
            user.is_platform_admin
            or getattr(user, "is_boss", False)
            or getattr(user, "is_manager", False)
            or getattr(user, "can_access_orders", False)
            or getattr(user, "is_sohaviy_boshqarma", False)
        )


class ChangeRequestViewSet(viewsets.ModelViewSet):
    """Axborot tizimiga o'zgartirish kiritish buyurtmalari (TZ) API-si."""

    queryset = (
        ChangeRequest.objects.all()
        .select_related("created_by", "project", "project__manager", "assigned_pm", "assigned_developer", "linked_task")
        .prefetch_related("versions__uploaded_by", "versions__decided_by")
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
        if for_pm and user.is_authenticated:
            qs = qs.filter(Q(assigned_pm=user) | Q(project__manager=user))
        elif mine and user.is_authenticated:
            qs = qs.filter(Q(created_by=user) | Q(assigned_pm=user) | Q(project__manager=user))
        return qs

    def perform_create(self, serializer):
        order = serializer.save(created_by=self.request.user)
        if order.tz_file:
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
        try:
            notify_order_created(order)
        except Exception:
            logger.exception("Buyurtma yaratilganda bildirishnoma yuborishda xatolik: %s", order.pk)

    def perform_update(self, serializer):
        instance = serializer.instance
        locked_statuses = [
            ChangeRequestStatus.ACCEPTED,
            ChangeRequestStatus.ASSIGNED_TO_DEV,
            ChangeRequestStatus.IN_PROGRESS,
            ChangeRequestStatus.TESTING,
            ChangeRequestStatus.COMPLETED,
        ]
        if instance.status in locked_statuses:
            raise ValidationError(
                {"detail": "Ushbu TZ loyiha menejeri (PM) tomonidan qabul qilingan. "
                           "Uni to'g'ridan-to'g'ri tahrirlab bo'lmaydi. "
                           "O'zgartirish kiritish uchun yangi versiya joylashtiring."}
            )

        old_status = instance.status
        order = serializer.save()
        new_status = order.status
        if old_status != new_status:
            try:
                notify_order_status(order, self.request.user, old_status, new_status)
            except Exception:
                logger.exception("Buyurtma holati o'zgarganda bildirishnoma yuborishda xatolik: %s", order.pk)

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
        serializer = PMDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

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

    @action(detail=True, methods=["post"], url_path="upload-version")
    def upload_version(self, request, pk=None):
        """Qabul qilingan yoki mavjud TZ ga yangi versiya (v2, v3...) faylini va o'zgarishlar tavsifini yuklash."""
        order = self.get_object()
        tz_file = request.FILES.get("tz_file")
        if not tz_file:
            raise ValidationError({"tz_file": "Yangi TZ faylini yuklang."})

        from apps.core.uploads import check_upload
        check_upload(tz_file)

        change_note = (request.data.get("change_note") or "").strip()
        if not change_note:
            raise ValidationError({"change_note": "Ushbu versiyada nimalar o'zgarganini (sababi/izoh) yozing."})

        # Agar v1 versiya yozuvi hali yaratilmagan bo'lsa, avval uni kafolatlaymiz
        if not order.versions.filter(version=1).exists():
            ChangeRequestVersion.objects.create(
                order=order,
                version=1,
                tz_file=order.tz_file,
                tz_file_name=order.tz_file_name or "Dastlabki_TZ.pdf",
                tz_file_size=order.tz_file_size or 0,
                change_note="Dastlabki versiya (v1)",
                status=order.status,
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
            status=ChangeRequestStatus.NEW,
            uploaded_by=request.user,
        )

        order.version = next_ver
        order.tz_file = tz_file
        order.tz_file_name = name
        order.tz_file_size = size
        # Yangi versiya yuborilgach, PM qayta ko'rib chiqishi uchun status NEW ga o'tadi
        order.status = ChangeRequestStatus.NEW
        if request.data.get("requested_change"):
            order.requested_change = request.data["requested_change"]
        order.save()

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
        urgent = qs.filter(priority=ChangeRequestPriority.URGENT).count()
        high = qs.filter(priority=ChangeRequestPriority.HIGH).count()
        by_type = {
            "new": qs.filter(order_type=ChangeRequestType.NEW).count(),
            "continuation": qs.filter(order_type=ChangeRequestType.CONTINUATION).count(),
            "needs_classification": qs.filter(order_type=ChangeRequestType.NEEDS_CLASSIFICATION).count(),
            "modernization": qs.filter(order_type=ChangeRequestType.MODERNIZATION).count(),
            "maintenance": qs.filter(order_type=ChangeRequestType.MAINTENANCE).count(),
        }

        return Response({
            "total": total,
            "new": new_count,
            "accepted": accepted_count,
            "assigned_to_dev": assigned_to_dev_count,
            "in_progress": in_progress,
            "in_progress_strict": in_progress_strict_count,
            "testing": testing_count,
            "completed": completed,
            "urgent": urgent,
            "high": high,
            "by_type": by_type,
        })
