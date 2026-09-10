from django.contrib import admin

from .models import JoinRequest, Project, ProjectBrief, ProjectMember


class MemberInline(admin.TabularInline):
    model = ProjectMember
    extra = 0
    autocomplete_fields = ["user"]


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    """Saytdan o'chirilgan loyihalar shu yerda ko'rinadi va qaytariladi."""

    list_display = ("name", "key", "project_type", "workspace", "manager", "status", "deleted_at", "updated_at")
    list_filter = ("status", "project_type", "workspace", "deleted_at")
    search_fields = ("name", "key", "description")
    readonly_fields = ("deleted_at", "deleted_by")
    inlines = [MemberInline]
    actions = ["restore_projects"]

    def get_queryset(self, request):
        # Admin panel hamma yozuvni ko'radi - o'chirilganini ham.
        return Project.all_objects.all()

    @admin.action(description="Ochirilgan loyihalarni qaytarish")
    def restore_projects(self, request, queryset):
        n = 0
        for project in queryset:
            if project.deleted_at:
                project.restore()
                n += 1
        self.message_user(request, "{} ta loyiha qaytarildi.".format(n))
