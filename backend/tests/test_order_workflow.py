"""Buyurtma holat mashinasi - `apps/orders/workflow.py`.

Ilgari holat o'n ikki joyda qo'lda yozilardi va uchta teshik bor edi:
  * `submit-completion` holatga qaramasdi - yopilgan buyurtma ham qayta
    «Boshqarma tasdig'ida» ga tushardi;
  * `set-pm-decision` yopilgan buyurtmani qayta ochardi;
  * `approve-version` `status=COMPLETED` bilan boshqarma tasdig'ini
    butunlay chetlab o'tardi.
Shu testlar ularni qulflaydi.
"""
from django.test import SimpleTestCase
from django.utils import timezone

from apps.accounts.models import GlobalRole, Specialty
from apps.orders.models import ChangeRequest, ChangeRequestStatus as S, ChangeRequestVersion
from apps.orders.workflow import can_transition

from .base import ApiTestCase, make_user


class TransitionTableTest(SimpleTestCase):
    def test_yopilgan_buyurtmadan_chiqish_yoq(self):
        for target in S.values:
            if target != S.COMPLETED:
                self.assertFalse(can_transition(S.COMPLETED, target), target)

    def test_qolda_bajarildi_va_tasdiqqa_qoyib_bolmaydi(self):
        for current in (S.NEW, S.ACCEPTED, S.IN_PROGRESS, S.TESTING):
            self.assertFalse(can_transition(current, S.COMPLETED, manual=True))
            self.assertFalse(can_transition(current, S.READY_FOR_REVIEW, manual=True))

    def test_boshqarma_navbatiga_pm_tegmaydi(self):
        self.assertFalse(can_transition(S.READY_FOR_REVIEW, S.IN_PROGRESS, manual=True))
        # Boshqarmaning o'z amali (kamchilik bilan qaytarish) esa ochiq.
        self.assertTrue(can_transition(S.READY_FOR_REVIEW, S.IN_PROGRESS))

    def test_topshirish_faqat_ishdagi_buyurtmadan(self):
        for current in (S.ACCEPTED, S.ASSIGNED_TO_DEV, S.IN_PROGRESS, S.TESTING):
            self.assertTrue(can_transition(current, S.READY_FOR_REVIEW))
        for current in (S.DRAFT, S.NEW, S.REJECTED, S.CANCELLED, S.COMPLETED):
            self.assertFalse(can_transition(current, S.READY_FOR_REVIEW))

    def test_qoralama_faqat_yuboriladi(self):
        self.assertEqual({t for t in S.values if can_transition(S.DRAFT, t)}, {S.DRAFT, S.NEW})

    def test_ozgarishsiz_holat_har_doim_ruxsat(self):
        for state in S.values:
            self.assertTrue(can_transition(state, state, manual=True))


class OrderWorkflowApiTest(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.sohaviy = make_user("sohaviy_wf@teamflow.uz", "Boshqarma", role=GlobalRole.SOHAVIY,
                                 specialty=Specialty.SOHAVIY)
        self.pm = make_user("pm_wf@teamflow.uz", "PM", role=GlobalRole.MANAGER, specialty=Specialty.PM)

    def order(self, status, **kw):
        return ChangeRequest.objects.create(
            system_name="CRM", department="Moliya", responsible_person="X",
            created_by=self.sohaviy, assigned_pm=self.pm, status=status,
            request_date=timezone.localdate(), **kw)

    def test_yopilgan_buyurtmani_qayta_topshirib_bolmaydi(self):
        o = self.order(S.COMPLETED)
        r = self.client_for(self.pm).post(f"/api/orders/{o.pk}/submit-completion/",
                                          {"completion_note": "yana"}, format="json")
        self.assertEqual(r.status_code, 400)
        o.refresh_from_db()
        self.assertEqual(o.status, S.COMPLETED)

    def test_ishdagi_buyurtma_topshiriladi(self):
        o = self.order(S.IN_PROGRESS)
        r = self.client_for(self.pm).post(f"/api/orders/{o.pk}/submit-completion/",
                                          {"completion_note": "tayyor"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        o.refresh_from_db()
        self.assertEqual(o.status, S.READY_FOR_REVIEW)

    def test_pm_qarori_yopilganni_ochmaydi(self):
        o = self.order(S.COMPLETED)
        r = self.client_for(self.pm).post(f"/api/orders/{o.pk}/set-pm-decision/",
                                          {"status": S.IN_PROGRESS}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_pm_rad_etishi_ishlaydi(self):
        o = self.order(S.NEW)
        r = self.client_for(self.pm).post(f"/api/orders/{o.pk}/set-pm-decision/",
                                          {"status": S.REJECTED, "pm_notes": "TZ to'liq emas"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        o.refresh_from_db()
        self.assertEqual(o.status, S.REJECTED)

    def test_versiya_tasdigi_boshqarmani_chetlab_otmaydi(self):
        o = self.order(S.IN_PROGRESS)
        ChangeRequestVersion.objects.create(order=o, version=1, status=S.ACCEPTED, uploaded_by=self.sohaviy)
        ChangeRequestVersion.objects.create(order=o, version=2, status=S.NEW, uploaded_by=self.sohaviy)
        r = self.client_for(self.pm).post(f"/api/orders/{o.pk}/approve-version/",
                                          {"version": 2, "status": S.COMPLETED}, format="json")
        self.assertEqual(r.status_code, 400)
        o.refresh_from_db()
        self.assertEqual(o.status, S.IN_PROGRESS)

    def test_qoralama_egasi_patch_bilan_yopa_olmaydi(self):
        o = ChangeRequest.objects.create(
            system_name="CRM", department="Moliya", responsible_person="X",
            created_by=self.sohaviy, status=S.DRAFT)
        r = self.client_for(self.sohaviy).patch(f"/api/orders/{o.pk}/", {"status": S.COMPLETED}, format="json")
        self.assertEqual(r.status_code, 400)
        o.refresh_from_db()
        self.assertEqual(o.status, S.DRAFT)


class UserWorkOrdersTest(ApiTestCase):
    """Profil sahifasi buyurtmalarni so'rovchining huquqi bilan ko'rsatadi."""

    def test_dasturchi_boshqaning_buyurtmalarini_korolmaydi(self):
        sohaviy = make_user("sohaviy_w2@teamflow.uz", "Boshqarma", role=GlobalRole.SOHAVIY,
                            specialty=Specialty.SOHAVIY)
        ChangeRequest.objects.create(system_name="Maxfiy tizim", department="Moliya",
                                     responsible_person="X", created_by=sohaviy, status=S.NEW)
        r = self.client_for(self.dev).get(f"/api/users/{sohaviy.pk}/work/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["orders"], [])
        self.assertEqual(r.data["order_stats"]["total"], 0)

    def test_ozi_ozining_buyurtmalarini_koradi(self):
        sohaviy = make_user("sohaviy_w3@teamflow.uz", "Boshqarma", role=GlobalRole.SOHAVIY,
                            specialty=Specialty.SOHAVIY)
        ChangeRequest.objects.create(system_name="O'z tizimim", department="Moliya",
                                     responsible_person="X", created_by=sohaviy, status=S.NEW)
        r = self.client_for(sohaviy).get(f"/api/users/{sohaviy.pk}/work/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["order_stats"]["total"], 1)
