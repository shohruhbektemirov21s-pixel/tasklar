import tempfile
import os
from django.core.files.uploadedfile import SimpleUploadedFile
from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.accounts.models import User, Department, SpecialtyItem, GlobalRole
from apps.accounts.specialties import Specialty
from apps.orders.models import ChangeRequestStatus
from apps.uitexts.models import SystemSetting
from apps.core.media import media_url

from .base import ApiTestCase


class BackendApiFixesTest(ApiTestCase):
    def test_user_cannot_self_elevate_department_in_me(self):
        dept1 = Department.objects.create(name="Boshqarma 1", code="B1")
        self.dev.department = dept1
        self.dev.save()

        client = self.client_for(self.dev)
        res = client.patch("/api/auth/me/", {"department_name": "Boshqarma 2"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("department_name", res.data)

        self.dev.refresh_from_db()
        self.assertEqual(self.dev.department.name, "Boshqarma 1")

    def test_user_cannot_self_elevate_specialty_in_me(self):
        self.dev.specialty = Specialty.DEVELOPER
        self.dev.save()

        client = self.client_for(self.dev)
        # SOHAVIY ga o'zgartirishga urinish
        res = client.patch("/api/auth/me/", {"specialty": Specialty.SOHAVIY}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("specialty", res.data)

        # PM ga o'zgartirishga urinish
        res_pm = client.patch("/api/auth/me/", {"specialty": Specialty.PM}, format="json")
        self.assertEqual(res_pm.status_code, 400)
        self.assertIn("specialty", res_pm.data)

        self.dev.refresh_from_db()
        self.assertEqual(self.dev.specialty, Specialty.DEVELOPER)

    def test_user_can_update_regular_fields_in_me(self):
        client = self.client_for(self.dev)
        res = client.patch("/api/auth/me/", {
            "full_name": "Jasur Alimov Yangilangan",
            "bio": "Mening yangi bio matnim"
        }, format="json")
        self.assertEqual(res.status_code, 200)
        self.dev.refresh_from_db()
        self.assertEqual(self.dev.full_name, "Jasur Alimov Yangilangan")
        self.assertEqual(self.dev.bio, "Mening yangi bio matnim")

    def test_admin_can_update_department_in_me(self):
        client = self.client_for(self.admin)
        res = client.patch("/api/auth/me/", {"department_name": "Boshqaruv Markazi"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.department.name, "Boshqaruv Markazi")

    def test_logout_without_access_token_blacklists_refresh_token(self):
        refresh = RefreshToken.for_user(self.dev)
        raw_refresh = str(refresh)

        # Autentifikatsiyasiz (anonim client) logout so'rovi yuboradi
        res = self.anon.post("/api/auth/logout/", {"refresh": raw_refresh}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["revoked"], 1)

        # Refresh token blacklist qilinganini tekshiramiz
        token_obj = OutstandingToken.objects.filter(token=raw_refresh).first()
        self.assertIsNotNone(token_obj)
        self.assertTrue(BlacklistedToken.objects.filter(token=token_obj).exists())

    def test_svg_served_with_csp_sandbox_and_nosniff(self):
        # branding/ papkasiga test SVG fayli yozamiz
        branding_dir = os.path.join(settings.MEDIA_ROOT, "branding")
        os.makedirs(branding_dir, exist_ok=True)
        svg_path = os.path.join(branding_dir, "test_logo.svg")
        with open(svg_path, "wb") as f:
            f.write(b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

        try:
            res = self.anon.get("/media/branding/test_logo.svg")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.headers.get("X-Content-Type-Options"), "nosniff")
            self.assertEqual(res.headers.get("Content-Security-Policy"), "sandbox")
        finally:
            if os.path.exists(svg_path):
                os.remove(svg_path)

    def test_meta_contains_full_order_statuses_and_specialties(self):
        SpecialtyItem.objects.get_or_create(code="DATA_ENG", defaults={"name": "Data Muhandis", "is_active": True})

        client = self.client_for(self.dev)
        from django.core.cache import cache
        cache.delete("meta:choices")

        res = client.get("/api/meta/")
        self.assertEqual(res.status_code, 200)

        # 1. order_status to'liq statuslarni o'z ichiga oladi
        order_status_values = [item["value"] for item in res.data.get("order_status", [])]
        for st in [ChangeRequestStatus.NEW, ChangeRequestStatus.IN_PROGRESS, ChangeRequestStatus.CANCELLED]:
            self.assertIn(st, order_status_values)

        # 2. specialties bazadagi qo'shilgan mutaxassislikni o'z ichiga oladi
        specialty_values = [item["value"] for item in res.data.get("specialties", [])]
        self.assertIn("DATA_ENG", specialty_values)
