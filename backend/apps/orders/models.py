"""Axborot tizimiga o'zgartirish kiritish bo'yicha so'rovlar (Buyurtmalar / TZ) modeli.

Ushbu model rasmiy «AXBOROT TIZIMIGA O'ZGARTIRISH KIRITISH BO'YICHA SO'ROV BLANKASI»
(Буюртма.docx) asosida yaratilgan. Undagi barcha 5 ta bo'lim va metama'lumotlar,
shuningdek, tegishli Loyiha (Project), biriktirilgan TZ fayli hamda PM tomonidan
belgilanadigan muddat va qanchada tugashi ko'rsatkichlari to'liq qamrab olingan.
"""
from django.conf import settings
from django.db import models
from django.utils import timezone


class ChangeRequestPriority(models.TextChoices):
    URGENT = "URGENT", "Shoshilinch / O'ta muhim"
    HIGH = "HIGH", "Yuqori"
    MEDIUM = "MEDIUM", "O'rta"
    LOW = "LOW", "Past"


class ChangeRequestStatus(models.TextChoices):
    DRAFT = "DRAFT", "Qoralama"
    NEW = "NEW", "Yangi (Yuborilgan)"
    ACCEPTED = "ACCEPTED", "Qabul qilindi"
    ASSIGNED_TO_DEV = "ASSIGNED_TO_DEV", "Dasturchiga yo'naltirildi"
    IN_PROGRESS = "IN_PROGRESS", "Jarayonda"
    TESTING = "TESTING", "Test qilinmoqda"
    READY_FOR_REVIEW = "READY_FOR_REVIEW", "Boshqarma tasdig'ida"
    COMPLETED = "COMPLETED", "Bajarildi (Tasdiqlangan)"
    REJECTED = "REJECTED", "Rad etildi"
    CANCELLED = "CANCELLED", "Bekor qilingan (Atmen)"


class ChangeRequestType(models.TextChoices):
    NEW = "NEW", "Yangi loyiha"
    CONTINUATION = "CONTINUATION", "Davom ettiriladigan"
    NEEDS_CLASSIFICATION = "NEEDS_CLASSIFICATION", "Turlash kerak bo'lgan"
    MODERNIZATION = "MODERNIZATION", "Modernizatsiya va takomillashtirish"
    MAINTENANCE = "MAINTENANCE", "Texnik qo'llab-quvvatlash"


class ChangeNature(models.TextChoices):
    USER_FACING = "USER_FACING", "Foydalanuvchiga ko'rinadigan (Frontend/UI)"
    BACKEND = "BACKEND", "Ichki o'zgarish (Backend / Baza / API)"
    BOTH = "BOTH", "Ikkalasi ham (To'liq tizim bo'ylab)"


def order_tz_file_path(instance, filename):
    return f"orders/tz/{instance.request_no or 'new'}/{filename}"


