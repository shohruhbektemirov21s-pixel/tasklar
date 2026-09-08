import io
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import GlobalRole, Specialty, User
from apps.orders.models import ChangeRequest, ChangeRequestPriority, ChangeRequestStatus
from apps.projects.models import Project
from apps.workspaces.models import Workspace
from tests.base import ApiTestCase, make_user


class OrdersSeniorDevTests(ApiTestCase):
    """Senior Dev darajasidagi Buyurtmalar (TZ) to'liq funksional testlari."""

    def setUp(self):
        super().setUp()

        # Foydalanuvchilar
        self.sohaviy_user = make_user(
            "sohaviy_test@teamflow.uz",
            "Sohaviy Mas'ul",
            role=GlobalRole.SOHAVIY,
            specialty=Specialty.SOHAVIY,
        )
        self.pm_user = make_user(
            "pm_test@teamflow.uz",
            "Akbar PM",
            role=GlobalRole.MANAGER,
            specialty=Specialty.PM,
        )
        self.dev_user = make_user(
            "dev_test@teamflow.uz",
            "Jasur Dasturchi",
            role=GlobalRole.DEVELOPER,
            specialty=Specialty.BACKEND,
        )

        # Ish maydoni va loyiha
        self.workspace = Workspace.objects.create(name="Asosiy Maydon", owner=self.pm_user)
        self.project = Project.objects.create(
            workspace=self.workspace,
            name="Smart CRM Tizimi",
            key="SCRM",
            manager=self.pm_user,
            description="Mijozlar bilan ishlash portali",
            status="ACTIVE",
            start_date=timezone.localdate(),
        )

    def test_sohaviy_can_create_tz_with_project_and_file(self):
        """Sohaviy boshqarma foydalanuvchisi loyiha va TZ fayli bilan yangi buyurtma yarata olishi."""
        client = APIClient()
        client.force_authenticate(user=self.sohaviy_user)

        # Simulyatsiya qilingan TZ fayli
        tz_doc_content = b"Texnik topshiriq: Yangi hisobotlar moduli talablari..."
        test_file = SimpleUploadedFile("Texnik_topshiriq_v1.docx", tz_doc_content, content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")

        payload = {
            "system_name": "Smart CRM",
            "module": "Hisobotlar",
            "project": self.project.id,
            "department": "Moliya boshqarmasi",
            "responsible_person": "Karimov A.",
            "priority": ChangeRequestPriority.URGENT,
            "due_date": str(timezone.localdate()),
            "current_state": "Eski hisobotlar PDF shaklida yuklanmayapti",
            "requested_change": "Yangi Excel va PDF eksport tizimi qo'shilsin",
            "reason": "Moliya auditi talabi",
            "tz_file": test_file,
        }

        res = client.post("/api/orders/", payload, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.content)
        data = res.json()

        self.assertEqual(data["system_name"], "Smart CRM")
        self.assertEqual(data["priority"], ChangeRequestPriority.URGENT)
        self.assertEqual(data["project"], self.project.id)
        self.assertIsNotNone(data["project_detail"])
        self.assertEqual(data["project_detail"]["name"], "Smart CRM Tizimi")
        self.assertEqual(data["project_detail"]["key"], "SCRM")
        self.assertEqual(data["project_detail"]["manager_name"], "Akbar PM")

        # TZ fayli saqlanganligini tekshirish
        self.assertTrue(data["tz_file_url"])
        self.assertIn("Texnik_topshiriq_v1", data["tz_file_name"])
        self.assertGreater(data["tz_file_size"], 0)

        # Bazadagi holat
        order = ChangeRequest.objects.get(id=data["id"])
        self.assertEqual(order.project, self.project)
        self.assertEqual(order.priority, ChangeRequestPriority.URGENT)
        self.assertTrue(order.tz_file)

    def test_pm_can_set_decision_duration_and_deadline(self):
        """PM o'zi vaqtni, qanchada tugashini va qat'iy muddatni belgilay olishi."""
        order = ChangeRequest.objects.create(
            project=self.project,
            system_name="Smart CRM",
            module="To'lovlar",
            department="Xavfsizlik bo'limi",
            responsible_person="Sobirov N.",
            priority=ChangeRequestPriority.HIGH,
            current_state="Xavfsizlik auditi",
            requested_change="2FA autentifikatsiya",
            reason="Xavfsizlik standarti",
            created_by=self.sohaviy_user,
        )

        client = APIClient()
        client.force_authenticate(user=self.pm_user)

        target_deadline = str(timezone.localdate() + timezone.timedelta(days=14))
        payload = {
            "status": ChangeRequestStatus.ACCEPTED,
            "pm_estimated_duration": "2 hafta (10 ish kuni)",
            "pm_deadline": target_deadline,
            "pm_notes": "Loyiha rejasi tasdiqlandi. 2 ta backend dasturchi biriktirildi.",
            "executor_signer": "Akbar PM (Loyiha rahbari)",
        }

        res = client.post(f"/api/orders/{order.id}/set-pm-decision/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.content)
        data = res.json()

        self.assertEqual(data["status"], ChangeRequestStatus.ACCEPTED)
        self.assertEqual(data["pm_estimated_duration"], "2 hafta (10 ish kuni)")
        self.assertEqual(data["pm_deadline"], target_deadline)
        self.assertEqual(data["assigned_pm"], self.pm_user.id)
        self.assertEqual(data["assigned_pm_name"], "Akbar PM")

        # Bazada tekshirish
        order.refresh_from_db()
        self.assertEqual(order.status, ChangeRequestStatus.ACCEPTED)
        self.assertEqual(order.pm_estimated_duration, "2 hafta (10 ish kuni)")
        self.assertEqual(str(order.pm_deadline), target_deadline)
        self.assertEqual(order.assigned_pm, self.pm_user)

    def test_non_pm_cannot_set_pm_decision(self):
        """Oddiy dasturchi yoki boshqa begona shaxs PM qarorini belgilay olmasligi shart (403)."""
        order = ChangeRequest.objects.create(
            project=self.project,
            system_name="Smart CRM",
            department="Moliya",
            responsible_person="Kimdir",
            created_by=self.sohaviy_user,
        )

        client = APIClient()
        client.force_authenticate(user=self.dev_user)

        payload = {
            "status": ChangeRequestStatus.COMPLETED,
            "pm_estimated_duration": "1 kun",
        }
        res = client.post(f"/api/orders/{order.id}/set-pm-decision/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_export_docx_includes_project_and_pm_data(self):
        """Word eksportida loyiha nomi, biriktirilgan TZ fayli va PM muddatlari chiqishi."""
        order = ChangeRequest.objects.create(
            project=self.project,
            system_name="Smart CRM",
            module="Kassa",
            department="Buxgalteriya",
            responsible_person="Saidov B.",
            priority=ChangeRequestPriority.HIGH,
            pm_estimated_duration="3 hafta",
            pm_deadline=timezone.localdate(),
            tz_file_name="Talablar_blankasi.pdf",
            tz_file_size=1048576,
            created_by=self.sohaviy_user,
        )

        client = APIClient()
        client.force_authenticate(user=self.sohaviy_user)

        res = client.get(f"/api/orders/{order.id}/export-docx/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            res["Content-Type"],
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        self.assertGreater(len(res.content), 1000)

    def test_tz_auto_assigns_pm_and_creates_initial_version(self):
        """Loyiha tanlanganda TZ avtomatik ravishda loyiha PM-iga biriktirilishi va v1 versiya yaratilishi."""
        client = APIClient()
        client.force_authenticate(user=self.sohaviy_user)

        test_file = SimpleUploadedFile(
            "TZ_Loyiha_Boshqaruvi_v1.pdf",
            b"%PDF-1.4 initial spec content",
            content_type="application/pdf",
        )

        payload = {
            "system_name": "Smart CRM",
            "project": self.project.id,
            "department": "IT Bo'limi",
            "responsible_person": "Aliyev M.",
            "current_state": "Eski tizimda TZ yo'q",
            "requested_change": "Yangi loyiha moduli",
            "reason": "Talab",
            "tz_file": test_file,
        }
        res = client.post("/api/orders/", payload, format="multipart")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.json()

        # PM avtomatik belgilanganligini tekshirish
        self.assertEqual(data["assigned_pm"], self.pm_user.id)
        self.assertEqual(data["assigned_pm_name"], "Akbar PM")
        self.assertEqual(data["version"], 1)
        self.assertFalse(data["is_locked"])

        # Versiyalar ro'yxatida v1 borligi
        self.assertEqual(len(data["versions"]), 1)
        self.assertEqual(data["versions"][0]["version"], 1)
        self.assertEqual(data["versions"][0]["tz_file_name"], "TZ_Loyiha_Boshqaruvi_v1.pdf")

    def test_accepted_tz_cannot_be_directly_edited(self):
        """PM tomonidan qabul qilingan TZ to'g'ridan-to'g'ri tahrirlab bo'lmasligi (qulflanishi)."""
        order = ChangeRequest.objects.create(
            project=self.project,
            system_name="Smart CRM",
            department="Moliya",
            responsible_person="Karimov",
            current_state="Boshlang'ich holat",
            requested_change="O'zgarish",
            reason="Sabab",
            status=ChangeRequestStatus.NEW,
            created_by=self.sohaviy_user,
        )

        client = APIClient()
        # PM TZ ni qabul qiladi
        client.force_authenticate(user=self.pm_user)
        pm_res = client.post(
            f"/api/orders/{order.id}/set-pm-decision/",
            {"status": ChangeRequestStatus.ACCEPTED, "pm_estimated_duration": "10 kun"},
            format="json",
        )
        self.assertEqual(pm_res.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status, ChangeRequestStatus.ACCEPTED)

        # Endi sohaviy xodim yoki muallif uni to'g'ridan-to'g'ri tahrirlashga urinsa, xatolik chiqishi kerak
        client.force_authenticate(user=self.sohaviy_user)
        patch_res = client.patch(
            f"/api/orders/{order.id}/",
            {"requested_change": "Noqonuniy o'zgartirish kiritishga urinish"},
            format="json",
        )
        self.assertEqual(patch_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("qabul qilingan", str(patch_res.content))

    def test_upload_new_version_after_acceptance(self):
        """Qabul qilingan TZ ga yangi versiya (v2) yuklash va PM ga ko'rib chiqishga borishi."""
        order = ChangeRequest.objects.create(
            project=self.project,
            system_name="Smart CRM",
            department="Moliya",
            responsible_person="Karimov",
            current_state="Boshlang'ich",
            requested_change="O'zgarish",
            reason="Sabab",
            status=ChangeRequestStatus.ACCEPTED,
            created_by=self.sohaviy_user,
        )

        client = APIClient()
        client.force_authenticate(user=self.sohaviy_user)

        new_file = SimpleUploadedFile(
            "TZ_Loyiha_Boshqaruvi_v2.pdf",
            b"%PDF-1.4 updated v2 content",
            content_type="application/pdf",
        )

        res = client.post(
            f"/api/orders/{order.id}/upload-version/",
            {
                "tz_file": new_file,
                "change_note": "Hisobotlarga qo'shimcha jadval ustunlari qo'shildi",
                "requested_change": "Yangilangan TZ talablari",
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()

        # Versiya raqami 2 ga oshganligi va status yana NEW bo'lganligi
        self.assertEqual(data["version"], 2)
        self.assertEqual(data["status"], ChangeRequestStatus.NEW)
        self.assertFalse(data["is_locked"])
        self.assertEqual(data["tz_file_name"], "TZ_Loyiha_Boshqaruvi_v2.pdf")

        # Versiyalar tarixida ikkala versiya ham borligi
        self.assertEqual(len(data["versions"]), 2)
        v2 = data["versions"][0]
        self.assertEqual(v2["version"], 2)
        self.assertEqual(v2["change_note"], "Hisobotlarga qo'shimcha jadval ustunlari qo'shildi")

