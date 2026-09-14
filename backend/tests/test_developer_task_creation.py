from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from apps.projects.models import Project, ProjectMember, ProjectRole
from apps.tasks.models import Task
from apps.workspaces.models import Workspace

User = get_user_model()


class DeveloperTaskCreationTest(APITestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            email="pm@test.uz", password="pass", full_name="Loyiha Menejeri", global_role="MANAGER"
        )
        self.dev1 = User.objects.create_user(
            email="dev1@test.uz", password="pass", full_name="Dasturchi Bir", global_role="DEVELOPER"
        )
        self.dev2 = User.objects.create_user(
            email="dev2@test.uz", password="pass", full_name="Dasturchi Ikki", global_role="DEVELOPER"
        )
        self.outsider = User.objects.create_user(
            email="out@test.uz", password="pass", full_name="Begona Dasturchi", global_role="DEVELOPER"
        )

        self.workspace = Workspace.objects.create(name="Ish maydoni", slug="ish-maydoni", owner=self.manager)
        self.project = Project.objects.create(
            name="Test Loyiha", key="TL", workspace=self.workspace, manager=self.manager, created_by=self.manager
        )
        ProjectMember.objects.create(project=self.project, user=self.manager, role=ProjectRole.MANAGER)
        ProjectMember.objects.create(project=self.project, user=self.dev1, role=ProjectRole.DEVELOPER)
        ProjectMember.objects.create(project=self.project, user=self.dev2, role=ProjectRole.DEVELOPER)

    def test_dasturchi_oziga_va_sheriklariga_vazifa_ochadi(self):
        self.client.force_authenticate(user=self.dev1)
        resp = self.client.post("/api/tasks/", {
            "project": self.project.pk,
            "title": "Dasturchi ochgan yangi vazifa",
            "description": "Batafsil tavsif",
            "priority": 2,
            "task_type": "FEATURE",
            "assignee_ids": [self.dev1.pk, self.dev2.pk],
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        task_id = resp.data["id"]

        task = Task.objects.get(pk=task_id)
        self.assertEqual(task.created_by, self.dev1)
        assignee_ids = list(task.assignments.filter(is_active=True).values_list("user_id", flat=True))
        self.assertIn(self.dev1.pk, assignee_ids)
        self.assertIn(self.dev2.pk, assignee_ids)

        # Dasturchi o'zi ochgan vazifani tahrirlab sheriklarini yangilay oladi
        resp_patch = self.client.patch(f"/api/tasks/{task_id}/", {
            "title": "Yangilangan sarlavha",
            "assignee_ids": [self.dev1.pk],
        }, format="json")
        self.assertEqual(resp_patch.status_code, 200)
        task.refresh_from_db()
        self.assertEqual(task.title, "Yangilangan sarlavha")

    def test_begona_dasturchi_vazifa_ocha_olmaydi(self):
        self.client.force_authenticate(user=self.outsider)
        resp = self.client.post("/api/tasks/", {
            "project": self.project.pk,
            "title": "Begona vazifa",
            "priority": 2,
            "task_type": "FEATURE",
        }, format="json")
        self.assertEqual(resp.status_code, 403)
