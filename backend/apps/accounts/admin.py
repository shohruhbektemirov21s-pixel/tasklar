from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html

from .models import Department, GlobalRole, SpecialtyAnalytics, SpecialtyItem, User
from .specialties import Seniority, Specialty, profile_for


@admin.register(SpecialtyItem)
class SpecialtyItemAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "icon", "color_preview", "skills", "is_active", "order")
    list_editable = ("is_active", "order")
    search_fields = ("name", "code", "skills")
    ordering = ("order", "name")

    fieldsets = (
        ("Mutaxassislik ma'lumotlari", {
            "fields": ("name", "code", "skills"),
            "description": "Mutaxassislik nomi va kodi tizimda identifikator sifatida ishlatiladi."
        }),
        ("Dizayn va Belgilar", {
            "fields": ("icon", "color", "order", "is_active"),
            "description": "Rang va belgi tizim interfeysi, badgelar va kartalarda aks etadi."
        }),
    )

    def save_model(self, request, obj, form, change):
        if not obj.code:
            import re
            obj.code = re.sub(r"[^A-Z0-9_]+", "_", obj.name.upper()).strip("_")[:40]
        else:
            obj.code = obj.code.strip().upper()
        super().save_model(request, obj, form, change)

    @admin.display(description="Rang")
    def color_preview(self, obj):
        return format_html(
            '<span style="display:inline-block; width:16px; height:16px; border-radius:4px; '
            'background-color:{}; border:1px solid rgba(0,0,0,0.15); vertical-align:middle; margin-right:6px;"></span>'
            '<code>{}</code>',
            obj.color, obj.color
        )


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


@admin.register(SpecialtyAnalytics)
class SpecialtyAnalyticsAdmin(admin.ModelAdmin):
    def changelist_view(self, request, extra_context=None):
        from django.shortcuts import redirect
        from django.urls import reverse
        return redirect(reverse("admin:accounts_user_analytics"))