class ChangeRequest(models.Model):
    """Tizimga o'zgartirish kiritish bo'yicha buyurtma talabnomasi (TZ)."""

    # Metama'lumotlar
    request_no = models.CharField("Talabnoma raqami", max_length=50, unique=True, db_index=True)
    system_name = models.CharField("Tizim nomi", max_length=150, default="TeamFlow")
    module = models.CharField("Modul", max_length=150, blank=True, default="")
    order_type = models.CharField(
        "Loyiha / Talabnoma turi",
        max_length=30,
        choices=ChangeRequestType.choices,
        default=ChangeRequestType.NEW,
        db_index=True,
        help_text="Loyiha turi: Yangi loyiha, Davom ettiriladigan yoki Turlash kerak bo'lgan",
    )
    request_date = models.DateField("Sana", default=timezone.localdate)
    department = models.CharField("Buyurtma qilayotgan bo'linma", max_length=200, blank=True, default="")
    responsible_person = models.CharField("Mas'ul shaxs", max_length=200, blank=True, default="")
    priority = models.CharField("Ustuvorligi / Muhimlilik turi", max_length=20,
                                choices=ChangeRequestPriority.choices,
                                default=ChangeRequestPriority.HIGH, db_index=True)
    due_date = models.DateField("Kerakli muddat (Buyurtmachi so'ragan)", null=True, blank=True)

    # Tegishli loyiha (Project)
    project = models.ForeignKey(
        "projects.Project",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="change_requests",
        verbose_name="Tegishli loyiha",
        help_text="Ushbu TZ biriktirilgan loyiha (axborot tizimi)",
    )

    # TZ (Texnik topshiriq) fayli va joriy versiya
    version = models.PositiveIntegerField("Joriy versiya", default=1)
    tz_file = models.FileField(
        "TZ fayli",
        upload_to="orders/tz/",
        null=True,
        blank=True,
        help_text="Texnik topshiriq hujjati (PDF, Word, Excel, Arxiv va h.k.)",
    )
    tz_file_name = models.CharField("TZ fayl nomi", max_length=255, blank=True, default="")
    tz_file_size = models.PositiveBigIntegerField("TZ fayl hajmi (bayt)", default=0)

    # 1. TIZIMGA QO'SHIMCHA VA O'ZGARTIRISH KIRITISH
    current_state = models.TextField("1.1 Joriy holat (nima ishlamayapti / nimani o'zgartirish kerak)", blank=True, default="")
    requested_change = models.TextField("1.2 Talab qilinayotgan o'zgartirish (aniq va batafsil tavsif)", blank=True, default="")
    reason = models.TextField("1.3 Sabab / maqsad (qonun talabi, biznes ehtiyoji, xato va h.k.)", blank=True, default="")

    # 2. TA'SIR DOIRASI
    affected_modules = models.TextField("2.1 Qaysi modul / funksionallikka ta'sir qiladi", blank=True)
    dependent_systems = models.TextField("2.2 Bog'liq tizimlar / integratsiyalar", blank=True)
    change_nature = models.CharField("2.3 O'zgarish xarakteri", max_length=20,
                                     choices=ChangeNature.choices, default=ChangeNature.BOTH)

    # 3. QO'SHIMCHA MATERIALLAR (ILOVALAR)
    additional_materials = models.TextField(
        "3. Skrinshotlar, xato xabarlari, texnik talablar va h.k.", blank=True
    )

    # 4. O'ZGARISHNI TEST QILISH (BUYURTMACHI TOMONIDAN TEST QILINADI)
    test_result = models.TextField("4.1 Test qilish natijasi", blank=True)

    # 5. TASDIQLASH VA IJRO (PM tomonidan belgilanadi)
    status = models.CharField("Holati", max_length=20, choices=ChangeRequestStatus.choices,
                              default=ChangeRequestStatus.NEW, db_index=True)
    client_signer = models.CharField("Buyurtmachi (F.I.Sh., sana)", max_length=200, blank=True)
    executor_signer = models.CharField("Ijrochi tomonidan qabul qilindi (F.I.Sh., sana)",
                                       max_length=200, blank=True)
    estimated_resources = models.CharField("Baholangan vaqt / resurslar", max_length=200, blank=True)

    # PM (Loyiha menejeri) vaqti va muddati
    pm_estimated_duration = models.CharField(
        "Qanchada tugashi (PM bahosi)",
        max_length=150,
        blank=True,
        default="",
        help_text="PM tomonidan belgilangan bajarilish vaqti (masalan: 10 ish kuni, 3 hafta, 1 oy)",
    )
    pm_deadline = models.DateField(
        "PM belgilagan yakuniy muddat",
        null=True,
        blank=True,
        help_text="Loyiha menejeri tomonidan tasdiqlangan topshirish sanasi",
    )
    assigned_pm = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_orders",
        verbose_name="Mas'ul PM",
    )
    assigned_developer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_dev_orders",
        verbose_name="Mas'ul dasturchi / Ijrochi",
        help_text="Ushbu buyurtma/topshiriq biriktirilgan dasturchi",
    )
    linked_task = models.ForeignKey(
        "tasks.Task",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="change_requests",
        verbose_name="Tegishli vazifa (Task)",
        help_text="Loyihadagi bog'langan dasturiy vazifa",
    )
    pm_notes = models.TextField(
        "PM xulosasi va ko'rsatmalari",
        blank=True,
        default="",
        help_text="Loyiha menejeri izohi yoki topshiriq tafsilotlari",
    )

    # 6. TUGATILGAN ISH HUJJATI VA TASDIQLASH (PM va Boshqarma o'rtasida)
    completion_file = models.FileField(
        "Tugatilgan ish hujjati",
        upload_to="orders/completion/",
        null=True,
        blank=True,
        help_text="Bajarilgan ish haqidagi hujjat yoki hisobot (PDF, Word, rasm va h.k.)",
    )
    completion_file_name = models.CharField("Tugatilgan ish fayli nomi", max_length=255, blank=True, default="")
    completion_file_size = models.PositiveBigIntegerField("Tugatilgan ish fayl hajmi", default=0)
    completion_note = models.TextField("Tugatilgan ish bo'yicha hisobot / PM izohi", blank=True, default="")
    completed_at = models.DateTimeField("Tugatishga topshirilgan sana", null=True, blank=True)

    client_feedback_note = models.TextField("Boshqarma fikri / qaytarishdagi xatolik izohi", blank=True, default="")
    client_approved_at = models.DateTimeField("Boshqarma tasdiqlagan sana", null=True, blank=True)
    client_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_change_requests",
        verbose_name="Tasdiqlagan boshqarma vakili",
    )

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="change_requests")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "O'zgartirish so'rovi (Buyurtma / TZ)"
        verbose_name_plural = "O'zgartirish so'rovlari (Buyurtmalar / TZ)"
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.request_no}] {self.system_name} - {self.module or 'Umumiy'}"

    @property
    def tz_file_size_display(self):
        size = float(self.tz_file_size or 0)
        for unit in ("B", "KB", "MB", "GB"):
            if size < 1024 or unit == "GB":
                return "{:.0f} {}".format(size, unit) if unit == "B" else "{:.1f} {}".format(size, unit)
            size /= 1024
        return "{:.1f} GB".format(size)

    @property
    def completion_file_size_display(self):
        size = float(self.completion_file_size or 0)
        for unit in ("B", "KB", "MB", "GB"):
            if size < 1024 or unit == "GB":
                return "{:.0f} {}".format(size, unit) if unit == "B" else "{:.1f} {}".format(size, unit)
            size /= 1024
        return "{:.1f} GB".format(size)

    def save(self, *args, **kwargs):
        # Agar loyiha tanlangan bo'lsa va unda menejer (PM) bo'lsa, avtomatik PM biriktiriladi
        if self.project and self.project.manager and not self.assigned_pm:
            self.assigned_pm = self.project.manager

        if not self.request_no:
            today_str = timezone.now().strftime("%Y%m%d")
            last_order = ChangeRequest.objects.filter(request_no__startswith=f"ORD-{today_str}").order_by("-id").first()
            if last_order:
                try:
                    num = int(last_order.request_no.split("-")[-1]) + 1
                except Exception:
                    num = 1
            else:
                num = 1
            self.request_no = f"ORD-{today_str}-{num:03d}"

        if self.tz_file and not self.tz_file_name:
            self.tz_file_name = self.tz_file.name.rsplit("/", 1)[-1][:255]
        if self.tz_file and not self.tz_file_size:
            try:
                self.tz_file_size = self.tz_file.size
            except Exception:
                self.tz_file_size = 0

        super().save(*args, **kwargs)


