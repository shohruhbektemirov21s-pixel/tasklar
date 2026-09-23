from io import StringIO
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings

User = get_user_model()


class SecurityCommandsTests(TestCase):
    def test_setup_roles_preserves_existing_password_in_production(self):
        admin = User.objects.create_superuser(
            email="admin@teamflow.uz",
            password="StrongSecretPassword123!",
            full_name="Admin Asl",
        )
        old_password_hash = admin.password

        with override_settings(DEBUG=False):
            out = StringIO()
            call_command("setup_roles", stdout=out)
            output = out.getvalue()

        admin.refresh_from_db()
        self.assertEqual(admin.password, old_password_hash)
        self.assertTrue(admin.check_password("StrongSecretPassword123!"))
        self.assertFalse(admin.check_password("admin123"))
        self.assertNotIn("admin123", output)

    def test_setup_roles_does_not_create_plaintext_users_when_debug_false(self):
        User.objects.filter(email__in=["admin@teamflow.uz", "menejer@teamflow.uz", "operator@teamflow.uz"]).delete()

        with override_settings(DEBUG=False):
            out = StringIO()
            call_command("setup_roles", stdout=out)
            output = out.getvalue()

        self.assertFalse(User.objects.filter(email="admin@teamflow.uz").exists())
        self.assertFalse(User.objects.filter(email="menejer@teamflow.uz").exists())
        self.assertFalse(User.objects.filter(email="operator@teamflow.uz").exists())
        self.assertNotIn("admin123", output)
        self.assertNotIn("menejer123", output)
        self.assertNotIn("operator123", output)

    def test_run_seed_refuses_production(self):
        import seed_demo_data

        with override_settings(DEBUG=False):
            with self.assertRaises(RuntimeError):
                seed_demo_data.run_seed()

    def test_clean_database_refuses_production(self):
        import scripts.clean_database as clean_db

        with override_settings(DEBUG=False):
            with self.assertRaises(RuntimeError):
                clean_db.clean_database()
