"""Interfeys matnlari — sayt so'zlari bazada, kod ichida emas.

NEGA. Ilgari har bir yozuv (tugma nomi, sarlavha, bo'sh holat xabari) React
komponentining ichida qattiq yozilgan edi. Bitta so'zni tuzatish uchun ham
kodni o'zgartirib, qayta yig'ish va qayta joylash kerak bo'lardi. Endi matn
Db2 da turadi: `django-admin/` dan tahrirlanadi va sahifa yangilanishi bilan
o'zgarish ko'rinadi.

KALIT. `sahifa.joy` ko'rinishida: `login.title`, `common.save`. Kalit kodda
qoladi va o'zgarmaydi — o'zgaradigani faqat `value`.
"""
from django.db import models


class UiText(models.Model):
    """Interfeysdagi bitta yozuv."""

    key = models.CharField("Kalit", max_length=150, unique=True)
    value = models.TextField("Matn")
    # Guruh — admin ro'yxatini saralash va filtrlash uchun (kalitning
    # birinchi bo'lagi: `login`, `common`, `tasks` ...).
    group = models.CharField("Guruh", max_length=60, blank=True, db_index=True)
    note = models.CharField("Izoh", max_length=250, blank=True,
                            help_text="Bu matn qayerda chiqadi")
    updated_at = models.DateTimeField("O'zgartirilgan", auto_now=True)

    class Meta:
        verbose_name = "Interfeys matni"
        verbose_name_plural = "Interfeys matnlari"
        ordering = ("group", "key")

    def __str__(self):
        return self.key

    def save(self, *args, **kwargs):
        # Guruh doim kalitdan kelib chiqadi — qo'lda kiritilgani chalkashmasin.
        self.group = self.key.split(".", 1)[0] if "." in self.key else ""
        super().save(*args, **kwargs)
        from django.core.cache import cache
        cache.delete("uitexts:data")
        cache.delete("uitexts:version")

    def delete(self, *args, **kwargs):
        super().delete(*args, **kwargs)
        from django.core.cache import cache
        cache.delete("uitexts:data")
        cache.delete("uitexts:version")


def branding_logo_upload_to(instance, filename):
    import os
    import time
    ext = os.path.splitext(filename)[1].lower() or ".png"
    return f"branding/logo_{int(time.time())}{ext}"


class SystemSetting(models.Model):
    """Tizim sozlamalari: brending, logotip va tizim nomi."""

    key = models.CharField("Sozlama kaliti", max_length=60, unique=True, default="branding")
    app_name = models.CharField(
        "Tizim / Loyiha nomi",
        max_length=150,
        default="TeamFlow",
        help_text="Masalan: 'TeamFlow', 'Mening Kompaniyam' yoki loyihangiz nomi. Ushbu nom butun tizim bo'ylab (Admin panel, foydalanuvchilar paneli, xabarnomalar va brauzer sarlavhasi) darhol o'zgaradi."
    )
    logo = models.FileField(
        "Yangi logotip yuklash",
        upload_to=branding_logo_upload_to,
        blank=True,
        null=True,
        help_text="Tizim logotipi uchun rasm faylini tanlang (PNG, SVG, JPG, WebP). Saqlash tugmasini bosishingiz bilan butun saytda yangi logotip ko'rinadi."
    )
    updated_at = models.DateTimeField("O'zgartirilgan", auto_now=True)

    class Meta:
        verbose_name = "Brending va logotip sozlamasi"
        verbose_name_plural = "Brending va logotip sozlamalari"

    def __str__(self):
        return f"{self.app_name or 'TeamFlow'} (Brending)"

    @classmethod
    def get_settings(cls):
        from django.core.cache import cache
        cached = cache.get("uitexts:branding_obj")
        if cached is not None:
            return cached
        obj, _ = cls.objects.get_or_create(key="branding", defaults={"app_name": "TeamFlow"})
        cache.set("uitexts:branding_obj", obj, 300)
        return obj

    def save(self, *args, **kwargs):
        # Eski logotip almashtirilsa, diskdagi eski faylni tozalash
        if self.pk:
            try:
                old = SystemSetting.objects.filter(pk=self.pk).first()
                if old and old.logo and old.logo != self.logo:
                    old.logo.delete(save=False)
            except Exception:
                pass
        super().save(*args, **kwargs)
        from django.core.cache import cache
        from django.conf import settings
        from django.contrib import admin
        from apps.core.media import media_url

        # 1. Keshni tozalash
        cache.delete("uitexts:data")
        cache.delete("uitexts:version")
        cache.delete("uitexts:branding")
        cache.delete("uitexts:branding_obj")

        app_title = self.app_name or "TeamFlow"
        logo_url = media_url(self.logo) if self.logo else None

        # 2. Django Admin va Jazzmin sarlavhalarini darhol yangilash
        try:
            admin.site.site_header = f"⚡ {app_title} Boshqaruv"
            admin.site.site_title = f"{app_title} Admin"
            admin.site.index_title = f"{app_title} Boshqaruv Paneli"

            if hasattr(settings, "JAZZMIN_SETTINGS"):
                settings.JAZZMIN_SETTINGS["site_title"] = f"{app_title} Admin"
                settings.JAZZMIN_SETTINGS["site_header"] = f"⚡ {app_title} Boshqaruv"
                settings.JAZZMIN_SETTINGS["site_brand"] = app_title
                settings.JAZZMIN_SETTINGS["site_logo"] = logo_url
                settings.JAZZMIN_SETTINGS["welcome_sign"] = f"{app_title} Boshqaruv Paneliga xush kelibsiz!"
                settings.JAZZMIN_SETTINGS["copyright"] = app_title
        except Exception:
            pass

        # 3. WebSocket orqali barcha foydalanuvchilarga real-time xabar uzatish
        try:
            from apps.notifications.services import send_to_users
            from django.contrib.auth import get_user_model
            User = get_user_model()
            all_users = list(User.objects.filter(is_active=True))
            logo_url = media_url(self.logo) if self.logo else None
            send_to_users(all_users, {
                "event": "system.branding_update",
                "app_name": app_title,
                "logo_url": logo_url,
            })
        except Exception:
            pass