class ChangeRequestVersion(models.Model):
    """Buyurtma (TZ) ning versiyalari tarixi.

    Qabul qilingan TZ to'g'ridan-to'g'ri tahrirlanmaydi. Barcha keyingi o'zgarishlar
    versiyalar (v2, v3...) bilan joylashtiriladi va har bir versiya PM tomonidan
    qayta ko'rib chiqiladi.
    """

    order = models.ForeignKey(
        ChangeRequest,
        on_delete=models.CASCADE,
        related_name="versions",
        verbose_name="Buyurtma / TZ",
    )
    version = models.PositiveIntegerField("Versiya raqami")
    tz_file = models.FileField(
        "TZ fayli",
        upload_to="orders/tz/versions/",
        null=True,
        blank=True,
        help_text="Ushbu versiyaga tegishli TZ hujjati (PDF, Word, Excel va h.k.)",
    )
    tz_file_name = models.CharField("TZ fayl nomi", max_length=255, blank=True, default="")
    tz_file_size = models.PositiveBigIntegerField("TZ fayl hajmi (bayt)", default=0)
    change_note = models.TextField("O'zgarishlar tavsifi / sababi", blank=True, default="")
    requested_change = models.TextField("Talab qilinayotgan o'zgarishlar tavsifi", blank=True, default="")

    status = models.CharField(
        "Holati",
        max_length=20,
        choices=ChangeRequestStatus.choices,
        default=ChangeRequestStatus.NEW,
    )

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_order_versions",
        verbose_name="Yuklagan shaxs",
    )
    created_at = models.DateTimeField("Yuklangan vaqti", auto_now_add=True)

    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="decided_order_versions",
        verbose_name="Qaror qilgan PM",
    )
    decided_at = models.DateTimeField("Qaror vaqti", null=True, blank=True)
    decision_note = models.TextField("PM qaror izohi", blank=True, default="")

    class Meta:
        verbose_name = "TZ versiyasi"
        verbose_name_plural = "TZ versiyalari"
        ordering = ["-version"]
        unique_together = [("order", "version")]

    def __str__(self):
        return f"{self.order.request_no} v{self.version}"

    @property
    def tz_file_size_display(self):
        size = float(self.tz_file_size or 0)
        for unit in ("B", "KB", "MB", "GB"):
            if size < 1024 or unit == "GB":
                return "{:.0f} {}".format(size, unit) if unit == "B" else "{:.1f} {}".format(size, unit)
            size /= 1024
        return "{:.1f} GB".format(size)

    def save(self, *args, **kwargs):
        if self.tz_file and not self.tz_file_name:
            self.tz_file_name = self.tz_file.name.rsplit("/", 1)[-1][:255]
        if self.tz_file and not self.tz_file_size:
            try:
                self.tz_file_size = self.tz_file.size
            except Exception:
                self.tz_file_size = 0
        super().save(*args, **kwargs)


