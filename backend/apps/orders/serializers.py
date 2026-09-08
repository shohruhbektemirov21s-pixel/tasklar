import datetime
from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.projects.models import Project
from .models import ChangeRequest, ChangeRequestPriority, ChangeRequestStatus, ChangeRequestVersion

User = get_user_model()


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
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    change_nature_display = serializers.CharField(source="get_change_nature_display", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default="")

    request_date = SafeDateField(required=False)
    due_date = SafeDateField(required=False, allow_null=True)
    pm_deadline = SafeDateField(required=False, allow_null=True)

    project = serializers.PrimaryKeyRelatedField(
        queryset=Project.objects.all(), required=False, allow_null=True
    )
    project_detail = serializers.SerializerMethodField(read_only=True)

    version = serializers.IntegerField(read_only=True)
    is_locked = serializers.SerializerMethodField(read_only=True)
    versions = serializers.SerializerMethodField(read_only=True)

    tz_file = serializers.FileField(required=False, allow_null=True)
    tz_file_url = serializers.SerializerMethodField(read_only=True)
    tz_file_size_display = serializers.SerializerMethodField(read_only=True)

    assigned_pm = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False, allow_null=True
    )
    assigned_pm_name = serializers.CharField(source="assigned_pm.full_name", read_only=True, default="")

    class Meta:
        model = ChangeRequest
        fields = [
            "id",
            "request_no",
            "version",
            "is_locked",
            "versions",
            "system_name",
            "module",
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
            "assigned_pm",
            "assigned_pm_name",
            "pm_notes",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "request_no",
            "version",
            "is_locked",
            "versions",
            "tz_file_name",
            "tz_file_size",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def validate_tz_file(self, value):
        if value:
            from apps.core.uploads import check_upload
            check_upload(value)
        return value

    def get_is_locked(self, obj):
        return obj.status in [
            ChangeRequestStatus.ACCEPTED,
            ChangeRequestStatus.IN_PROGRESS,
            ChangeRequestStatus.TESTING,
            ChangeRequestStatus.COMPLETED,
        ]

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

    def get_tz_file_url(self, obj):
        from apps.core.media import media_url
        return media_url(obj.tz_file)

    def get_tz_file_size_display(self, obj):
        return obj.tz_file_size_display

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


class PMDecisionSerializer(serializers.Serializer):
    """Loyiha menejeri (PM) qarorini qabul qilish va muddatlarni belgilash serializeri."""
    status = serializers.ChoiceField(choices=ChangeRequestStatus.choices)
    pm_estimated_duration = serializers.CharField(max_length=150, required=False, allow_blank=True)
    pm_deadline = SafeDateField(required=False, allow_null=True)
    pm_notes = serializers.CharField(required=False, allow_blank=True)
    executor_signer = serializers.CharField(max_length=200, required=False, allow_blank=True)
