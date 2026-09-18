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


class SystemSetting(models.Model):
    """Tizim sozlamalari: brending, logotip va tizim nomi."""

    key = models.CharField("Sozlama kaliti", max_length=60, unique=True, default="branding")
    app_name = models.CharField("Tizim / Loyiha nomi", max_length=150, default="TeamFlow")
    logo = models.FileField("Logotip", upload_to="branding/", blank=True, null=True)
    updated_at = models.DateTimeField("O'zgartirilgan", auto_now=True)

    class Meta:
        verbose_name = "Tizim sozlamasi"
        verbose_name_plural = "Tizim sozlamalari"

    def __str__(self):
        return f"{self.key}: {self.app_name}"

    @classmethod
    def get_settings(cls):
        obj, _ = cls.objects.get_or_create(key="branding", defaults={"app_name": "TeamFlow"})
        return obj

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        from django.core.cache import cache
        cache.delete("uitexts:data")
        cache.delete("uitexts:version")
        cache.delete("uitexts:branding")

