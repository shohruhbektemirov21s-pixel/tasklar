from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html

from .models import Department, GlobalRole, User


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "member_count", "created_at")
    search_fields = ("name", "code", "description")
    ordering = ("name",)

    @admin.display(description="Xodimlar soni")
    def member_count(self, obj):
        count = obj.members.count()
        return format_html(
            '<span class="badge badge-info" style="font-size: 11px; padding: 4px 8px; border-radius: 8px;">'
            '<i class="fas fa-users mr-1"></i> {} ta xodim</span>',
            count,
        )


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        "email",
        "full_name",
        "department_badge",
        "role_badge",
        "job_title",
        "inquiries_badge",
        "active_badge",
        "password_action",
        "date_joined",
    )
    list_filter = ("can_access_inquiries", "department", "global_role", "is_active", "is_staff", "specialty", "seniority")
    search_fields = ("email", "full_name", "department__name", "department__code", "skills", "job_title", "telegram")
    ordering = ("-date_joined",)

    fieldsets = (
        ("Kirish ma'lumotlari (Login & Parol)", {
            "fields": ("email", "password"),
            "description": "Foydalanuvchi tizimga kirish logini va paroli."
        }),
        ("Boshqarma va Xodim ma'lumotlari", {
            "fields": ("full_name", "department", "job_title", "global_role"),
            "description": "Xodimning boshqarmasi, lavozimi va tizimdagi roli."
        }),
        ("Qo'shimcha profil ma'lumotlari", {
            "classes": ("collapse",),
            "fields": (
                "specialty", "seniority", "years_experience", "skills", "bio", "telegram", "avatar"
            )
        }),
        ("Xavfsizlik va Ruxsatlar", {
            "fields": (
                "can_access_inquiries", "is_active", "is_staff", "is_superuser", "groups", "user_permissions"
            )
        }),
        ("Faollik vaqtlari", {
            "classes": ("collapse",),
            "fields": ("last_login", "date_joined", "last_seen")
        }),
    )

    add_fieldsets = (
        ("1. Kirish ma'lumotlari (Login & Parol)", {
            "classes": ("wide",),
            "fields": ("email", "password1", "password2"),
            "description": "Foydalanuvchi tizimga kirishi uchun login (email) va parolini o'rnating."
        }),
        ("2. Boshqarma va Xodim ma'lumotlari", {
            "classes": ("wide",),
            "fields": ("full_name", "department", "job_title", "global_role", "can_access_inquiries"),
            "description": "Foydalanuvchi biriktiriladigan boshqarma, F.I.Sh., lavozimi va So'rovlar ruxsatini belgilang."
        }),
    )


    @admin.display(description="Boshqarma")
    def department_badge(self, obj):
        if obj.department:
            return format_html(
                '<span class="badge" style="background-color: #0284c7; color: #fff; font-size: 11px; padding: 4px 8px; border-radius: 8px;">'
                '<i class="fas fa-building mr-1"></i>{}</span>',
                obj.department.name,
            )
        return format_html(
            '<span style="color: #94a3b8; font-style: italic; font-size: 11px;">Biriktirilmagan</span>'
        )


    @admin.display(description="Tizim roli")
    def role_badge(self, obj):
        colors = {
            GlobalRole.ADMIN: ("#dc2626", "👑 Admin"),
            GlobalRole.BOSS: ("#7c3aed", "👔 Boshliq"),
            GlobalRole.MANAGER: ("#2563eb", "💼 Menejer"),
            GlobalRole.OPERATOR: ("#d97706", "🎧 Operator"),
            GlobalRole.DEVELOPER: ("#059669", "💻 Dasturchi"),
        }
        color, label = colors.get(obj.global_role, ("#6b7280", obj.get_global_role_display()))
        return format_html(
            '<span style="background-color: {}; color: #fff; padding: 4px 10px; '
            'border-radius: 12px; font-weight: 600; font-size: 11px; display: inline-block; '
            'box-shadow: 0 1px 3px rgba(0,0,0,0.12);">{}</span>',
            color,
            label,
        )

    @admin.display(description="Holat")
    def active_badge(self, obj):
        if obj.is_active:
            return format_html(
                '<span style="color: #10b981; font-weight: 600; font-size: 12px;">'
                '<i class="fas fa-circle" style="font-size: 8px; vertical-align: middle; margin-right: 4px;"></i>Faol</span>'
            )
        return format_html(
            '<span style="color: #ef4444; font-weight: 600; font-size: 12px;">'
            '<i class="fas fa-circle" style="font-size: 8px; vertical-align: middle; margin-right: 4px;"></i>Nofaol</span>'
        )

    @admin.display(description="So'rovlar ruxsati")
    def inquiries_badge(self, obj):
        if obj.has_inquiries_access:
            return format_html(
                '<span class="badge badge-success" style="font-size: 11px; padding: 4px 8px; border-radius: 8px;">'
                '<i class="fas fa-check-circle mr-1"></i>Ruxsat bor</span>'
            )
        return format_html(
            '<span class="badge badge-secondary" style="font-size: 11px; padding: 4px 8px; border-radius: 8px; color: #94a3b8;">'
            '<i class="fas fa-times-circle mr-1"></i>Ruxsat yo\'q</span>'
        )

    @admin.display(description="Parol")
    def password_action(self, obj):
        return format_html(
            '<a class="btn btn-xs btn-outline-warning" href="{}/password/" style="padding: 3px 8px; font-size: 11px; border-radius: 6px; font-weight: 500;">'
            '<i class="fas fa-key mr-1"></i>O\'zgartirish</a>',
            obj.pk,
        )

    # ---------------- Rollar asosida ruxsatlar ----------------
    def has_delete_permission(self, request, obj=None):
        if not (request and (request.user.is_superuser or request.user.global_role == GlobalRole.ADMIN)):
            return False
        if obj and obj.pk == request.user.pk:
            return False
        return True

    def get_readonly_fields(self, request, obj=None):
        readonly = list(super().get_readonly_fields(request, obj))
        if request and hasattr(request, "user") and not request.user.is_superuser:
            readonly.extend(["is_superuser", "user_permissions"])
            if request.user.global_role != GlobalRole.ADMIN:
                readonly.extend(["groups", "is_staff"])
        return readonly



# ---------------- Faqat ADMIN roli admin panelga kira oladi ----------------
def admin_site_has_permission(request):
    """Admin panelga FAQAT ADMIN roli yoki superuser kira olishi shart."""
    return (
        request.user.is_active
        and (
            request.user.is_superuser
            or getattr(request.user, "global_role", None) == GlobalRole.ADMIN
        )
    )


admin.site.has_permission = admin_site_has_permission


