"""So'rovlar (Inquiries) — xodimlar so'rovlari va boshliq qarori.

Ruxsatlar:
  * So'rovlar bo'limiga faqat admin ruxsat bergan xodimlar hamda
    boshliq (BOSS) va tizim admini (ADMIN) kira oladi.
  * Ochiq so'rov — bo'limga kira oladigan barcha xodimlarga ko'rinadi.
  * Yopiq so'rov — faqat muallif va boshliqqa ko'rinadi.
  * Anonimlik — muallif hech kimga ochilmaydi.
"""
from django.conf import settings
from django.db import models


class InquiryScope(models.TextChoices):
    OPEN = "OPEN", "Ochiq"
    CLOSED = "CLOSED", "Yopiq"


class InquiryStatus(models.TextChoices):
    PENDING = "PENDING", "Ko'rib chiqilmoqda"
    APPROVED = "APPROVED", "Tasdiqlangan"
    REJECTED = "REJECTED", "Rad etilgan"


class VoteChoice(models.TextChoices):
    FOR = "FOR", "Qo'shilaman"
    AGAINST = "AGAINST", "Qo'shilmayman"
    NEUTRAL = "NEUTRAL", "Betarafman"


class Inquiry(models.Model):
    """Bitta so'rov."""

    title = models.CharField("Sarlavha", max_length=200)
    body = models.TextField("So'rov matni")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name="inquiries", verbose_name="Muallif")
    scope = models.CharField("Turi", max_length=10, choices=InquiryScope.choices,
                             default=InquiryScope.OPEN, db_index=True)
    is_anonymous = models.BooleanField("Anonim", default=False,
                                       help_text="Muallif hech kimga ko'rsatilmaydi")

    status = models.CharField("Holat", max_length=10, choices=InquiryStatus.choices,
                              default=InquiryStatus.PENDING, db_index=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="decided_inquiries",
                                   verbose_name="Qaror qilgan")
    decided_at = models.DateTimeField("Qaror vaqti", null=True, blank=True)
    decision_note = models.TextField("Boshliq izohi", blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "So'rov"
        verbose_name_plural = "So'rovlar"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["scope", "-created_at"]),
            models.Index(fields=["author", "-created_at"]),
        ]

    def __str__(self):
        return self.title

    @property
    def is_open(self):
        return self.scope == InquiryScope.OPEN

    @property
    def is_decided(self):
        return self.status != InquiryStatus.PENDING

    def clear_decision(self):
        """So'rov o'zgarganda qaror bekor qilinadi va qayta navbatga tushadi."""
        self.status = InquiryStatus.PENDING
        self.decided_by = None
        self.decided_at = None
        self.decision_note = ""


class InquiryVote(models.Model):
    """Bir foydalanuvchining so'rovga bergan ovozi."""

    inquiry = models.ForeignKey(Inquiry, on_delete=models.CASCADE,
                                related_name="votes", verbose_name="So'rov")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="inquiry_votes", verbose_name="Kim")
    choice = models.CharField("Tanlov", max_length=10, choices=VoteChoice.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "So'rov ovozi"
        verbose_name_plural = "So'rov ovozlari"
        unique_together = ("inquiry", "user")
        indexes = [models.Index(fields=["inquiry", "choice"])]

    def __str__(self):
        return "{}: {}".format(self.inquiry_id, self.get_choice_display())


def inquiry_file_path(instance, filename):
    return "inquiries/{}/{}".format(instance.inquiry_id, filename)


class InquiryFile(models.Model):
    """So'rovga biriktirilgan fayl."""

    inquiry = models.ForeignKey(Inquiry, on_delete=models.CASCADE,
                                related_name="files", verbose_name="So'rov")
    file = models.FileField("Fayl", upload_to=inquiry_file_path)
    original_name = models.CharField("Fayl nomi", max_length=255, blank=True)
    size = models.PositiveBigIntegerField("Hajmi (bayt)", default=0)
    content_type = models.CharField("Turi", max_length=120, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, related_name="inquiry_files",
                                    verbose_name="Yuklagan")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "So'rov fayli"
        verbose_name_plural = "So'rov fayllari"
        ordering = ["created_at"]

    def __str__(self):
        return self.original_name or str(self.file)

    def save(self, *args, **kwargs):
        if self.file and not self.original_name:
            self.original_name = self.file.name.rsplit("/", 1)[-1][:255]
        if self.file and not self.size:
            try:
                self.size = self.file.size
            except Exception:
                self.size = 0
        super().save(*args, **kwargs)

    @property
    def size_display(self):
        n = float(self.size or 0)
        for unit in ("B", "KB", "MB", "GB"):
            if n < 1024:
                return "{:.0f} {}".format(n, unit) if unit == "B" else "{:.1f} {}".format(n, unit)
            n /= 1024
        return "{:.1f} TB".format(n)

    @property
    def extension(self):
        name = self.original_name or str(self.file)
        return name.rsplit(".", 1)[-1].lower() if "." in name else ""

    @property
    def is_image(self):
        return self.extension in ("png", "jpg", "jpeg", "gif", "webp", "bmp")
