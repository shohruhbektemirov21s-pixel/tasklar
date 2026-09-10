"""Senior QA Test Suite — TeamFlow platformasi uchun integratsion va xavfsizlik sinovlari.

Bu test to'plami Senior Tester nigohi bilan tizimning eng nozik va kritik
bo'g'inlarini tekshiradi:
  1. Ro'yxatdan o'tish va autentifikatsiya xavfsizligi (mutaxassislik tekshiruvi,
     PM avto-roli, email unikaligi, parollar mosligi va murakkabligi).
  2. Loyihalar va ish maydonlari hayotiy sikli (avtomatik kalit generatsiyasi,
     dasturchilar uchun loyiha ochish cheklovi, loyiha menejeri daxlsizligi).
  3. Vazifalar va ish jurnali (WorkLog) hisobi (a'zolar uchun ish vaqti qayd
     etilishi, begona foydalanuvchilarga taqiq).
  4. Takliflar boshqaruvi va korporativ boshqaruv (faqat boshliq qaror qabul qilishi,
     anonimlikning to'liq kafolati).
"""

from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import GlobalRole
from apps.accounts.specialties import Specialty, Seniority
from apps.projects.models import Project, ProjectMember, ProjectRole
from apps.tasks.models import Task, TaskAssignment, TaskStatus, WorkLog
from apps.suggestions.models import Suggestion, SuggestionScope, SuggestionStatus

from .base import ApiTestCase, make_user

User = get_user_model()


