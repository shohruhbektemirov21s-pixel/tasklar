from django.contrib import admin
from django.utils.html import format_html


from apps.core.softdelete import SoftDeleteAdminMixin
from .models import Attachment, Comment, Label, Review, Task, TaskAssignment, TaskPriority, TaskStatus, WorkLog


class AssignmentInline(admin.TabularInline):
    model = TaskAssignment
    extra = 0
    autocomplete_fields = ["user"]


@admin.register(Task)
class TaskAdmin(SoftDeleteAdminMixin, admin.ModelAdmin):
    list_display = (
        "code_display",
        "title",
        "project",
        "status_badge",
        "priority_badge",
        "due_date",
        "updated_at",
        "ochirilgan",
    )
    list_filter = ("status", "priority", "task_type", "project", "deleted_at")
    search_fields = ("title", "description")
    inlines = [AssignmentInline]

    @admin.display(description="Kod")
    def code_display(self, obj):
        return obj.code

    @admin.display(description="Holat")
    def status_badge(self, obj):
        colors = {
            TaskStatus.TODO: ("#64748b", "#f1f5f9"),
            TaskStatus.IN_PROGRESS: ("#2563eb", "#dbeafe"),
            TaskStatus.IN_REVIEW: ("#7c3aed", "#ede9fe"),
            TaskStatus.CHANGES_REQUESTED: ("#ea580c", "#ffedd5"),
            TaskStatus.BLOCKED: ("#dc2626", "#fee2e2"),
            TaskStatus.DONE: ("#16a34a", "#dcfce7"),
            TaskStatus.CANCELLED: ("#475569", "#f1f5f9"),
        }
        fg, bg = colors.get(obj.status, ("#475569", "#f1f5f9"))
        return format_html(
            '<span style="background-color: {}; color: {}; padding: 3px 8px; '
            'border-radius: 10px; font-weight: 600; font-size: 11px; display: inline-block;">{}</span>',
            bg,
            fg,
            obj.get_status_display(),
        )

    @admin.display(description="Muhimlik")
    def priority_badge(self, obj):
        colors = {
            TaskPriority.LOW: ("#64748b", "Past"),
            TaskPriority.MEDIUM: ("#2563eb", "O'rtacha"),
            TaskPriority.HIGH: ("#ea580c", "Yuqori"),
            TaskPriority.URGENT: ("#dc2626", "🔥 Shoshilinch"),
        }
        color, text = colors.get(obj.priority, ("#64748b", str(obj.priority)))
        return format_html(
            '<span style="color: {}; font-weight: 600; font-size: 11px;">{}</span>',
            color,
            text,
        )
