from rest_framework.test import APITestCase
from apps.accounts.models import User, SpecialtyItem


class SpecialtyAPITestCase(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_superuser(
            email="admin@example.com",
            password="Password123!",
            full_name="Super Admin",
        )
        self.member_user = User.objects.create_user(
            email="member@example.com",
            password="Password123!",
            full_name="Regular Member",
        )

    def test_list_specialties_authenticated(self):
        self.client.force_authenticate(user=self.member_user)
        res = self.client.get("/api/auth/specialties/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("specialties", res.data)
        self.assertTrue(len(res.data["specialties"]) >= 12)

    def test_create_specialty_as_admin(self):
        self.client.force_authenticate(user=self.admin_user)
        payload = {
            "name": "Kiberxavfsizlik mutaxassisi",
            "icon": "🛡️",
            "color": "rose",
            "skills": "SIEM, SOC, Penetration testing",
        }
        res = self.client.post("/api/auth/specialties/", data=payload, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["specialty"]["value"], "KIBERXAVFSIZLIK_MUTAXASSISI")
        self.assertTrue(SpecialtyItem.objects.filter(code="KIBERXAVFSIZLIK_MUTAXASSISI").exists())

    def test_create_specialty_forbidden_for_regular_member(self):
        self.client.force_authenticate(user=self.member_user)
        payload = {
            "name": "Yangi mutaxassislik",
        }
        res = self.client.post("/api/auth/specialties/", data=payload, format="json")
        self.assertEqual(res.status_code, 403)

    def test_delete_specialty_as_admin(self):
        item = SpecialtyItem.objects.create(name="Test O'chirish", code="TEST_DELETE")
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.delete(f"/api/auth/specialties/{item.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(SpecialtyItem.objects.filter(id=item.id).exists())