class UserApprovalStatusFilter(admin.SimpleListFilter):
    title = "Tasdiqlash holati"
    parameter_name = "approval_status"

    def lookups(self, request, model_admin):
        return (
            ("pending", "⏳ Tasdiq kutilmoqda (Nofaol)"),
            ("active", "✅ Tasdiqlangan va Faol"),
            ("inquiries", "📨 So'rovlar ruxsati borlar"),
            ("staff", "👑 Tizim adminlari"),
        )

    def queryset(self, request, queryset):
        from django.db.models import Q
        if self.value() == "pending":
            return queryset.filter(is_active=False)
        if self.value() == "active":
            return queryset.filter(is_active=True)
        if self.value() == "inquiries":
            return queryset.filter(can_access_inquiries=True)
        if self.value() == "staff":
            return queryset.filter(Q(is_staff=True) | Q(global_role=GlobalRole.ADMIN))
        return queryset


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        "full_name",
        "email",
        "role_badge",
        "specialty_badge",
        "department_badge",
        "active_badge",
        "approval_action",
    )
    list_filter = (
        UserApprovalStatusFilter,
        "can_access_inquiries",
        "department",
        "global_role",
        "is_active",
        "is_staff",
        "specialty",
        "seniority",
    )
    search_fields = ("email", "full_name", "department__name", "department__code", "skills", "job_title", "telegram")
    ordering = ("-date_joined",)
    actions = [
        "approve_selected_users",
        "deactivate_selected_users",
        "grant_inquiries_selected",
        "revoke_inquiries_selected",
    ]

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
            "fields": ("full_name", "department", "specialty", "job_title", "global_role", "can_access_inquiries"),
            "description": "Foydalanuvchi biriktiriladigan boshqarma, F.I.Sh., mutaxassisligi, lavozimi va So'rovlar ruxsatini belgilang."
        }),
    )

    def formfield_for_dbfield(self, db_field, **kwargs):
        if db_field.name == "specialty":
            from .specialties import specialty_catalog
            from django import forms
            choices = [(s["value"], s["label"]) for s in specialty_catalog()]
            return forms.ChoiceField(choices=choices, label="Mutaxassislik", required=False)
        return super().formfield_for_dbfield(db_field, **kwargs)


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
                '<span style="background-color: #10b981; color: #fff; padding: 4px 8px; border-radius: 8px; font-weight: 600; font-size: 11px; display: inline-flex; align-items: center;">'
                '<i class="fas fa-check-circle mr-1" style="font-size: 9px;"></i>Faol</span>'
            )
        return format_html(
            '<span style="background-color: #f59e0b; color: #fff; padding: 4px 8px; border-radius: 8px; font-weight: 600; font-size: 11px; display: inline-flex; align-items: center;">'
            '<i class="fas fa-clock mr-1" style="font-size: 9px;"></i>Tasdiq kutilmoqda</span>'
        )

    @admin.display(description="Tasdiqlash / Bloklash")
    def approval_action(self, obj):
        from django.urls import reverse
        if not obj.is_active:
            approve_url = reverse("admin:accounts_user_approve", args=[obj.pk])
            return format_html(
                '<a class="btn btn-xs btn-success" href="{}" style="padding: 4px 10px; font-size: 11px; border-radius: 6px; font-weight: 600; background-color: #10b981; border: none; color: #fff; text-decoration: none; display: inline-flex; align-items: center; box-shadow: 0 1px 2px rgba(16,185,129,0.3);">'
                '<i class="fas fa-check mr-1" style="font-size: 9px;"></i>Tasdiqlash</a>',
                approve_url,
            )
        if obj.is_superuser:
            return format_html('<span style="color: #94a3b8; font-size: 11px; font-style: italic;">Superuser</span>')
        deactivate_url = reverse("admin:accounts_user_deactivate", args=[obj.pk])
        return format_html(
            '<a class="btn btn-xs btn-outline-danger" href="{}" style="padding: 3px 8px; font-size: 11px; border-radius: 6px; font-weight: 500; color: #ef4444; border: 1px solid #fca5a5; background-color: #fef2f2; text-decoration: none; display: inline-flex; align-items: center;" onclick="return confirm(\'Rostdan ham {} hisobini nofaol qilmoqchimisiz?\');">'
            '<i class="fas fa-ban mr-1" style="font-size: 9px;"></i>Bloklash</a>',
            deactivate_url,
            obj.full_name or obj.email,
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

    # ---------------- Guruhli amallar (Actions) ----------------
    @admin.action(description="⚡ Tanlangan foydalanuvchilarni tasdiqlash (faollashtirish)")
    def approve_selected_users(self, request, queryset):
        from django.contrib import messages
        from apps.activity.services import log

        count = 0
        for u in queryset:
            if not u.is_active:
                u.is_active = True
                u.save(update_fields=["is_active"])
                count += 1
                try:
                    log(actor=request.user, verb="user.approved", target=u,
                        summary=f"{u.full_name} administrator tomonidan guruhli tasdiqlandi.")
                except Exception:
                    pass

        self.message_user(
            request,
            f"{count} ta foydalanuvchi muvaffaqiyatli tasdiqlandi va faollashtirildi.",
            level=messages.SUCCESS,
        )

    @admin.action(description="🚫 Tanlangan foydalanuvchilarni nofaol qilish (bloklash)")
    def deactivate_selected_users(self, request, queryset):
        from django.contrib import messages
        from apps.activity.services import log

        queryset = queryset.exclude(pk=request.user.pk)
        count = 0
        for u in queryset:
            if u.is_active:
                u.is_active = False
                u.save(update_fields=["is_active"])
                count += 1
                try:
                    log(actor=request.user, verb="user.deactivated", target=u,
                        summary=f"{u.full_name} administrator tomonidan bloklandi.")
                except Exception:
                    pass

        self.message_user(
            request,
            f"{count} ta foydalanuvchi nofaol holatga o'tkazildi.",
            level=messages.WARNING,
        )

    @admin.action(description="📩 Tanlangan foydalanuvchilarga So'rovlar ruxsatini berish")
    def grant_inquiries_selected(self, request, queryset):
        from django.contrib import messages
        updated = queryset.update(can_access_inquiries=True)
        self.message_user(
            request,
            f"{updated} ta foydalanuvchiga So'rovlar bo'limiga kirish ruxsati berildi.",
            level=messages.SUCCESS,
        )

    @admin.action(description="❌ Tanlangan foydalanuvchilardan So'rovlar ruxsatini olish")
    def revoke_inquiries_selected(self, request, queryset):
        from django.contrib import messages
        updated = queryset.update(can_access_inquiries=False)
        self.message_user(
            request,
            f"{updated} ta foydalanuvchidan So'rovlar ruxsati olindi.",
            level=messages.INFO,
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
            path(
                "<int:user_id>/approve/",
                self.admin_site.admin_view(self.approve_user_view),
                name="accounts_user_approve",
            ),
            path(
                "<int:user_id>/deactivate/",
                self.admin_site.admin_view(self.deactivate_user_view),
                name="accounts_user_deactivate",
            ),
        ]
        return custom_urls + urls

    def approve_user_view(self, request, user_id):
        from django.contrib import messages
        from django.shortcuts import get_object_or_404, redirect
        from django.urls import reverse
        from apps.activity.services import log

        if not (request.user.is_superuser or getattr(request.user, "global_role", None) == GlobalRole.ADMIN):
            messages.error(request, "Foydalanuvchilarni tasdiqlash uchun administrator huquqi talab qilinadi.")
            return redirect("admin:accounts_user_changelist")

        target_user = get_object_or_404(User, pk=user_id)
        target_user.is_active = True
        target_user.save(update_fields=["is_active"])

        try:
            log(
                actor=request.user,
                verb="user.approved",
                target=target_user,
                summary=f"{target_user.full_name} ({target_user.email}) administrator tomonidan tasdiqlandi va hisobi faollashtirildi."
            )
        except Exception:
            pass

        messages.success(
            request,
            format_html(
                '<strong>{}</strong> muvaffaqiyatli tasdiqlandi va hisobi faollashtirildi! Endi foydalanuvchi tizimga kira oladi.',
                target_user.full_name or target_user.email
            )
        )
        referer = request.META.get("HTTP_REFERER")
        if referer and "accounts/user" in referer:
            return redirect(referer)
        return redirect(reverse("admin:accounts_user_changelist"))

    def deactivate_user_view(self, request, user_id):
        from django.contrib import messages
        from django.shortcuts import get_object_or_404, redirect
        from django.urls import reverse
        from apps.activity.services import log

        if not (request.user.is_superuser or getattr(request.user, "global_role", None) == GlobalRole.ADMIN):
            messages.error(request, "Ushbu amal uchun administrator huquqi talab qilinadi.")
            return redirect("admin:accounts_user_changelist")

        target_user = get_object_or_404(User, pk=user_id)
        if target_user.pk == request.user.pk:
            messages.error(request, "O'z hisobingizni nofaol qila olmaysiz!")
            return redirect("admin:accounts_user_changelist")

        target_user.is_active = False
        target_user.save(update_fields=["is_active"])

        try:
            log(
                actor=request.user,
                verb="user.deactivated",
                target=target_user,
                summary=f"{target_user.full_name} ({target_user.email}) administrator tomonidan nofaol qilindi / bloklandi."
            )
        except Exception:
            pass

        messages.warning(
            request,
            format_html(
                '<strong>{}</strong> hisobi nofaol holatga o\'tkazildi (bloklandi).',
                target_user.full_name or target_user.email
            )
        )
        referer = request.META.get("HTTP_REFERER")
        if referer and "accounts/user" in referer:
            return redirect(referer)
        return redirect(reverse("admin:accounts_user_changelist"))

    def changelist_view(self, request, extra_context=None):
        from django.contrib import messages
        from django.urls import reverse

        extra_context = extra_context or {}
        extra_context["show_analytics_button"] = True

        # Agar filtr belgilanmagan bo'lsa va tasdiqlanmaganlar bo'lsa, ogohlantirish
        if not request.GET.get("approval_status"):
            pending_count = User.objects.filter(is_active=False).count()
            if pending_count > 0:
                filter_url = f"{reverse('admin:accounts_user_changelist')}?approval_status=pending"
                messages.warning(
                    request,
                    format_html(
                        'Diqqat: <strong>{} ta yangi foydalanuvchi</strong> administrator tasdig\'ini kutmoqda! '
                        '<a href="{}" style="text-decoration: underline; font-weight: bold; margin-left: 6px;">'
                        '<i class="fas fa-filter mr-1"></i>Ularni ko\'rish va tasdiqlash &rarr;</a>',
                        pending_count,
                        filter_url,
                    )
                )

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


# Keraksiz tizim modellarini admin paneldan tozalash (sodda interfeys uchun)
from django.contrib.auth.models import Group
try:
    admin.site.unregister(Group)
except Exception:
    pass

try:
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
    admin.site.unregister(BlacklistedToken)
    admin.site.unregister(OutstandingToken)
except Exception:
    pass

admin.site.site_header = "⚡ TeamFlow Boshqaruv Markazi"
admin.site.site_title = "TeamFlow Admin"
admin.site.index_title = "Boshqaruv Paneli"


