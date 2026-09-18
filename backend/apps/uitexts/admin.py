"""Django Admin — Tizim brendingi va logotipi boshqaruvi."""
from django.contrib import admin
from django.shortcuts import redirect
from django.urls import reverse
from django.utils.html import format_html
from apps.core.media import media_url
from .models import SystemSetting


@admin.register(SystemSetting)
class SystemSettingAdmin(admin.ModelAdmin):
    """Tizim nomi va logotipini admin panel orqali oson va qulay boshqarish."""

    list_display = ("app_name", "logo_preview", "updated_at")
    readonly_fields = ("logo_preview", "updated_at")
    save_on_top = True

    fieldsets = (
        ("Tizim nomi va logotipini o'zgartirish", {
            "description": (
                "Bu yerdan loyihangiz nomini (standart 'TeamFlow' o'rniga) va logotip rasmini "
                "o'zgartirishingiz mumkin. O'zgartirish saqlangach, yangi nom va logotip butun tizim bo'ylab "
                "(Django Admin paneli, foydalanuvchilar portali va brauzer sarlavhasida) darhol yangilanadi."
            ),
            "fields": ("app_name", "logo"),
        }),
        ("Hozirgi holat", {
            "fields": ("logo_preview", "updated_at"),
        }),
    )

    @admin.display(description="Hozirgi faol logotip")
    def logo_preview(self, obj):
        if obj and obj.logo:
            url = media_url(obj.logo)
            return format_html(
                '<div style="background: #1f2937; padding: 12px 18px; display: inline-block; border-radius: 8px; border: 1px solid #374151;">'
                '<img src="{}" alt="Logo" style="max-height: 70px; max-width: 220px; object-fit: contain; vertical-align: middle;" />'
                '</div>',
                url,
            )
        return format_html(
            '<div style="color: #9ca3af; font-style: italic; padding: 6px 0;">'
            'Maxsus logotip yuklanmagan (tizimning standart SVG ramzi ko\'rsatiladi)'
            '</div>'
        )

    def has_add_permission(self, request):
        return not SystemSetting.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        """Ro'yxat sahifasini chetlab o'tib, to'g'ridan-to'g'ri o'zgartirish formasiga yo'naltirish."""
        obj = SystemSetting.get_settings()
        return redirect(reverse("admin:uitexts_systemsetting_change", args=[obj.id]))

    def response_change(self, request, obj):
        """Saqlangandan so'ng xuddi shu sahifada qolish va tushunarli bildirishnoma berish."""
        self.message_user(
            request,
            f"✅ Tizim nomi «{obj.app_name}» va logotipi muvaffaqiyatli saqlandi! "
            "Yangi brending butun tizimda darhol ishga tushdi."
        )
        return redirect(reverse("admin:uitexts_systemsetting_change", args=[obj.id]))
