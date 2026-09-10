import hashlib

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone

from .specialties import Seniority, Specialty, profile_for

AVATAR_COLORS = [
    "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
    "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#3b82f6",
]


class GlobalRole(models.TextChoices):
    ADMIN = "ADMIN", "Admin"
    # Boshliq - takliflar bo'yicha qaror qabul qiladigan yagona rol.
    # Tizim adminidan ataylab AJRATILGAN: admin texnik huquqlarni boshqaradi,
    # boshliq esa jamoaning taklifini tasdiqlaydi yoki rad etadi. Ikkovini
    # bitta rolga qo'shsak, "faqat boshliq qaror qiladi" degan qoida
    # har bir adminga tarqalib ketardi.
    BOSS = "BOSS", "Boshliq"
    MANAGER = "MANAGER", "Loyiha menejeri"
    OPERATOR = "OPERATOR", "Operator"
    DEVELOPER = "DEVELOPER", "Dasturchi"
    SOHAVIY = "SOHAVIY", "Boshqarma"



class Department(models.Model):
    name = models.CharField("Boshqarma / Bo'lim nomi", max_length=150, unique=True,
                            help_text="Masalan: Axborot texnologiyalari boshqarmasi")
    code = models.CharField("Boshqarma kodi / Qisqartmasi", max_length=50, blank=True,
                            help_text="Masalan: IT, HR, PMO, FIN")
    description = models.TextField("Tavsif / Vazifalari", blank=True)
    created_at = models.DateTimeField("Yaratilgan vaqti", auto_now_add=True)
    updated_at = models.DateTimeField("Yangilangan vaqti", auto_now=True)

    class Meta:
        verbose_name = "Boshqarma"
        verbose_name_plural = "Boshqarmalar"
        ordering = ["name"]

    def __str__(self):
        if self.code:
            return f"{self.name} ({self.code})"
        return self.name


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Email majburiy")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("global_role", GlobalRole.ADMIN)
        if extra.get("is_staff") is not True or extra.get("is_superuser") is not True:
            raise ValueError("Superuser is_staff/is_superuser=True bo'lishi kerak")
        return self._create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField("Login (Email)", unique=True,
                              help_text="Tizimga kirish uchun login sifatida ishlatiladi")
    full_name = models.CharField("F.I.Sh.", max_length=150)
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="members",
        verbose_name="Boshqarma nomi",
        help_text="Foydalanuvchi faoliyat yuritadigan boshqarma"
    )

    job_title = models.CharField("Lavozim", max_length=100, blank=True,
                                 help_text="Masalan: Bosh mutaxassis, Bo'lim boshlig'i, Dasturchi")

    global_role = models.CharField("Tizim roli", max_length=20,
                                   choices=GlobalRole.choices, default=GlobalRole.DEVELOPER)
    specialty = models.CharField("Mutaxassislik", max_length=20, choices=Specialty.choices,
                                 default=Specialty.BACKEND,
                                 help_text="Royxatdan otishda tanlanadi va vazifa taqsimotiga tasir qiladi")
    seniority = models.CharField("Daraja", max_length=20, choices=Seniority.choices,
                                 default=Seniority.JUNIOR)
    years_experience = models.PositiveSmallIntegerField("Tajriba (yil)", default=0)
    bio = models.TextField("Qisqacha ma'lumot", blank=True)
    skills = models.CharField("Ko'nikmalar", max_length=255, blank=True,
                              help_text="Vergul bilan: Python, Django, React")
    telegram = models.CharField("Telegram", max_length=80, blank=True)
    avatar = models.ImageField("Rasm", upload_to="avatars/", blank=True, null=True)

    is_active = models.BooleanField("Faol", default=True)
    is_staff = models.BooleanField("Xodim (django-admin)", default=False)
    can_access_inquiries = models.BooleanField(
        "So'rovlar bo'limiga kirish",
        default=False,
        help_text="Ushbu foydalanuvchiga So'rovlar bo'limiga kirish ruxsatini berish",
    )
    date_joined = models.DateTimeField("Ro'yxatdan o'tgan", default=timezone.now)
    last_seen = models.DateTimeField("Oxirgi faollik", null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        verbose_name = "Foydalanuvchi"
        verbose_name_plural = "Foydalanuvchilar"
        ordering = ["full_name"]

    def __str__(self):
        return self.full_name or self.email

    def get_full_name(self):
        return self.full_name

    def get_short_name(self):
        return (self.full_name or self.email).split(" ")[0]

    def save(self, *args, **kwargs):
        # Faqat ADMIN roli yoki superuser admin panelga kira oladi
        if self.global_role == GlobalRole.ADMIN or self.is_superuser:
            self.is_staff = True
        else:
            self.is_staff = False
            self.is_superuser = False
        update_fields = kwargs.get("update_fields")
        if update_fields is not None:
            kwargs["update_fields"] = set(update_fields) | {"is_staff", "is_superuser"}
        super().save(*args, **kwargs)



    @property
    def is_platform_admin(self):
        return self.global_role == GlobalRole.ADMIN or self.is_superuser

    @property
    def is_manager(self):
        return self.global_role == GlobalRole.MANAGER

    @property
    def is_operator(self):
        return self.global_role == GlobalRole.OPERATOR


    @property
    def is_boss(self):
        """Takliflar bo'yicha qaror qabul qiladigan odam.

        Tizim admini bu yerga KIRMAYDI - talab «tasdiqlash faqat
        boshliqqa». Admin kerak bo'lsa `django-admin/` dan birovga
        «Boshliq» rolini bera oladi, lekin o'zi taklifni tasdiqlay olmaydi.
        """
        return self.global_role == GlobalRole.BOSS

    @property
    def has_inquiries_access(self):
        """So'rovlar sahifasiga kirish huquqi.

        Boshliq (BOSS) va Platform Adminiga doim ochiq,
        boshqa foydalanuvchilarga admin panel orqali berilgan ruxsat bo'yicha.
        """
        return bool(self.is_boss or self.is_platform_admin or self.can_access_inquiries)

    @property
    def is_sohaviy_boshqarma(self):
        """Sohaviy boshqarma profili ekanligini aniqlash."""
        return (
            self.global_role == GlobalRole.SOHAVIY
            or self.specialty == Specialty.SOHAVIY
        )

    @property
    def can_access_orders(self):
        """Buyurtmalar (Change Requests / TZ) bo'limiga kirish huquqi.

        Sohaviy boshqarmalar, PM (loyiha menejerlari), boshliq va platforma adminiga ochiq.
        """
        return bool(
            self.is_platform_admin
            or self.is_boss
            or self.is_manager
            or self.is_sohaviy_boshqarma
        )

    @property
    def department_name(self):
        """Foydalanuvchi faoliyat yuritadigan bo'linma/boshqarma nomi."""
        if self.department_id and self.department:
            return self.department.name
        if self.job_title:
            return self.job_title
        if self.is_sohaviy_boshqarma:
            return "Sohaviy boshqarmalar"
        return ""

    @property
    def can_create_project(self):
        """Loyiha ochish huquqi - menejer, tizim admini va boshliq.

        Dasturchi, QA va boshqalar loyiha yarata olmaydi: ular mavjud
        loyihada ishlaydi. Bu huquq ish maydoni ochishga ham tegishli -
        loyihasiz maydonning ma'nosi yo'q.
        """
        return (self.is_platform_admin or self.is_boss
                or self.global_role == GlobalRole.MANAGER)

    @property
    def initials(self):
        parts = [p for p in (self.full_name or self.email).split() if p]
        if not parts:
            return "?"
        if len(parts) == 1:
            return parts[0][:2].upper()
        return (parts[0][0] + parts[1][0]).upper()

    @property
    def avatar_color(self):
        digest = hashlib.md5(self.email.encode()).hexdigest()
        return AVATAR_COLORS[int(digest, 16) % len(AVATAR_COLORS)]

    @property
    def skill_list(self):
        return [s.strip() for s in self.skills.split(",") if s.strip()]

    # ---------------- mutaxassislikka bogliq xususiyatlar ----------------
    @property
    def specialty_profile(self):
        return profile_for(self.specialty)

    @property
    def specialty_icon(self):
        return self.specialty_profile["icon"]

    @property
    def specialty_color(self):
        return self.specialty_profile["color"]

    @property
    def suggested_task_types(self):
        """Shu mutaxassisga mos vazifa turlari."""
        return self.specialty_profile["task_types"]

    @property
    def suggested_skills(self):
        return self.specialty_profile["skills"]

    @property
    def default_project_role(self):
        """Loyihaga qoshilganda taklif etiladigan rol."""
        return self.specialty_profile["default_project_role"]

    @property
    def quality_checklist(self):
        """Ishni topshirishdan oldin tekshiriladigan royxat."""
        return self.specialty_profile["checklist"]

    def matches_task(self, task):
        """Vazifa shu mutaxassisga mos keladimi."""
        required = getattr(task, "required_specialty", "")
        if not required:
            return True
        return required == self.specialty


class SpecialtyAnalytics(User):
    """Admin panelida mutaxassisliklar tahlili uchun proxy model."""

    class Meta:
        proxy = True
        verbose_name = "Mutaxassisliklar tahlili"
        verbose_name_plural = "Mutaxassisliklar tahlili"


class SpecialtyItem(models.Model):
    """Admin panel orqali boshqariladigan va yangi qo'shiladigan mutaxassisliklar."""
    code = models.CharField(
        "Kod / Identifikator",
        max_length=50,
        unique=True,
        help_text="Masalan: DEVOPS, AI, SYSADMIN (Lotin harflarida)",
    )
    name = models.CharField(
        "Mutaxassislik nomi",
        max_length=100,
        help_text="Masalan: DevOps muhandisi, Sun'iy intellekt mutaxassisi",
    )
    icon = models.CharField("Belgi / Icon", max_length=30, default="*", blank=True)
    color = models.CharField("Rang (HEX)", max_length=30, default="#2563eb", blank=True)
    skills = models.CharField(
        "Asosiy ko'nikmalar",
        max_length=255,
        blank=True,
        help_text="Vergul bilan: Docker, Kubernetes, Linux",
    )
    is_active = models.BooleanField("Faol", default=True)
    order = models.PositiveIntegerField("Tartib raqami", default=0)
    created_at = models.DateTimeField("Yaratilgan vaqti", auto_now_add=True)
    updated_at = models.DateTimeField("Yangilangan vaqti", auto_now=True)

    class Meta:
        verbose_name = "Mutaxassislik"
        verbose_name_plural = "Mutaxassisliklar"
        ordering = ["order", "name"]

    def __str__(self):
        return self.name

