from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from apps.uitexts.models import SystemSetting

User = get_user_model()


class SystemSettingsAPITests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin_sys@teamflow.uz",
            full_name="Admin System",
            password="pass",
            global_role="ADMIN",
        )
        self.regular = User.objects.create_user(
            email="regular@teamflow.uz",
            full_name="Regular User",
            password="pass",
            global_role="DEVELOPER",
        )

    def test_get_system_settings_public(self):
        res = self.client.get("/api/system/settings/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["app_name"], "TeamFlow")

    def test_update_system_settings_forbidden_for_regular(self):
        self.client.force_authenticate(user=self.regular)
        res = self.client.post("/api/system/settings/", {"app_name": "NewFlow"})
        self.assertEqual(res.status_code, 403)

    def test_update_system_settings_allowed_for_admin(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post("/api/system/settings/", {"app_name": "MyPlatform"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["app_name"], "MyPlatform")

        img = SimpleUploadedFile(
            "logo.png",
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82",
            content_type="image/png",
        )
        res_logo = self.client.post("/api/system/settings/", {"logo": img}, format="multipart")
        self.assertEqual(res_logo.status_code, 200)
        self.assertIsNotNone(res_logo.json()["logo_url"])