def order_attachment_path(instance, filename):
    order_id = getattr(instance, "order_id", "new")
    request_no = instance.order.request_no if instance.order and instance.order.request_no else str(order_id)
    return f"orders/attachments/{request_no}/{filename}"


class OrderAttachment(models.Model):
    """Buyurtmaga biriktirilgan bir nechta fayllar (TZ hujjatlari, ilovalar, skrinshotlar)."""

    order = models.ForeignKey(
        ChangeRequest,
        on_delete=models.CASCADE,
        related_name="attachments",
        verbose_name="Buyurtma / TZ",
    )
    file = models.FileField("Fayl", upload_to=order_attachment_path)
    original_name = models.CharField("Fayl nomi", max_length=255, blank=True, default="")
    size = models.PositiveBigIntegerField("Fayl hajmi (bayt)", default=0)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="order_attachments",
        verbose_name="Yuklagan foydalanuvchi",
    )
    created_at = models.DateTimeField("Yuklangan vaqti", auto_now_add=True)

    class Meta:
        verbose_name = "Buyurtma ilovasi / fayli"
        verbose_name_plural = "Buyurtma ilovalari / fayllari"
        ordering = ["id"]

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
        size = float(self.size or 0)
        for unit in ("B", "KB", "MB", "GB"):
            if size < 1024 or unit == "GB":
                return "{:.0f} {}".format(size, unit) if unit == "B" else "{:.1f} {}".format(size, unit)
            size /= 1024
        return "{:.1f} GB".format(size)

