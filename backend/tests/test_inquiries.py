"""So'rovlar (Inquiries) testlari: ruxsatlar, ko'rish, ovoz berish, qaror qabul qilish."""
from apps.accounts.models import GlobalRole
from apps.inquiries.models import (Inquiry, InquiryScope, InquiryStatus,
                                   InquiryVote, VoteChoice)
from apps.notifications.models import Notification, NotificationKind

from .base import ApiTestCase, make_user

URL = "/api/inquiries/"


class InquiryTestCase(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.boss = make_user("boshliq_inq@sinov.uz", "Boshliq Inq", role="BOSS")
        cls.permitted_user = make_user("permitted@sinov.uz", "Ruxsatli Xodim", role="DEVELOPER")
        cls.permitted_user.can_access_inquiries = True
        cls.permitted_user.save()

        cls.unpermitted_user = make_user("unpermitted@sinov.uz", "Ruxsatsiz Xodim", role="DEVELOPER")
        cls.unpermitted_user.can_access_inquiries = False
        cls.unpermitted_user.save()

    def setUp(self):
        super().setUp()
        self.boss_api = self.client_for(self.boss)
        self.perm_api = self.client_for(self.permitted_user)
        self.unperm_api = self.client_for(self.unpermitted_user)

    def make_inquiry(self, author=None, **kw):
        data = {
            "title": "Yangi dasturiy ta'minot sotib olish",
            "body": "Ish samaradorligini oshirish uchun yangi litsenziya kerak.",
            "author": author or self.permitted_user,
        }
        data.update(kw)
        return Inquiry.objects.create(**data)

    def ids(self, response):
        rows = response.json()
        rows = rows["results"] if isinstance(rows, dict) and "results" in rows else rows
        return [r["id"] for r in rows]


class InquiryPermissionTest(InquiryTestCase):
    def test_ruxsatsiz_user_kora_olmaydi(self):
        """can_access_inquiries=False bo'lgan foydalanuvchi 403 oladi."""
        r = self.unperm_api.get(URL)
        self.assertEqual(r.status_code, 403)

    def test_ruxsatli_user_kira_oladi(self):
        """can_access_inquiries=True bo'lgan foydalanuvchi 200 oladi."""
        r = self.perm_api.get(URL)
        self.assertEqual(r.status_code, 200)

    def test_boshliq_doim_kira_oladi(self):
        """Boshliq (BOSS) ga can_access_inquiries shart emas - doim 200 oladi."""
        self.assertFalse(self.boss.can_access_inquiries)
        self.assertTrue(self.boss.has_inquiries_access)
        r = self.boss_api.get(URL)
        self.assertEqual(r.status_code, 200)

    def test_admin_doim_kira_oladi(self):
        """Tizim admini (ADMIN) ga can_access_inquiries shart emas - doim 200 oladi."""
        self.assertTrue(self.admin.has_inquiries_access)
        admin_client = self.client_for(self.admin)
        r = admin_client.get(URL)
        self.assertEqual(r.status_code, 200)


class InquiryWorkflowTest(InquiryTestCase):
    def test_inquiry_yaratish_va_bildirishnoma(self):
        """Xodim so'rov yuborganida boshliqqa bildirishnoma boradi."""
        r = self.perm_api.post(URL, {
            "title": "Monitorlarni yangilash",
            "body": "Ish stollariga 27 dyuymli monitorlar o'rnatilsa yaxshi bo'lardi.",
            "scope": "OPEN",
        })
        self.assertEqual(r.status_code, 201)
        inq_id = r.data["id"]

        # Boshliqqa bildirishnoma tushganini tekshirish
        notif = Notification.objects.filter(
            recipient=self.boss, kind=NotificationKind.INQUIRY_NEW
        ).first()
        self.assertIsNotNone(notif)
        self.assertIn("Monitorlarni yangilash", notif.title)

    def test_ovoz_berish(self):
        """Ochiq so'rovga ovoz berish va qaytarib olish."""
        item = self.make_inquiry()
        vote_url = f"{URL}{item.id}/vote/"

        r = self.perm_api.post(vote_url, {"choice": "FOR"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["for_count"], 1)
        self.assertEqual(r.data["my_vote"], "FOR")

        # O'sha ovozni qayta bossa bekor bo'ladi
        r = self.perm_api.post(vote_url, {"choice": "FOR"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["for_count"], 0)
        self.assertIsNone(r.data["my_vote"])

    def test_boshliq_qaror_qilishi(self):
        """Faqat boshliq qaror qabul qila oladi; oddiy user qilolmaydi."""
        item = self.make_inquiry()
        decide_url = f"{URL}{item.id}/decide/"

        # Oddiy foydalanuvchi tasdiqlashga urinsa - 403
        r = self.perm_api.post(decide_url, {
            "status": "APPROVED",
            "decision_note": "Kelishildi",
        })
        self.assertEqual(r.status_code, 403)

        # Boshliq tasdiqlaydi
        r = self.boss_api.post(decide_url, {
            "status": "APPROVED",
            "decision_note": "Kelishildi, byudjet ajratildi.",
        })
        self.assertEqual(r.status_code, 200)
        item.refresh_from_db()
        self.assertEqual(item.status, InquiryStatus.APPROVED)
        self.assertEqual(item.decided_by, self.boss)

        # Muallifga qaror haqida bildirishnoma borishi
        notif = Notification.objects.filter(
            recipient=self.permitted_user, kind=NotificationKind.INQUIRY_DECIDED
        ).first()
        self.assertIsNotNone(notif)
        self.assertIn("tasdiqlandi", notif.title)

    def test_yopiq_sorov_faqat_muallif_va_boshliqqa_korinadi(self):
        """Yopiq so'rov boshqa ruxsatli xodimlarga ko'rinmaydi."""
        closed_item = self.make_inquiry(author=self.permitted_user, scope=InquiryScope.CLOSED)

        # Muallif ko'radi
        r = self.perm_api.get(URL)
        self.assertIn(closed_item.id, self.ids(r))

        # Boshliq ko'radi
        r = self.boss_api.get(URL)
        self.assertIn(closed_item.id, self.ids(r))

        # Boshqa ruxsatli xodim ko'rmaydi
        other_user = make_user("other_perm@sinov.uz", "Boshqa Ruxsatli", role="DEVELOPER")
        other_user.can_access_inquiries = True
        other_user.save()
        r = self.client_for(other_user).get(URL)
        self.assertNotIn(closed_item.id, self.ids(r))
