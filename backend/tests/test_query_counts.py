from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection

from apps.accounts.models import User, Department, GlobalRole
from apps.accounts.specialties import Specialty, Seniority
from apps.workspaces.models import Workspace
from apps.projects.models import Project, ProjectMember, ProjectRole
from apps.tasks.models import Task, TaskStatus, TaskPriority, TaskType, TaskAssignment
from apps.tasks.serializers import TaskSerializer
from apps.orders.models import ChangeRequest, ChangeRequestStatus, ChangeRequestType
from apps.orders.serializers import ChangeRequestSerializer

from .base import ApiTestCase


class QueryCountOptimizationTests(ApiTestCase):
    def test_task_serializer_parent_select_related(self):
        """Ota vazifa ma'lumotlari (parent_code, parent_title) qo'shimcha so'rovsiz olinadi."""
        parent_task = Task.objects.create(
            project=self.project,
            title="Ota vazifa",
            created_by=self.manager,
        )

        # 5 ta ostki vazifa yaratamiz
        subtasks = []
        for i in range(5):
            t = Task.objects.create(
                project=self.project,
                parent=parent_task,
                title=f"Ostki vazifa {i}",
                created_by=self.manager,
            )
            subtasks.append(t)

        # for_display() bilan olingan querysetda parent select_related bo'lgan
        qs = list(Task.objects.for_display().filter(parent=parent_task))
        self.assertEqual(len(qs), 5)

        # Serializatsiya paytida parent uchun qo'shimcha so'rov ketmasligi kerak (0 so'rov)
        with CaptureQueriesContext(connection) as ctx:
            for task_obj in qs:
                s = TaskSerializer(task_obj, context={"request": None})
                _ = s.data["parent_code"]
                _ = s.data["parent_title"]

        # Hech qanday qo'shimcha SQL so'rovi bo'lmasligi kerak (chunki parent keshda)
        if len(ctx.captured_queries) > 0:
            print("CAPTURED QUERIES:", [q["sql"] for q in ctx.captured_queries])
        self.assertEqual(len(ctx.captured_queries), 0)

    def test_orders_project_progress_memoization(self):
        """Bir xil loyihaga tegishli buyurtmalar loyiha progressini qayta-qayta hisoblamaydi."""
        # Loyihaga 3 ta buyurtma biriktiramiz
        orders = []
        for i in range(3):
            cr = ChangeRequest.objects.create(
                project=self.project,
                requested_change=f"Buyurtma {i}",
                order_type=ChangeRequestType.NEW,
                status=ChangeRequestStatus.IN_PROGRESS,
                created_by=self.dev,
            )
            orders.append(cr)

        # Buyurtmalar ro'yxati (select_related bilan)
        orders_qs = list(ChangeRequest.objects.filter(project=self.project).select_related(
            "created_by", "created_by__department", "project", "project__manager", "assigned_pm", "assigned_developer", "linked_task"
        ))
        self.assertEqual(len(orders_qs), 3)

        # Barcha buyurtmalarni umumiy kontekst bilan serializatsiya qilamiz
        context = {}
        with CaptureQueriesContext(connection) as ctx:
            for o in orders_qs:
                s = ChangeRequestSerializer(o, context=context)
                _ = s.data.get("project_detail")

        # Bir xil loyiha bo'lgani uchun progress faqat 1 marta hisoblanadi (2 ta COUNT so'rov)
        # N ta buyurtma uchun 2*N bo'lmaydi
        task_count_queries = [
            q["sql"] for q in ctx.captured_queries
            if "COUNT(" in q["sql"].upper() and "TASKS" in q["sql"].upper()
        ]
        # Maksimal 2 ta COUNT so'rovi bo'lishi kerak (total va done)
        self.assertLessEqual(len(task_count_queries), 2)