class RegistrationAndAuthSeniorQATest(ApiTestCase):
    """Foydalanuvchini ro'yxatdan o'tkazish va sessiya xavfsizligi testlari."""

    REGISTER_URL = "/api/auth/register/"
    VERIFY_URL = "/api/auth/verify/"

    def test_dasturchi_muvaffaqiyatli_royxatdan_otadi(self):
        """Oddiy dasturchi mutaxassisligi bilan to'g'ri ro'yxatdan o'tadi."""
        payload = {
            "email": "yangi.backendchi@teamflow.uz",
            "full_name": "Aziz Backendchi",
            "specialty": Specialty.BACKEND,
            "seniority": Seniority.MIDDLE,
            "years_experience": 3,
            "password": "murakkab-parol-2026",
            "password_confirm": "murakkab-parol-2026",
        }
        r = self.anon.post(self.REGISTER_URL, payload, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertIn("user", r.data)
        self.assertFalse(r.data.get("is_active", True))

        user_data = r.data["user"]
        self.assertEqual(user_data["email"], "yangi.backendchi@teamflow.uz")
        self.assertEqual(user_data["specialty"], Specialty.BACKEND)
        self.assertEqual(user_data["job_title"], "Backend dasturchi")
        self.assertEqual(user_data["global_role"], GlobalRole.DEVELOPER)

        # Bazadagi foydalanuvchi holatini tekshirish
        user = User.objects.get(email="yangi.backendchi@teamflow.uz")
        self.assertTrue(user.check_password("murakkab-parol-2026"))
        self.assertFalse(user.is_active)

    def test_pm_royxatdan_otganda_menejer_rolini_oladi(self):
        """Loyiha menejeri (PM) mutaxassisligi tanlanganda global_role avtomatik MANAGER bo'ladi."""
        payload = {
            "email": "yangi.pm@teamflow.uz",
            "full_name": "Farrux Menejerov",
            "specialty": Specialty.PM,
            "password": "kuchli-parol-2026",
            "password_confirm": "kuchli-parol-2026",
        }
        r = self.anon.post(self.REGISTER_URL, payload, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        user_data = r.data["user"]
        self.assertEqual(user_data["global_role"], GlobalRole.MANAGER)
        self.assertTrue(user_data["can_create_project"])

        user = User.objects.get(email="yangi.pm@teamflow.uz")
        self.assertEqual(user.global_role, GlobalRole.MANAGER)
        self.assertTrue(user.can_create_project)

    def test_mutaxassislik_kiritilmasa_xato_beradi(self):
        """Mutaxassislik majburiy maydon — u bo'lmasa 400 xatosi qaytadi."""
        payload = {
            "email": "yoq.mutaxassislik@teamflow.uz",
            "full_name": "Mutaxassisliksiz Odam",
            "password": "kuchli-parol-2026",
            "password_confirm": "kuchli-parol-2026",
        }
        r = self.anon.post(self.REGISTER_URL, payload, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("specialty", r.data)

    def test_yaroqsiz_mutaxassislik_rad_etiladi(self):
        """Mavjud bo'lmagan mutaxassislik kodi qabul qilinmaydi."""
        payload = {
            "email": "notogri.mutaxassislik@teamflow.uz",
            "full_name": "Xato Odam",
            "specialty": "ASTRONAUT",
            "password": "kuchli-parol-2026",
            "password_confirm": "kuchli-parol-2026",
        }
        r = self.anon.post(self.REGISTER_URL, payload, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("specialty", r.data)

    def test_mavjud_email_bilan_royxatdan_otib_bolmaydi(self):
        """Allaqachon mavjud bo'lgan email qayta ro'yxatdan o'ta olmaydi."""
        payload = {
            "email": self.dev.email,
            "full_name": "Takroriy Foydalanuvchi",
            "specialty": Specialty.FRONTEND,
            "password": "kuchli-parol-2026",
            "password_confirm": "kuchli-parol-2026",
        }
        r = self.anon.post(self.REGISTER_URL, payload, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("email", r.data)

    def test_email_katta_kichik_harflarga_sezgir_emas(self):
        """Email tekshiruvi katta-kichik harflarga sezgir bo'lmasligi kerak."""
        payload = {
            "email": self.dev.email.upper(),
            "full_name": "Katta Harfli Email",
            "specialty": Specialty.FRONTEND,
            "password": "kuchli-parol-2026",
            "password_confirm": "kuchli-parol-2026",
        }
        r = self.anon.post(self.REGISTER_URL, payload, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("email", r.data)

    def test_parol_tasdigi_mos_kelmasa_xato_qaytaradi(self):
        """password va password_confirm mos kelmasa 400 qaytariladi."""
        payload = {
            "email": "mos.emas@teamflow.uz",
            "full_name": "Mos Emas",
            "specialty": Specialty.DEVOPS,
            "password": "birinchi-parol-1234",
            "password_confirm": "ikkinchi-parol-5678",
        }
        r = self.anon.post(self.REGISTER_URL, payload, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("password_confirm", r.data)

    def test_qisqa_parol_rad_etiladi(self):
        """8 belgidan qisqa parol rad etiladi."""
        payload = {
            "email": "qisqa@teamflow.uz",
            "full_name": "Qisqa Parol",
            "specialty": Specialty.QA,
            "password": "123",
            "password_confirm": "123",
        }
        r = self.anon.post(self.REGISTER_URL, payload, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("password", r.data)

    def test_token_verify_endpointi_ishlaydi(self):
        """To'g'ri JWT token 200, soxta yoki eskirgan token 401 qaytaradi."""
        token = str(RefreshToken.for_user(self.dev).access_token)
        r_valid = self.anon.post(self.VERIFY_URL, {"token": token}, format="json")
        self.assertEqual(r_valid.status_code, 200)

        r_invalid = self.anon.post(self.VERIFY_URL, {"token": "notogri-token-qiymati"}, format="json")
        self.assertEqual(r_invalid.status_code, 401)


class ProjectAndRoleSeniorQATest(ApiTestCase):
    """Loyiha xavfsizligi, kalit generatsiyasi va ruxsatlar testlari."""

    def test_loyiha_nomidan_kalit_avtomatik_yasaladi(self):
        """Loyiha yaratilganda nomi asosida avtomatik kalit shakllanadi va bosh harflarda bo'ladi."""
        payload = {
            "workspace": self.workspace.pk,
            "name": "To'lov Integratsiyasi Tizimi",
            "description": "To'lov shlyuzlari bilan integratsiya loyihasi.",
        }
        r = self.api.post("/api/projects/", payload, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        key = r.data["key"]
        self.assertTrue(len(key) >= 2)
        self.assertEqual(key, key.upper())

    def test_oddiy_dasturchi_loyiha_yarata_olmaydi(self):
        """Global roli DEVELOPER bo'lgan foydalanuvchi loyiha ocha olmaydi (403 taqiqlangan)."""
        dev_client = self.client_for(self.dev)
        payload = {
            "workspace": self.workspace.pk,
            "name": "Dasturchining Shaxsiy Loyihasi",
        }
        r = dev_client.post("/api/projects/", payload, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertIn("huquqi", r.data.get("detail", "").lower())

    def test_loyiha_menejeri_daxlsiz_boshqa_admin_chiqara_olmaydi(self):
        """Loyiha admini loyiha boshqaruvchisini (manager) loyihadan chiqara olmaydi."""
        project_admin = make_user("padmin_qa@sinov.uz", "QA Loyiha Admini")
        ProjectMember.objects.create(project=self.project, user=project_admin,
                                     role=ProjectRole.ADMIN)

        manager_membership = ProjectMember.objects.get(project=self.project, user=self.manager)
        admin_client = self.client_for(project_admin)

        r = admin_client.post(
            f"/api/projects/{self.project.pk}/members/{manager_membership.pk}/",
            {"action": "remove"},
            format="json"
        )
        self.assertEqual(r.status_code, 403)
        manager_membership.refresh_from_db()
        self.assertTrue(manager_membership.is_active)


class WorkLogSeniorQATest(ApiTestCase):
    """Vazifalar bo'yicha ish vaqti (WorkLog) hisobi testlari."""

    def setUp(self):
        super().setUp()
        self.task = Task.objects.create(
            project=self.project,
            title="API Endpoints integratsiyasi",
            created_by=self.manager,
            status=TaskStatus.IN_PROGRESS
        )
        TaskAssignment.objects.create(task=self.task, user=self.dev)

    def test_loyiha_azosi_vazifaga_ish_jurnalini_yozadi(self):
        """Loyiha ijrochisi vazifaga sarflangan soat va izohni muvaffaqiyatli kiritadi."""
        dev_client = self.client_for(self.dev)
        payload = {
            "hours": 4.5,
            "note": "Swagger hujjatlariga mos ravishda autentifikatsiya endpointlari yozildi.",
        }
        url = f"/api/tasks/{self.task.pk}/worklogs/"
        r = dev_client.post(url, payload, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(float(r.data["hours"]), 4.5)
        self.assertEqual(r.data["user"]["id"], self.dev.pk)

        # Bazadagi yozuvni tekshirish
        wl = WorkLog.objects.get(task=self.task, user=self.dev)
        self.assertEqual(float(wl.hours), 4.5)
        self.assertIn("Swagger", wl.note)

    def test_chetdagi_odam_ish_jurnali_yoza_olmaydi(self):
        """Loyihaga a'zo bo'lmagan foydalanuvchi ish jurnaliga yozuv qo'sha olmaydi (403)."""
        outsider_client = self.client_for(self.outsider)
        payload = {
            "hours": 2.0,
            "note": "Ruxsatsiz yozuv kiritishga urinish.",
        }
        url = f"/api/tasks/{self.task.pk}/worklogs/"
        r = outsider_client.post(url, payload, format="json")
        self.assertEqual(r.status_code, 403)
        self.assertFalse(WorkLog.objects.filter(task=self.task, user=self.outsider).exists())


class SuggestionGovernanceSeniorQATest(ApiTestCase):
    """Takliflar (Suggestions), boshliq qarorlari va anonimlik tekshiruvi."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.boss = make_user("boshliq_qa@sinov.uz", "Katta Boshliq", role="BOSS")

    def test_faqat_boshliq_taklifni_tasdiqlay_oladi(self):
        """Taklifni tasdiqlash yoki rad etish faqat boshliqqa ruxsat etilgan."""
        suggestion = Suggestion.objects.create(
            title="Yangi qahva mashinasi olish taklifi",
            body="Ofisga yangi qahva mashinasi olinsa ish unumdorligi oshadi.",
            author=self.dev,
            scope=SuggestionScope.OPEN,
            status=SuggestionStatus.PENDING,
        )

        # 1. Menejer tasdiqlashga urinadi -> 403 taqiqlangan
        r_mgr = self.api.post(
            f"/api/suggestions/{suggestion.pk}/decide/",
            {"status": SuggestionStatus.APPROVED, "note": "Menejer tasdiqlay olmaydi"},
            format="json"
        )
        self.assertEqual(r_mgr.status_code, 403)

        # 2. Dasturchi tasdiqlashga urinadi -> 403 taqiqlangan
        r_dev = self.client_for(self.dev).post(
            f"/api/suggestions/{suggestion.pk}/decide/",
            {"status": SuggestionStatus.APPROVED, "note": "Dasturchi tasdiqlay olmaydi"},
            format="json"
        )
        self.assertEqual(r_dev.status_code, 403)

        # 3. Boshliq tasdiqlaydi -> 200 muvaffaqiyatli
        boss_client = self.client_for(self.boss)
        r_boss = boss_client.post(
            f"/api/suggestions/{suggestion.pk}/decide/",
            {"status": SuggestionStatus.APPROVED, "note": "Taklif ma'qullandi, byudjet ajratilsin."},
            format="json"
        )
        self.assertEqual(r_boss.status_code, 200)
        suggestion.refresh_from_db()
        self.assertEqual(suggestion.status, SuggestionStatus.APPROVED)
        self.assertEqual(suggestion.decided_by, self.boss)

    def test_anonim_taklifda_muallif_hech_kimga_ochilmaydi(self):
        """is_anonymous=True bo'lganda, author ma'lumotlari boshliqqa ham, boshqalarga ham yashiriladi."""
        anon_suggestion = Suggestion.objects.create(
            title="Maxfiy va anonim taklif",
            body="Ushbu taklif muallifi sir saqlanishi shart.",
            author=self.dev,
            is_anonymous=True,
            scope=SuggestionScope.OPEN,
            status=SuggestionStatus.PENDING,
        )

        # Boshliq so'rov yuborganda muallif null bo'lishi kerak
        r_boss = self.client_for(self.boss).get(f"/api/suggestions/{anon_suggestion.pk}/")
        self.assertEqual(r_boss.status_code, 200)
        self.assertIsNone(r_boss.data["author"])

        # Chetdagi foydalanuvchi so'rov yuborganda ham null bo'lishi kerak
        r_outsider = self.client_for(self.outsider).get(f"/api/suggestions/{anon_suggestion.pk}/")
        self.assertEqual(r_outsider.status_code, 200)
        self.assertIsNone(r_outsider.data["author"])
