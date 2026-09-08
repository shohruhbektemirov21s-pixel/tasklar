"""Senior QA Test Suite: Sohaviy boshqarmalar profili, Buyurtmalar ruxsatlari va Admin panel tahlili.

Ushbu sinov to'plami Senior QA yondashuvi asosida:
1. Ro'yxatdan o'tish (Registration) - ijobiy, salbiy va chegaraviy holatlar.
2. Buyurtmalar (Orders / Change Requests) kirish huquqi - RBAC (Role-Based Access Control) matritsasi.
3. Django Admin Mutaxassisliklar tahlili (Specialty Analytics) - xavfsizlik, hisob-kitoblar aniqligi va render tekshiruvi.
4. Foydalanuvchi modeli va seriyalizator shartnomasi (Contract testing).
"""
from django.contrib.admin.sites import site
from django.test import RequestFactory, TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.admin import UserAdmin
from apps.accounts.models import Department, GlobalRole, SpecialtyAnalytics, User
from apps.accounts.serializers import MeSerializer, UserSerializer
from apps.accounts.specialties import Seniority, Specialty, specialty_catalog
from apps.orders.models import ChangeRequest, ChangeRequestPriority, ChangeRequestStatus
from apps.notifications.models import Notification, NotificationKind
from tests.base import ApiTestCase, make_user


