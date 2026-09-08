from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html

from .models import Department, GlobalRole, User, SpecialtyAnalytics
from .specialties import Specialty, Seniority, profile_for


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
        "specialty_badge",
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
            GlobalRole.SOHAVIY: ("#0284c7", "🏛️ Sohaviy boshqarma"),
        }
        color, label = colors.get(obj.global_role, ("#6b7280", obj.get_global_role_display()))
        return format_html(
            '<span style="background-color: {}; color: #fff; padding: 4px 10px; '
            'border-radius: 12px; font-weight: 600; font-size: 11px; display: inline-block; '
            'box-shadow: 0 1px 3px rgba(0,0,0,0.12);">{}</span>',
            color,
            label,
        )

    @admin.display(description="Mutaxassislik")
    def specialty_badge(self, obj):
        p = obj.specialty_profile
        color = p.get("color", "#64748b")
        icon = p.get("icon", "*")
        return format_html(
            '<span style="border-left: 3px solid {}; background: rgba(100,116,139,0.08); padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;">'
            '<span style="color: {}; font-weight: bold; margin-right: 4px;">{}</span>{}</span>',
            color, color, icon, obj.get_specialty_display()
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

    def get_urls(self):
        from django.urls import path
        urls = super().get_urls()
        custom_urls = [
            path(
                "analytics/",
                self.admin_site.admin_view(self.specialties_analytics_view),
                name="accounts_user_analytics",
            ),
        ]
        return custom_urls + urls

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        extra_context["show_analytics_button"] = True
        return super().changelist_view(request, extra_context=extra_context)

    def specialties_analytics_view(self, request):
        from datetime import timedelta
        from django.db.models import Avg, Count, Q
        from django.template.response import TemplateResponse
        from django.utils import timezone

        now = timezone.now()
        last_7_days = now - timedelta(days=7)
        last_30_days = now - timedelta(days=30)

        total_users = User.objects.count()
        active_users = User.objects.filter(is_active=True).count()
        sohaviy_users = User.objects.filter(
            Q(global_role=GlobalRole.SOHAVIY) | Q(specialty=Specialty.SOHAVIY)
        ).count()
        new_7_days = User.objects.filter(date_joined__gte=last_7_days).count()
        new_30_days = User.objects.filter(date_joined__gte=last_30_days).count()

        # Mutaxassisliklar bo'yicha guruhlash
        specialty_stats = []
        counts_by_spec = dict(
            User.objects.values("specialty").annotate(cnt=Count("id")).values_list("specialty", "cnt")
        )
        active_by_spec = dict(
            User.objects.filter(is_active=True).values("specialty").annotate(cnt=Count("id")).values_list("specialty", "cnt")
        )
        avg_exp_by_spec = dict(
            User.objects.values("specialty").annotate(avg=Avg("years_experience")).values_list("specialty", "avg")
        )

        seniority_matrix = {}
        for s_val, _ in Specialty.choices:
            seniority_matrix[s_val] = {sen_val: 0 for sen_val, _ in Seniority.choices}

        sen_counts = User.objects.values("specialty", "seniority").annotate(cnt=Count("id"))
        for item in sen_counts:
            sp = item["specialty"]
            sn = item["seniority"]
            if sp in seniority_matrix and sn in seniority_matrix[sp]:
                seniority_matrix[sp][sn] = item["cnt"]

        seniority_totals = {sen_val: 0 for sen_val, _ in Seniority.choices}
        for s_dict in seniority_matrix.values():
            for sen_val, count in s_dict.items():
                seniority_totals[sen_val] += count

        for val, label in Specialty.choices:
            cnt = counts_by_spec.get(val, 0)
            act_cnt = active_by_spec.get(val, 0)
            pct = round((cnt / total_users * 100), 1) if total_users > 0 else 0
            avg_exp = round(avg_exp_by_spec.get(val) or 0, 1)
            prof = profile_for(val)
            specialty_stats.append({
                "code": val,
                "label": label,
                "icon": prof.get("icon", "*"),
                "color": prof.get("color", "#64748b"),
                "count": cnt,
                "active_count": act_cnt,
                "percentage": pct,
                "avg_experience": avg_exp,
                "seniority": seniority_matrix.get(val, {}),
            })

        specialty_stats.sort(key=lambda x: x["count"], reverse=True)

        recent_registrations = User.objects.select_related("department").order_by("-date_joined")[:10]

        dept_stats = []
        departments = list(Department.objects.only("id", "name", "code"))
        for dept in departments:
            members_qs = dept.members.all()
            cnt = members_qs.count()
            if cnt > 0:
                dept_specialties = list(
                    members_qs.values("specialty").annotate(cnt=Count("id")).order_by("-cnt")
                )
                dept_stats.append({
                    "department": dept,
                    "total": cnt,
                    "specialties": dept_specialties,
                })

        context = {
            **self.admin_site.each_context(request),
            "title": "Ro'yxatdan o'tgan foydalanuvchilar mutaxassisliklari tahlili",
            "total_users": total_users,
            "active_users": active_users,
            "sohaviy_users": sohaviy_users,
            "new_7_days": new_7_days,
            "new_30_days": new_30_days,
            "specialty_stats": specialty_stats,
            "seniority_choices": Seniority.choices,
            "seniority_totals": seniority_totals,
            "recent_registrations": recent_registrations,
            "dept_stats": dept_stats,
            "opts": self.model._meta,
        }
        return TemplateResponse(request, "admin/accounts/user/analytics.html", context)


@admin.register(SpecialtyAnalytics)
class SpecialtyAnalyticsAdmin(admin.ModelAdmin):
    def changelist_view(self, request, extra_context=None):
        from django.shortcuts import redirect
        from django.urls import reverse
        return redirect(reverse("admin:accounts_user_analytics"))



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


