import datetime
from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.projects.models import Project
from apps.tasks.models import Task
from .models import (
    ChangeRequest,
    ChangeRequestPriority,
    ChangeRequestStatus,
    ChangeRequestType,
    ChangeRequestVersion,
    OrderAttachment,
)

User = get_user_model()


class OrderAttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField(read_only=True)
    size_display = serializers.CharField(read_only=True)
    uploaded_by_name = serializers.CharField(source="uploaded_by.full_name", read_only=True, default="")

    class Meta:
        model = OrderAttachment
        fields = [
            "id",
            "file",
            "url",
            "original_name",
            "size",
            "size_display",
            "uploaded_by",
            "uploaded_by_name",
            "created_at",
        ]
        read_only_fields = ["id", "size", "created_at"]

    def get_url(self, obj):
        from apps.core.media import media_url
        return media_url(obj.file)


class OrderTaskBriefSerializer(serializers.ModelSerializer):
    code = serializers.CharField(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    priority_label = serializers.CharField(read_only=True)
    assignees = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            "id",
            "number",
            "code",
            "title",
            "status",
            "status_display",
            "priority",
            "priority_label",
            "task_type",
            "due_date",
            "assignees",
            "created_at",
        ]

    def get_assignees(self, obj):
        users = [a.user for a in obj.assignments.all() if a.is_active]
        return [
            {
                "id": u.id,
                "full_name": u.full_name,
                "specialty": getattr(u, "specialty", ""),
                "avatar_color": getattr(u, "avatar_color", "#3b82f6"),
                "initials": getattr(u, "initials", "?"),
            }
            for u in users
        ]


class SafeDateField(serializers.DateField):
    """Db2 TIMESTAMP yoki aware datetime qaytarganda date ga aylantirib beruvchi xavfsiz maydon."""

    def to_representation(self, value):
        if isinstance(value, datetime.datetime):
            value = value.date()
        return super().to_representation(value)


class ChangeRequestVersionSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source="uploaded_by.full_name", read_only=True, default="")
    decided_by_name = serializers.CharField(source="decided_by.full_name", read_only=True, default="")
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    tz_file_url = serializers.SerializerMethodField(read_only=True)
    tz_file_size_display = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ChangeRequestVersion
        fields = [
            "id",
            "version",
            "tz_file",
            "tz_file_url",
            "tz_file_name",
            "tz_file_size",
            "tz_file_size_display",
            "change_note",
            "requested_change",
            "status",
            "status_display",
            "uploaded_by",
            "uploaded_by_name",
            "created_at",
            "decided_by",
            "decided_by_name",
            "decided_at",
            "decision_note",
        ]
        read_only_fields = [
            "id",
            "version",
            "tz_file_name",
            "tz_file_size",
            "created_at",
            "uploaded_by",
            "decided_by",
            "decided_at",
        ]

    def get_tz_file_url(self, obj):
        from apps.core.media import media_url
        return media_url(obj.tz_file)

    def get_tz_file_size_display(self, obj):
        return obj.tz_file_size_display


