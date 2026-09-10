from rest_framework.test import APIClient
from apps.accounts.models import GlobalRole, Specialty
from apps.projects.models import Project, ProjectMember, ProjectRole
from apps.tasks.models import Task
from apps.workspaces.models import Workspace
from tests.base import ApiTestCase, make_user


class TaskSubtaskTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.pm_user = make_user(
            "pm_test@teamflow.uz", "Loyiha Menejeri",
            role=GlobalRole.MANAGER, specialty=Specialty.PM
        )
        self.dev_user = make_user(
            "dev_test@teamflow.uz", "Dasturchi",
            role=GlobalRole.DEVELOPER, specialty=Specialty.DEVELOPER
        )
        self.workspace = Workspace.objects.create(name="Test Maydon", owner=self.pm_user)
        self.project = Project.objects.create(
            workspace=self.workspace,
            name="Sinov Loyihasi", key="TEST", manager=self.pm_user, created_by=self.pm_user
        )
        ProjectMember.objects.create(
            project=self.project, user=self.pm_user, role=ProjectRole.MANAGER, is_active=True
        )
        ProjectMember.objects.create(
            project=self.project, user=self.dev_user, role=ProjectRole.DEVELOPER, is_active=True
        )

        self.main_task = Task.objects.create(
            project=self.project, title="Asosiy vazifa", created_by=self.pm_user
        )

    def test_pm_can_create_subtask(self):
        client = APIClient()
        client.force_authenticate(user=self.pm_user)
        res = client.post(f"/api/tasks/{self.main_task.id}/subtasks/", {
            "title": "PM tomonidan yaratilgan ostki vazifa",
            "priority": 2,
            "task_type": "FEATURE",
        })
        self.assertEqual(res.status_code, 201)
        subtask = Task.objects.get(id=res.data["id"])
        self.assertEqual(subtask.parent_id, self.main_task.id)
        self.assertEqual(subtask.title, "PM tomonidan yaratilgan ostki vazifa")

    def test_developer_cannot_create_subtask(self):
        client = APIClient()
        client.force_authenticate(user=self.dev_user)
        res = client.post(f"/api/tasks/{self.main_task.id}/subtasks/", {
            "title": "Dasturchi yaratmoqchi bo'lgan ostki vazifa",
            "priority": 2,
        })
        self.assertEqual(res.status_code, 403)

    def test_developer_cannot_create_task_with_parent(self):
        client = APIClient()
        client.force_authenticate(user=self.dev_user)
        res = client.post("/api/tasks/", {
            "project": self.project.id,
            "parent": self.main_task.id,
            "title": "Dasturchi yaratgan vazifa",
        })
        self.assertEqual(res.status_code, 403)

    def test_pm_can_link_and_unlink_subtask(self):
        other_task = Task.objects.create(
            project=self.project, title="Alohida vazifa", created_by=self.pm_user
        )
        client = APIClient()
        client.force_authenticate(user=self.pm_user)

        res = client.post(f"/api/tasks/{self.main_task.id}/link-subtask/", {
            "subtask_id": other_task.id
        })
        self.assertEqual(res.status_code, 200)
        other_task.refresh_from_db()
        self.assertEqual(other_task.parent_id, self.main_task.id)

        res = client.post(f"/api/tasks/{self.main_task.id}/unlink-subtask/", {
            "subtask_id": other_task.id
        })
        self.assertEqual(res.status_code, 200)
        other_task.refresh_from_db()
        self.assertIsNone(other_task.parent_id)

    def test_developer_cannot_link_subtask(self):
        other_task = Task.objects.create(
            project=self.project, title="Alohida vazifa", created_by=self.pm_user
        )
        client = APIClient()
        client.force_authenticate(user=self.dev_user)
        res = client.post(f"/api/tasks/{self.main_task.id}/link-subtask/", {
            "subtask_id": other_task.id
        })
        self.assertEqual(res.status_code, 403)
