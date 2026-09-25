from datetime import timedelta

from django.utils import timezone
from rest_framework import status

from apps.tasks.models import Task, TaskStatus
from tests.base import ApiTestCase


class ProjectCountersTests(ApiTestCase):
    """`project_counters()` dagi sanoqlar, xususan `overdue_tasks`."""

    def test_overdue_tasks_counts_only_open_tasks_past_due_date(self):
        past = timezone.now() - timedelta(days=2)
        future = timezone.now() + timedelta(days=2)

        Task.objects.create(project=self.project, title="Muddati o'tgan ochiq ish",
                            created_by=self.manager, status=TaskStatus.TODO, due_date=past)
        Task.objects.create(project=self.project, title="Muddati o'tgan, lekin bajarilgan",
                            created_by=self.manager, status=TaskStatus.DONE, due_date=past)
        Task.objects.create(project=self.project, title="Muddati hali kelmagan",
                            created_by=self.manager, status=TaskStatus.TODO, due_date=future)
        Task.objects.create(project=self.project, title="Muddatsiz ish",
                            created_by=self.manager, status=TaskStatus.TODO)

        res = self.api.get(f"/api/projects/{self.project.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["overdue_tasks"], 1)
        self.assertEqual(res.data["open_tasks"], 3)
        self.assertEqual(res.data["done_tasks"], 1)

    def test_overdue_tasks_zero_when_no_tasks_are_late(self):
        res = self.api.get(f"/api/projects/{self.project.id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["overdue_tasks"], 0)