class ChangeRequestSerializer(serializers.ModelSerializer):
    order_type = serializers.ChoiceField(choices=ChangeRequestType.choices, default=ChangeRequestType.NEW, required=False)
    order_type_display = serializers.CharField(source="get_order_type_display", read_only=True)
    project_type = serializers.CharField(source="order_type", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    change_nature_display = serializers.CharField(source="get_change_nature_display", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default="")

    request_date = SafeDateField(required=False)
    due_date = SafeDateField(required=False, allow_null=True)
    pm_deadline = SafeDateField(required=False, allow_null=True)

    current_state = serializers.CharField(required=False, allow_blank=True, default="")
    requested_change = serializers.CharField(required=False, allow_blank=True, default="")
    reason = serializers.CharField(required=False, allow_blank=True, default="")
    affected_modules = serializers.CharField(required=False, allow_blank=True, default="")
    dependent_systems = serializers.CharField(required=False, allow_blank=True, default="")
    additional_materials = serializers.CharField(required=False, allow_blank=True, default="")
    module = serializers.CharField(required=False, allow_blank=True, default="")
    department = serializers.CharField(required=False, allow_blank=True, default="")
    responsible_person = serializers.CharField(required=False, allow_blank=True, default="")
    status = serializers.ChoiceField(choices=ChangeRequestStatus.choices, default=ChangeRequestStatus.NEW, required=False)

    project = serializers.PrimaryKeyRelatedField(
        queryset=Project.objects.all(), required=False, allow_null=True
    )
    project_detail = serializers.SerializerMethodField(read_only=True)

    version = serializers.IntegerField(read_only=True)
    is_locked = serializers.SerializerMethodField(read_only=True)
    versions = serializers.SerializerMethodField(read_only=True)
    pending_version = serializers.SerializerMethodField(read_only=True)
    has_pending_version = serializers.SerializerMethodField(read_only=True)

    tz_file = serializers.FileField(required=False, allow_null=True)
    tz_file_url = serializers.SerializerMethodField(read_only=True)
    tz_file_size_display = serializers.SerializerMethodField(read_only=True)
    attachments = OrderAttachmentSerializer(many=True, read_only=True)

    completion_file = serializers.FileField(required=False, allow_null=True)
    completion_file_url = serializers.SerializerMethodField(read_only=True)
    completion_file_size_display = serializers.SerializerMethodField(read_only=True)
    client_approved_by_name = serializers.CharField(source="client_approved_by.full_name", read_only=True, default="")

    assigned_pm = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False, allow_null=True
    )
    assigned_pm_name = serializers.CharField(source="assigned_pm.full_name", read_only=True, default="")

    assigned_developer = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False, allow_null=True
    )
    assigned_developer_name = serializers.CharField(source="assigned_developer.full_name", read_only=True, default="")
    assigned_developer_detail = serializers.SerializerMethodField(read_only=True)

    linked_task = serializers.PrimaryKeyRelatedField(
        queryset=Task.objects.all(), required=False, allow_null=True
    )
    linked_task_detail = serializers.SerializerMethodField(read_only=True)
    tasks = serializers.SerializerMethodField(read_only=True)
    stage_index = serializers.SerializerMethodField(read_only=True)
    created_by_department = serializers.CharField(source="created_by.department.name", read_only=True, default="")
    can_manage_by_user = serializers.SerializerMethodField(read_only=True)
    can_edit = serializers.SerializerMethodField(read_only=True)
    can_delete = serializers.SerializerMethodField(read_only=True)
    is_assigned_to_other_pm = serializers.SerializerMethodField(read_only=True)

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, "copy") else dict(data)
        if "project_type" in data and "order_type" not in data:
            data["order_type"] = data["project_type"]
        return super().to_internal_value(data)

    class Meta:
        model = ChangeRequest
        fields = [
            "id",
            "request_no",
            "version",
            "is_locked",
            "stage_index",
            "versions",
            "pending_version",
            "has_pending_version",
            "system_name",
            "module",
            "order_type",
            "order_type_display",
            "project_type",
            "project",
            "project_detail",
            "request_date",
            "department",
            "responsible_person",
            "priority",
            "priority_display",
            "due_date",
            "tz_file",
            "tz_file_url",
            "tz_file_name",
            "tz_file_size",
            "tz_file_size_display",
            "attachments",
            "current_state",
            "requested_change",
            "reason",
            "affected_modules",
            "dependent_systems",
            "change_nature",
            "change_nature_display",
            "additional_materials",
            "test_result",
            "status",
            "status_display",
            "client_signer",
            "executor_signer",
            "estimated_resources",
            "pm_estimated_duration",
            "pm_deadline",
            "completion_file",
            "completion_file_url",
            "completion_file_name",
            "completion_file_size",
            "completion_file_size_display",
            "completion_note",
            "completed_at",
            "client_feedback_note",
            "client_approved_at",
            "client_approved_by",
            "client_approved_by_name",
            "assigned_pm",
            "assigned_pm_name",
            "assigned_developer",
            "assigned_developer_name",
            "assigned_developer_detail",
            "linked_task",
            "linked_task_detail",
            "tasks",
            "pm_notes",
            "created_by",
            "created_by_name",
            "created_by_department",
            "can_manage_by_user",
            "can_edit",
            "can_delete",
            "is_assigned_to_other_pm",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "request_no",
            "version",
            "is_locked",
            "versions",
            "pending_version",
            "has_pending_version",
            "tz_file_name",
            "tz_file_size",
            "completion_file_name",
            "completion_file_size",
            "completed_at",
            "client_approved_at",
            "client_approved_by",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def validate_tz_file(self, value):
        if value:
            from apps.core.uploads import check_upload
            check_upload(value)
        return value

    def validate_completion_file(self, value):
        if value:
            from apps.core.uploads import check_upload
            check_upload(value)
        return value

    def get_is_locked(self, obj):
        return obj.status in [
            ChangeRequestStatus.ACCEPTED,
            ChangeRequestStatus.ASSIGNED_TO_DEV,
            ChangeRequestStatus.IN_PROGRESS,
            ChangeRequestStatus.TESTING,
            ChangeRequestStatus.COMPLETED,
        ]

    def get_can_edit(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return False
        user = request.user
        if user.is_platform_admin or getattr(user, "is_boss", False):
            return True
        return obj.status == ChangeRequestStatus.DRAFT and obj.created_by_id == user.id

    def get_can_delete(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return False
        user = request.user
        if user.is_platform_admin or getattr(user, "is_boss", False):
            return True
        return obj.status == ChangeRequestStatus.DRAFT and obj.created_by_id == user.id

    def get_assigned_developer_detail(self, obj):
        if not obj.assigned_developer:
            return None
        dev = obj.assigned_developer
        return {
            "id": dev.id,
            "full_name": dev.full_name,
            "email": dev.email,
            "specialty": dev.specialty,
            "specialty_display": dev.get_specialty_display() if hasattr(dev, "get_specialty_display") else "",
            "avatar_color": getattr(dev, "avatar_color", "#3b82f6"),
            "initials": getattr(dev, "initials", "?"),
        }

    def get_linked_task_detail(self, obj):
        if not obj.linked_task:
            return None
        t = obj.linked_task
        return {
            "id": t.id,
            "number": t.number,
            "code": t.code,
            "title": t.title,
            "status": t.status,
            "status_display": t.get_status_display(),
        }

    def get_tasks(self, obj):
        task_ids = list(obj.tasks.filter(deleted_at__isnull=True).values_list("id", flat=True))
        if obj.linked_task_id and obj.linked_task_id not in task_ids:
            task_ids.append(obj.linked_task_id)
        if not task_ids:
            return []
        tasks_qs = (
            Task.objects.filter(id__in=task_ids, deleted_at__isnull=True)
            .select_related("project")
            .prefetch_related("assignments__user")
            .order_by("-id")
        )
        return OrderTaskBriefSerializer(tasks_qs, many=True, context=self.context).data

    def get_stage_index(self, obj):
        stages = {
            ChangeRequestStatus.DRAFT: 0,
            ChangeRequestStatus.NEW: 1,
            ChangeRequestStatus.ACCEPTED: 2,
            ChangeRequestStatus.ASSIGNED_TO_DEV: 3,
            ChangeRequestStatus.IN_PROGRESS: 4,
            ChangeRequestStatus.TESTING: 5,
            ChangeRequestStatus.READY_FOR_REVIEW: 6,
            ChangeRequestStatus.COMPLETED: 7,
            ChangeRequestStatus.REJECTED: -1,
            ChangeRequestStatus.CANCELLED: -2,
        }
        return stages.get(obj.status, 0 if obj.status == ChangeRequestStatus.DRAFT else 1)

    def get_versions(self, obj):
        vers = list(obj.versions.all())
        if not vers and obj.tz_file:
            return [{
                "id": 0,
                "version": 1,
                "tz_file_url": self.get_tz_file_url(obj),
                "tz_file_name": obj.tz_file_name,
                "tz_file_size": obj.tz_file_size,
                "tz_file_size_display": obj.tz_file_size_display,
                "change_note": "Dastlabki versiya (v1)",
                "status": obj.status,
                "status_display": obj.get_status_display(),
                "uploaded_by": obj.created_by_id,
                "uploaded_by_name": obj.created_by.full_name if obj.created_by else "",
                "created_at": obj.created_at.isoformat() if obj.created_at else None,
                "decided_by": obj.assigned_pm_id,
                "decided_by_name": obj.assigned_pm.full_name if obj.assigned_pm else "",
                "decided_at": None,
                "decision_note": obj.pm_notes,
            }]
        return ChangeRequestVersionSerializer(vers, many=True, context=self.context).data

    def get_pending_version(self, obj):
        vers = list(obj.versions.all())
        candidates = [v for v in vers if v.status == ChangeRequestStatus.NEW and v.version > obj.version]
        if candidates:
            candidates.sort(key=lambda x: x.version, reverse=True)
            return ChangeRequestVersionSerializer(candidates[0], context=self.context).data
        return None

    def get_has_pending_version(self, obj):
        return bool(self.get_pending_version(obj))

    def get_tz_file_url(self, obj):
        from apps.core.media import media_url
        return media_url(obj.tz_file)

    def get_tz_file_size_display(self, obj):
        return obj.tz_file_size_display

    def get_completion_file_url(self, obj):
        from apps.core.media import media_url
        return media_url(obj.completion_file)

    def get_completion_file_size_display(self, obj):
        return obj.completion_file_size_display

    def get_project_detail(self, obj):
        if not obj.project:
            return None
        p = obj.project
        manager = p.manager
        return {
            "id": p.id,
            "name": p.name,
            "key": p.key,
            "color": p.color,
            "status": p.status,
            "status_display": p.get_status_display(),
            "manager_id": manager.id if manager else None,
            "manager_name": manager.full_name if manager else "",
            "manager_email": manager.email if manager else "",
            "start_date": str(p.start_date) if p.start_date else None,
            "due_date": str(p.due_date) if p.due_date else None,
            "progress": p.progress(),
            "description": p.description,
            "repo_url": p.repo_url,
            "docs_url": p.docs_url,
        }

    def get_can_manage_by_user(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return False
        user = request.user
        if user.is_platform_admin or getattr(user, "is_boss", False):
            return True
        is_pm = bool(
            getattr(user, "is_manager", False)
            or getattr(user, "specialty", "") == "PM"
            or getattr(user, "global_role", "") == "MANAGER"
        )
        if not is_pm:
            return False
        if obj.assigned_pm_id:
            return obj.assigned_pm_id == user.id
        return True

    def get_is_assigned_to_other_pm(self, obj):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return False
        user = request.user
        if user.is_platform_admin or getattr(user, "is_boss", False):
            return False
        if obj.assigned_pm_id and obj.assigned_pm_id != user.id:
            return True
        return False

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            user = request.user
            is_privileged = bool(
                user.is_platform_admin
                or getattr(user, "is_boss", False)
                or getattr(user, "is_manager", False)
                or getattr(user, "specialty", "") == "PM"
                or getattr(user, "global_role", "") == "MANAGER"
                or instance.assigned_pm_id == user.id
                or instance.assigned_developer_id == user.id
            )
            user_dept_name = getattr(user.department, "name", "") if getattr(user, "department", None) else ""
            is_order_owner = bool(
                instance.created_by_id == user.id
                or (
                    user_dept_name
                    and (
                        (instance.department and user_dept_name.strip().lower() == instance.department.strip().lower())
                        or (getattr(instance.created_by, "department_id", None) and instance.created_by.department_id == user.department_id)
                    )
                )
            )
            # Faqat buyurtma egasiga (tegishli boshqarmaga) va PM/adminlarga ko'rinadi
            if not is_privileged and not is_order_owner:
                ret["assigned_developer"] = None
                ret["assigned_developer_name"] = ""
                ret["assigned_developer_detail"] = None

        return ret


class PMDecisionSerializer(serializers.Serializer):
    """Loyiha menejeri (PM) qarorini qabul qilish va muddatlarni belgilash serializeri."""
    status = serializers.ChoiceField(choices=ChangeRequestStatus.choices)
    pm_estimated_duration = serializers.CharField(max_length=150, required=False, allow_blank=True)
    pm_deadline = SafeDateField(required=False, allow_null=True)
    pm_notes = serializers.CharField(required=False, allow_blank=True)
    executor_signer = serializers.CharField(max_length=200, required=False, allow_blank=True)
    assigned_developer = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False, allow_null=True
    )
    linked_task = serializers.PrimaryKeyRelatedField(
        queryset=Task.objects.all(), required=False, allow_null=True
    )

    def validate(self, attrs):
        status = attrs.get("status")
        pm_notes = attrs.get("pm_notes", "").strip()
        if status == ChangeRequestStatus.REJECTED:
            if not pm_notes:
                raise serializers.ValidationError(
                    {"pm_notes": "Buyurtmani rad etish (atkaz qilish) uchun nima sababdan rad etilganligi haqida izoh yozish majburiy!"}
                )
        return attrs