class RegistrationSuite(TestCase):
    """Foydalanuvchini ro'yxatdan o'tkazish (Registration) bo'yicha Senior QA testlari."""

    def setUp(self):
        self.client = APIClient()
        self.register_url = "/api/auth/register/"
        self.specialties_url = "/api/auth/specialties/"

    def test_register_sohaviy_profile_success(self):
        """Sohaviy boshqarmalar mutaxassisligi bilan ro'yxatdan o'tish muvaffaqiyatli bo'lishi shart."""
        payload = {
            "email": "sohaviy_vakil@tizim.uz",
            "full_name": "Toshmatov Dilshod",
            "specialty": Specialty.SOHAVIY,
            "password": "murakkab-parol-2026",
            "password_confirm": "murakkab-parol-2026",
        }
        res = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.content)

        data = res.json()
        user_data = data["user"]
        self.assertTrue(user_data["is_sohaviy_boshqarma"])
        self.assertTrue(user_data["can_access_orders"])
        self.assertEqual(user_data["global_role"], GlobalRole.SOHAVIY)
        self.assertEqual(user_data["specialty"], Specialty.SOHAVIY)

        # Bazadagi holatni tekshirish
        user = User.objects.get(email="sohaviy_vakil@tizim.uz")
        self.assertEqual(user.global_role, GlobalRole.SOHAVIY)
        self.assertEqual(user.specialty, Specialty.SOHAVIY)
        self.assertTrue(user.is_sohaviy_boshqarma)
        self.assertTrue(user.can_access_orders)

    def test_register_standard_developer_profile(self):
        """Oddiy dasturchi ro'yxatdan o'tganda unga buyurtmalar ruxsati berilmasligi shart."""
        payload = {
            "email": "dasturchi_vali@tizim.uz",
            "full_name": "Valiyev Ali",
            "specialty": Specialty.BACKEND,
            "password": "murakkab-parol-2026",
            "password_confirm": "murakkab-parol-2026",
        }
        res = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        user_data = res.json()["user"]
        self.assertFalse(user_data["is_sohaviy_boshqarma"])
        self.assertFalse(user_data["can_access_orders"])
        self.assertEqual(user_data["global_role"], GlobalRole.DEVELOPER)

    def test_register_pm_becomes_manager(self):
        """Loyiha menejeri tanlanganda tizim roli MANAGER bo'lishi shart."""
        payload = {
            "email": "pm_sherzod@tizim.uz",
            "full_name": "Sherzod PM",
            "specialty": Specialty.PM,
            "password": "murakkab-parol-2026",
            "password_confirm": "murakkab-parol-2026",
        }
        res = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.json()["user"]["global_role"], GlobalRole.MANAGER)

    def test_register_invalid_specialty_rejected(self):
        """Mavjud bo'lmagan mutaxassislik kiritilganda 400 xatosi qaytishi shart."""
        payload = {
            "email": "hacker@tizim.uz",
            "full_name": "Hacker John",
            "specialty": "COSMONAUT",
            "password": "murakkab-parol-2026",
            "password_confirm": "murakkab-parol-2026",
        }
        res = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("specialty", res.json())

    def test_register_missing_specialty_rejected(self):
        """Mutaxassislik tanlanmaganda ro'yxatdan o'tish rad etilishi shart."""
        payload = {
            "email": "empty_spec@tizim.uz",
            "full_name": "Ismsiz",
            "password": "murakkab-parol-2026",
            "password_confirm": "murakkab-parol-2026",
        }
        res = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_password_mismatch_rejected(self):
        """Parol tasdig'i mos kelmaganda ro'yxatdan o'tkazilmasligi shart."""
        payload = {
            "email": "test_mismatch@tizim.uz",
            "full_name": "Sinovchi",
            "specialty": Specialty.SOHAVIY,
            "password": "murakkab-parol-2026",
            "password_confirm": "boshqa-parol-2026",
        }
        res = self.client.post(self.register_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_specialties_catalog_endpoint_includes_sohaviy(self):
        """/api/auth/specialties/ endpointida Sohaviy boshqarmalar mavjud bo'lishi shart."""
        res = self.client.get(self.specialties_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        specialties = res.json().get("specialties", [])
        sohaviy = next((s for s in specialties if s["value"] == Specialty.SOHAVIY), None)
        self.assertIsNotNone(sohaviy, "Sohaviy boshqarmalar mutaxassisliklar ro'yxatida topilmadi!")
        self.assertEqual(sohaviy["label"], "Sohaviy boshqarmalar")
        self.assertEqual(sohaviy["icon"], "[S]")


class BuyurtmalarAccessControlSuite(ApiTestCase):
    """Buyurtmalar (Orders / Change Requests) ruxsatlari bo'yicha Senior QA RBAC testlari."""

    def setUp(self):
        super().setUp()
        self.orders_url = "/api/orders/"

        # Rollar bo'yicha foydalanuvchilar
        self.sohaviy_user = make_user(
            "sohaviy_test@sinov.uz", "Sohaviy Boshqarma Mas'uli",
            role=GlobalRole.SOHAVIY, specialty=Specialty.SOHAVIY
        )
        self.operator_user = make_user(
            "operator_test@sinov.uz", "Operator Zokir",
            role=GlobalRole.OPERATOR
        )
        self.developer_user = make_user(
            "dev_test@sinov.uz", "Dasturchi Botir",
            role=GlobalRole.DEVELOPER, specialty=Specialty.BACKEND
        )

        self.client_sohaviy = self.client_for(self.sohaviy_user)
        self.client_admin = self.client_for(self.admin)
        self.client_dev = self.client_for(self.developer_user)
        self.client_operator = self.client_for(self.operator_user)
        self.client_manager = self.client_for(self.manager)

        # Sinov buyurtmasi
        self.order = ChangeRequest.objects.create(
            system_name="TeamFlow Sinov",
            module="Bojxona to'lovlari",
            department="Bojxona to'lovlari boshqarmasi",
            responsible_person="Dilshod Rahimov",
            current_state="Hisobotlar sekin ishlamoqda",
            requested_change="Kesh mexanizmini joriy etish",
            reason="Qonunchilik talabi",
            priority=ChangeRequestPriority.HIGH,
            status=ChangeRequestStatus.NEW,
            created_by=self.sohaviy_user,
        )

    def test_sohaviy_can_list_orders(self):
        """Sohaviy boshqarma vakili buyurtmalar ro'yxatini ko'ra olishi shart."""
        res = self.client_sohaviy.get(self.orders_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(res.json()["count"], 1)

    def test_sohaviy_can_create_order(self):
        """Sohaviy boshqarma vakili yangi buyurtma yarata olishi shart."""
        payload = {
            "system_name": "TeamFlow",
            "module": "Statistika",
            "department": "Axborot xavfsizligi boshqarmasi",
            "responsible_person": "Javohir Karimov",
            "current_state": "Avtorizatsiya monitoringi yo'q",
            "requested_change": "Audit loglarini vizuallashtirish",
            "reason": "Xavfsizlik standarti",
            "priority": "HIGH",
        }
        res = self.client_sohaviy.post(self.orders_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.content)
        self.assertTrue(res.json()["request_no"].startswith("ORD-"))

    def test_sohaviy_can_retrieve_order_and_export_docx(self):
        """Sohaviy boshqarma vakili buyurtmani ko'rishi va Word (.docx) yuklab olishi shart."""
        detail_url = f"{self.orders_url}{self.order.id}/"
        res = self.client_sohaviy.get(detail_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        export_url = f"{self.orders_url}{self.order.id}/export-docx/"
        res_export = self.client_sohaviy.get(export_url)
        self.assertEqual(res_export.status_code, status.HTTP_200_OK)
        self.assertIn("application/vnd.openxmlformats-officedocument", res_export["Content-Type"])

    def test_sohaviy_can_view_stats(self):
        """Sohaviy boshqarma vakili buyurtmalar statistikasini ko'ra olishi shart."""
        res = self.client_sohaviy.get(f"{self.orders_url}stats/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("total", res.json())
        self.assertIn("new", res.json())

    def test_platform_admin_has_full_orders_access(self):
        """Platforma administratori buyurtmalar bo'limiga to'liq kira olishi shart."""
        res = self.client_admin.get(self.orders_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_developer_is_strictly_forbidden_from_orders(self):
        """Oddiy dasturchi buyurtmalar bo'limiga kira olmasligi shart (403 Forbidden)."""
        res_list = self.client_dev.get(self.orders_url)
        self.assertEqual(res_list.status_code, status.HTTP_403_FORBIDDEN)

        res_post = self.client_dev.post(self.orders_url, {"system_name": "Test"}, format="json")
        self.assertEqual(res_post.status_code, status.HTTP_403_FORBIDDEN)

    def test_operator_is_strictly_forbidden_from_orders(self):
        """Operator buyurtmalar bo'limiga kira olmasligi shart (403 Forbidden)."""
        res_list = self.client_operator.get(self.orders_url)
        self.assertEqual(res_list.status_code, status.HTTP_403_FORBIDDEN)

    def test_manager_can_access_orders(self):
        """Loyiha menejeri (PM) buyurtmalar bo'limiga kira olishi shart (PM qarori va muddat belgilash uchun)."""
        res_list = self.client_manager.get(self.orders_url)
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)

    def test_anonymous_user_unauthorized_from_orders(self):
        """Tizimga kirmagan (anonim) foydalanuvchi buyurtmalarga kira olmasligi shart."""
        res = self.anon.get(self.orders_url)
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


class SpecialtyAnalyticsAdminSuite(TestCase):
    """Django Admin Mutaxassisliklar tahlili (Specialty Analytics) bo'yicha Senior QA testlari."""

    @classmethod
    def setUpTestData(cls):
        cls.factory = RequestFactory()
        cls.admin_user = make_user("superadmin@tizim.uz", "Katta Admin", role=GlobalRole.ADMIN, is_staff=True, is_superuser=True)
        cls.dev_user = make_user("dev_staff@tizim.uz", "Oddiy Xodim", role=GlobalRole.DEVELOPER, is_staff=False)

        # Boshqarmalar
        cls.dept_it = Department.objects.create(name="IT Boshqarma", code="IT")
        cls.dept_finance = Department.objects.create(name="Moliya Boshqarma", code="FIN")

        # Turli mutaxassislikdagi xodimlarni yaratish
        make_user("backend1@tizim.uz", "Backend 1", specialty=Specialty.BACKEND, seniority=Seniority.SENIOR, department=cls.dept_it)
        make_user("backend2@tizim.uz", "Backend 2", specialty=Specialty.BACKEND, seniority=Seniority.MIDDLE, department=cls.dept_it)
        make_user("sohaviy1@tizim.uz", "Sohaviy 1", role=GlobalRole.SOHAVIY, specialty=Specialty.SOHAVIY, department=cls.dept_finance)
        make_user("sohaviy2@tizim.uz", "Sohaviy 2", role=GlobalRole.SOHAVIY, specialty=Specialty.SOHAVIY)
        make_user("qa1@tizim.uz", "QA 1", specialty=Specialty.QA, seniority=Seniority.JUNIOR)

    def test_admin_can_access_specialties_analytics_view(self):
        """Platforma admini Mutaxassisliklar tahlili sahifasini 200 OK bilan ochishi shart."""
        request = self.factory.get("/admin/accounts/user/analytics/")
        request.user = self.admin_user

        user_admin = UserAdmin(User, site)
        response = user_admin.specialties_analytics_view(request)
        self.assertEqual(response.status_code, 200)

        # Render qilishda xato yo'qligini tekshirish
        response.render()
        content = response.content.decode("utf-8")
        self.assertIn("Mutaxassisliklar bo'yicha to'liq tahlil", content)
        self.assertIn("Sohaviy boshqarmalar", content)

    def test_analytics_metrics_calculation_accuracy(self):
        """Tahlil sahifasidagi ko'rsatkichlar bazadagi aniq ma'lumotlarga mos kelishi shart."""
        request = self.factory.get("/admin/accounts/user/analytics/")
        request.user = self.admin_user

        user_admin = UserAdmin(User, site)
        response = user_admin.specialties_analytics_view(request)

        ctx = response.context_data
        total_in_db = User.objects.count()
        self.assertEqual(ctx["total_users"], total_in_db)

        sohaviy_in_db = User.objects.filter(specialty=Specialty.SOHAVIY).count()
        self.assertEqual(ctx["sohaviy_users"], sohaviy_in_db)
        self.assertGreaterEqual(ctx["sohaviy_users"], 2)

        # Mutaxassisliklar guruhlanishi
        spec_stats = {item["code"]: item for item in ctx["specialty_stats"]}
        self.assertIn(Specialty.SOHAVIY, spec_stats)
        self.assertIn(Specialty.BACKEND, spec_stats)
        self.assertEqual(spec_stats[Specialty.BACKEND]["count"], 4)
        self.assertEqual(spec_stats[Specialty.SOHAVIY]["count"], 2)

    def test_analytics_department_and_seniority_distribution(self):
        """Boshqarmalar va darajalar (seniority) bo'yicha tahlil aniq shakllanishi shart."""
        request = self.factory.get("/admin/accounts/user/analytics/")
        request.user = self.admin_user

        user_admin = UserAdmin(User, site)
        response = user_admin.specialties_analytics_view(request)
        ctx = response.context_data

        # Boshqarmalar hisoboti
        dept_names = [d["department"].name for d in ctx["dept_stats"]]
        self.assertIn("IT Boshqarma", dept_names)
        self.assertIn("Moliya Boshqarma", dept_names)

        # Seniority hisoboti
        totals = ctx["seniority_totals"]
        self.assertGreaterEqual(totals[Seniority.SENIOR], 1)
        self.assertGreaterEqual(totals[Seniority.MIDDLE], 1)

    def test_specialty_analytics_proxy_model_redirect(self):
        """SpecialtyAnalytics proxy modeliga kirganda tahlil sahifasiga redirect bo'lishi shart."""
        from apps.accounts.admin import SpecialtyAnalyticsAdmin
        request = self.factory.get("/admin/accounts/specialtyanalytics/")
        request.user = self.admin_user

        proxy_admin = SpecialtyAnalyticsAdmin(SpecialtyAnalytics, site)
        response = proxy_admin.changelist_view(request)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse("admin:accounts_user_analytics"))


class SecurityAndIntegritySuite(TestCase):
    """Xavfsizlik va Model/Serializer shartnomasi bo'yicha testlar."""

    def test_user_properties_integrity(self):
        """User modelidagi is_sohaviy_boshqarma va can_access_orders mantiqiy to'g'riligi."""
        u1 = make_user("soh_role@sinov.uz", role=GlobalRole.SOHAVIY, specialty=Specialty.ANALYST)
        self.assertTrue(u1.is_sohaviy_boshqarma)
        self.assertTrue(u1.can_access_orders)

        u2 = make_user("soh_spec@sinov.uz", role=GlobalRole.DEVELOPER, specialty=Specialty.SOHAVIY)
        self.assertTrue(u2.is_sohaviy_boshqarma)
        self.assertTrue(u2.can_access_orders)

        u3 = make_user("admin_acc@sinov.uz", role=GlobalRole.ADMIN)
        self.assertTrue(u3.can_access_orders)

        u4 = make_user("dev_acc@sinov.uz", role=GlobalRole.DEVELOPER, specialty=Specialty.DEVOPS)
        self.assertFalse(u4.is_sohaviy_boshqarma)
        self.assertFalse(u4.can_access_orders)

    def test_serializer_contract(self):
        """UserSerializer va MeSerializer yangi maydonlarni to'g'ri qaytarishi shart."""
        user = make_user("ser_test@sinov.uz", role=GlobalRole.SOHAVIY, specialty=Specialty.SOHAVIY)
        data = UserSerializer(user).data
        self.assertIn("is_sohaviy_boshqarma", data)
        self.assertIn("can_access_orders", data)
        self.assertTrue(data["is_sohaviy_boshqarma"])
        self.assertTrue(data["can_access_orders"])

        me_data = MeSerializer(user).data
        self.assertIn("is_sohaviy_boshqarma", me_data)
        self.assertIn("can_access_orders", me_data)


class OrderNotificationSuite(ApiTestCase):
    """Sohaviy boshqarmalar buyurtma bildirishnomalari bo'yicha Senior QA sinovlari."""

    def setUp(self):
        super().setUp()
        self.sohaviy1 = make_user("sohaviy1@boshqarma.uz", role=GlobalRole.SOHAVIY, specialty=Specialty.SOHAVIY)
        self.sohaviy2 = make_user("sohaviy2@boshqarma.uz", role=GlobalRole.SOHAVIY, specialty=Specialty.SOHAVIY)
        self.admin = make_user("admin_notif@boshqarma.uz", role=GlobalRole.ADMIN)
        self.dev = make_user("dev_notif@boshqarma.uz", role=GlobalRole.DEVELOPER, specialty=Specialty.BACKEND)

    def test_sidebar_counts_includes_orders_for_sohaviy_profile(self):
        """Sohaviy boshqarma profiliga /api/counts/ da faol buyurtmalar soni (orders) qaytishi shart."""
        # 2 ta faol buyurtma yaratamiz
        ChangeRequest.objects.create(
            request_no="ORD-TEST-001",
            system_name="TeamFlow",
            department="Moliya",
            responsible_person="Aliyev",
            current_state="Xato",
            requested_change="Tuzatilsin",
            reason="Zarur",
            status=ChangeRequestStatus.NEW,
            created_by=self.sohaviy1,
        )
        ChangeRequest.objects.create(
            request_no="ORD-TEST-002",
            system_name="TeamFlow",
            department="Moliya",
            responsible_person="Aliyev",
            current_state="Xato 2",
            requested_change="Tuzatilsin 2",
            reason="Zarur",
            status=ChangeRequestStatus.IN_PROGRESS,
            created_by=self.sohaviy1,
        )
        # 1 ta yakunlangan (COMPLETED) buyurtma
        ChangeRequest.objects.create(
            request_no="ORD-TEST-003",
            system_name="TeamFlow",
            department="Moliya",
            responsible_person="Aliyev",
            current_state="Tugagan",
            requested_change="Tuzatilgan",
            reason="Zarur",
            status=ChangeRequestStatus.COMPLETED,
            created_by=self.sohaviy1,
        )

        # Sohaviy boshqarma foydalanuvchisi uchun tekshirish
        client = self.client_for(self.sohaviy1)
        res = client.get("/api/counts/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("orders", data)
        self.assertEqual(data["orders"], 2)  # Faqat NEW va IN_PROGRESS sanaladi

        # Oddiy dasturchi uchun orders 0 bo'lishi shart
        dev_client = self.client_for(self.dev)
        dev_res = dev_client.get("/api/counts/")
        self.assertEqual(dev_res.status_code, 200)
        self.assertEqual(dev_res.json()["orders"], 0)

    def test_order_creation_triggers_notification_for_colleagues_and_admin(self):
        """Yangi buyurtma yaratilganda boshqa sohaviy xodimlar va adminga bildirishnoma borishi shart."""
        client = self.client_for(self.sohaviy1)
        payload = {
            "system_name": "Tizim 1",
            "module": "Kadrlar",
            "department": "HR Boshqarma",
            "responsible_person": "Karimov A.",
            "priority": "HIGH",
            "current_state": "Xodimlar ro'yxati sekin ishlayapti",
            "requested_change": "Kesh qo'shilsin va qidiruv tezlashtirilsin",
            "reason": "Xodimlar ko'paygani sababli",
        }
        res = client.post("/api/orders/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # 1. Sohaviy hamkasbga bildirishnoma kelgan bo'lishi kerak
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.sohaviy2,
                kind=NotificationKind.ORDER_NEW
            ).exists()
        )

        # 2. Adminga bildirishnoma kelgan bo'lishi kerak
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.admin,
                kind=NotificationKind.ORDER_NEW
            ).exists()
        )

        # 3. Yaratgan odamning o'ziga xabar tushmasligi kerak
        self.assertFalse(
            Notification.objects.filter(
                recipient=self.sohaviy1,
                kind=NotificationKind.ORDER_NEW
            ).exists()
        )

        # 4. Ruxsati yo'q oddiy dasturchiga xabar tushmasligi kerak
        self.assertFalse(
            Notification.objects.filter(
                recipient=self.dev,
                kind=NotificationKind.ORDER_NEW
            ).exists()
        )

    def test_order_status_update_notifies_author(self):
        """Buyurtma holati o'zgarganda (masalan qabul qilinganda) buyurtma muallifiga bildirishnoma borishi shart."""
        order = ChangeRequest.objects.create(
            request_no="ORD-STATUS-001",
            system_name="ERP",
            department="Moliya",
            responsible_person="Sobirov",
            current_state="Hisobot noto'g'ri",
            requested_change="Formulani o'zgartirish",
            reason="Audit talabi",
            status=ChangeRequestStatus.NEW,
            created_by=self.sohaviy1,
        )

        # Admin holatni o'zgartiradi
        admin_client = self.client_for(self.admin)
        res = admin_client.patch(f"/api/orders/{order.pk}/", {"status": ChangeRequestStatus.ACCEPTED}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Muallif (sohaviy1) ga ORDER_STATUS bildirishnomasi kelgan bo'lishi shart
        notif = Notification.objects.filter(
            recipient=self.sohaviy1,
            kind=NotificationKind.ORDER_STATUS
        ).first()
        self.assertIsNotNone(notif)
        self.assertIn("Buyurtma holati", notif.title)
        self.assertEqual(notif.actor, self.admin)
