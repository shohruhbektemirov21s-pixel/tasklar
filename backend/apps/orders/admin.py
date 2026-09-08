from django.contrib import admin
from django.utils.html import format_html
from .models import ChangeRequest, ChangeRequestPriority, ChangeRequestStatus, ChangeRequestVersion


class ChangeRequestVersionInline(admin.TabularInline):
    model = ChangeRequestVersion
    extra = 0
    readonly_fields = ("version", "tz_file_name", "tz_file_size", "uploaded_by", "created_at", "decided_by", "decided_at")
    fields = ("version", "tz_file", "tz_file_name", "change_note", "status", "uploaded_by", "created_at", "decided_by", "decided_at", "decision_note")


@admin.register(ChangeRequest)
class ChangeRequestAdmin(admin.ModelAdmin):
    inlines = [ChangeRequestVersionInline]
    list_display = (
        "request_no",
        "system_name",
        "project_link",
        "module",
        "department_badge",
        "responsible_person",
        "priority_badge",
        "duration_badge",
        "status_badge",
        "tz_file_link",
        "request_date",
        "created_by",
    )
    list_filter = ("status", "priority", "project", "department", "request_date", "created_at")
    search_fields = (
        "request_no", "system_name", "module", "department",
        "responsible_person", "requested_change", "reason",
        "project__name", "project__key",
    )
    ordering = ("-created_at",)
    readonly_fields = ("request_no", "tz_file_name", "tz_file_size", "created_at", "updated_at")

    fieldsets = (
        ("Metama'lumotlar", {
            "fields": (
                "request_no", "system_name", "project", "module", "request_date",
                "department", "responsible_person", "priority", "due_date"
            )
        }),
        ("TZ (Texnik topshiriq) fayli", {
            "fields": ("tz_file", "tz_file_name", "tz_file_size")
        }),
        ("1. O'zgartirish talabi", {
            "fields": ("current_state", "requested_change", "reason")
        }),
        ("2. Ta'sir doirasi", {
            "fields": ("affected_modules", "dependent_systems", "change_nature")
        }),
        ("3. Qo'shimcha materiallar", {
            "classes": ("collapse",),
            "fields": ("additional_materials",)
        }),
        ("4. Test qilish", {
            "fields": ("test_result",)
        }),
        ("5. PM (Loyiha menejeri) qarori va muddatlar", {
            "fields": (
                "status", "assigned_pm", "pm_estimated_duration", "pm_deadline",
                "pm_notes", "client_signer", "executor_signer",
                "estimated_resources", "created_by", "created_at", "updated_at"
            )
        }),
    )

    @admin.display(description="Loyiha")
    def project_link(self, obj):
        if not obj.project:
            return "-"
        return format_html(
            '<span class="badge" style="background-color: {}; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px;">{}</span> {}',
            obj.project.color or "#2563eb",
            obj.project.key,
            obj.project.name,
        )

    @admin.display(description="Bo'linma / Boshqarma")
    def department_badge(self, obj):
        return format_html(
            '<span class="badge" style="background-color: #0284c7; color: #fff; font-size: 11px; padding: 4px 8px; border-radius: 8px;">'
            '<i class="fas fa-building mr-1"></i>{}</span>',
            obj.department,
        )

    @admin.display(description="Ustuvorlik / Muhimlilik")
    def priority_badge(self, obj):
        colors = {
            ChangeRequestPriority.URGENT: ("#dc2626", "🔥 Shoshilinch"),
            ChangeRequestPriority.HIGH: ("#ea580c", "⚡ Yuqori"),
            ChangeRequestPriority.MEDIUM: ("#2563eb", "🔷 O'rta"),
            ChangeRequestPriority.LOW: ("#64748b", "⚪ Past"),
        }
        color, text = colors.get(obj.priority, ("#6b7280", obj.get_priority_display()))
        return format_html(
            '<span style="background-color: {}; color: #fff; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;">{}</span>',
            color, text
        )

    @admin.display(description="Qanchada tugashi / PM muddati")
    def duration_badge(self, obj):
        if obj.pm_estimated_duration or obj.pm_deadline:
            dur = obj.pm_estimated_duration or ""
            d_date = f" ({obj.pm_deadline})" if obj.pm_deadline else ""
            return f"⏱ {dur}{d_date}"
        return format_html('<span style="color: #94a3b8; font-style: italic;">Kutilmoqda</span>')

    @admin.display(description="Holat")
    def status_badge(self, obj):
        colors = {
            ChangeRequestStatus.NEW: ("#0284c7", "🆕 Yangi"),
            ChangeRequestStatus.ACCEPTED: ("#8b5cf6", "📥 Qabul qilindi"),
            ChangeRequestStatus.IN_PROGRESS: ("#f59e0b", "⚙️ Jarayonda"),
            ChangeRequestStatus.TESTING: ("#ec4899", "🧪 Testda"),
            ChangeRequestStatus.COMPLETED: ("#10b981", "✅ Bajarildi"),
            ChangeRequestStatus.REJECTED: ("#ef4444", "❌ Rad etildi"),
        }
        color, text = colors.get(obj.status, ("#6b7280", obj.get_status_display()))
        return format_html(
            '<span style="background-color: {}; color: #fff; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;">{}</span>',
            color, text
        )

    @admin.display(description="TZ Fayli")
    def tz_file_link(self, obj):
        if obj.tz_file:
            from apps.core.media import media_url
            url = media_url(obj.tz_file)
            return format_html(
                '<a href="{}" target="_blank" style="font-size: 12px; font-weight: 600; color: #2563eb;">📎 {}</a>',
                url,
                obj.tz_file_name or "Yuklab olish",
            )
        return "-"
