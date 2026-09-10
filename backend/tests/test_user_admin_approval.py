"""Senior QA Test Suite: Django Admin User Approval and Verification workflows."""
from django.contrib.admin.sites import site
from django.contrib.messages.storage.fallback import FallbackStorage
from django.test import RequestFactory, TestCase

from apps.accounts.admin import UserAdmin, UserApprovalStatusFilter
from apps.accounts.models import GlobalRole, User
from apps.activity.models import Activity


def add_messages_to_request(request):
    setattr(request, "session", "session")
    messages = FallbackStorage(request)
    setattr(request, "_messages", messages)


class UserAdminApprovalSuite(TestCase):
    """Admin panel orqali foydalanuvchini tasdiqlash testlari."""

    @classmethod
    def setUpTestData(cls):
        cls.factory = RequestFactory()
        cls.admin_user = User.objects.create_superuser(
            email="admin_approval@tizim.uz",
            password="password123",
            full_name="Adminbek Tasdiqlovchi",
        )

        cls.pending_user = User.objects.create_user(
            email="pending_user@tizim.uz",
            password="password123",
            full_name="Kutayotgan Foydalanuvchi",
            is_active=False,
        )

        cls.active_user = User.objects.create_user(
            email="active_user@tizim.uz",
            password="password123",
            full_name="Faol Foydalanuvchi",
            is_active=True,
        )

    def setUp(self):
        self.user_admin = UserAdmin(User, site)

    def test_approval_badges(self):
        """active_badge va approval_action to'g'ri HTML qaytarishi shart."""
        badge_pending = self.user_admin.active_badge(self.pending_user)
        self.assertIn("Tasdiq kutilmoqda", badge_pending)

        action_pending = self.user_admin.approval_action(self.pending_user)
        self.assertIn("Tasdiqlash", action_pending)
        self.assertIn(f"/admin/accounts/user/{self.pending_user.pk}/approve/", action_pending)

        badge_active = self.user_admin.active_badge(self.active_user)
        self.assertIn("Faol", badge_active)

        action_active = self.user_admin.approval_action(self.active_user)
        self.assertIn("Bloklash", action_active)
        self.assertIn(f"/admin/accounts/user/{self.active_user.pk}/deactivate/", action_active)

    def test_approve_user_view(self):
        """approve_user_view nofaol userni faollashtirishi va log yozishi shart."""
        request = self.factory.get(f"/admin/accounts/user/{self.pending_user.pk}/approve/")
        request.user = self.admin_user
        add_messages_to_request(request)

        response = self.user_admin.approve_user_view(request, self.pending_user.pk)
        self.assertEqual(response.status_code, 302)

        self.pending_user.refresh_from_db()
        self.assertTrue(self.pending_user.is_active)

        # Audit log yozilganini tekshirish
        log_entry = Activity.objects.filter(verb="user.approved", actor=self.admin_user).first()
        self.assertIsNotNone(log_entry)

    def test_deactivate_user_view(self):
        """deactivate_user_view foydalanuvchini nofaol qilishi shart."""
        request = self.factory.get(f"/admin/accounts/user/{self.active_user.pk}/deactivate/")
        request.user = self.admin_user
        add_messages_to_request(request)

        response = self.user_admin.deactivate_user_view(request, self.active_user.pk)
        self.assertEqual(response.status_code, 302)

        self.active_user.refresh_from_db()
        self.assertFalse(self.active_user.is_active)

    def test_admin_cannot_deactivate_self(self):
        """Admin o'z hisobini nofaol qila olmasligi shart."""
        request = self.factory.get(f"/admin/accounts/user/{self.admin_user.pk}/deactivate/")
        request.user = self.admin_user
        add_messages_to_request(request)

        response = self.user_admin.deactivate_user_view(request, self.admin_user.pk)
        self.assertEqual(response.status_code, 302)

        self.admin_user.refresh_from_db()
        self.assertTrue(self.admin_user.is_active)

    def test_bulk_approve_users(self):
        """approve_selected_users bir nechta userni bir vaqtda faollashtirishi shart."""
        u1 = User.objects.create_user(email="b1@tizim.uz", password="p", full_name="B1", is_active=False)
        u2 = User.objects.create_user(email="b2@tizim.uz", password="p", full_name="B2", is_active=False)

        request = self.factory.post("/admin/accounts/user/")
        request.user = self.admin_user
        add_messages_to_request(request)

        qs = User.objects.filter(id__in=[u1.id, u2.id])
        self.user_admin.approve_selected_users(request, qs)

        u1.refresh_from_db()
        u2.refresh_from_db()
        self.assertTrue(u1.is_active)
        self.assertTrue(u2.is_active)

    def test_filter_approval_status(self):
        """UserApprovalStatusFilter to'g'ri ishlashi shart."""
        request_pending = self.factory.get("/admin/accounts/user/?approval_status=pending")
        filter_pending = UserApprovalStatusFilter(
            request_pending, request_pending.GET.copy(), User, self.user_admin
        )
        qs_pending = filter_pending.queryset(request_pending, User.objects.all())
        self.assertFalse(qs_pending.filter(is_active=True).exists())
        self.assertTrue(qs_pending.filter(is_active=False).exists())

        request_active = self.factory.get("/admin/accounts/user/?approval_status=active")
        filter_active = UserApprovalStatusFilter(
            request_active, request_active.GET.copy(), User, self.user_admin
        )
        qs_active = filter_active.queryset(request_active, User.objects.all())
        self.assertFalse(qs_active.filter(is_active=False).exists())
        self.assertTrue(qs_active.filter(is_active=True).exists())
