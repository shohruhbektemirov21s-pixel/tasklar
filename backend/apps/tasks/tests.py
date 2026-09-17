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


class TaskTeamCollaborationTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.pm_user = make_user(
            "pm_team@teamflow.uz", "Loyiha Menejeri",
            role=GlobalRole.MANAGER, specialty=Specialty.PM
        )
        self.dev1 = make_user(
            "dev1@teamflow.uz", "Dasturchi 1",
            role=GlobalRole.DEVELOPER, specialty=Specialty.DEVELOPER
        )
        self.dev2 = make_user(
            "dev2@teamflow.uz", "Dasturchi 2",
            role=GlobalRole.DEVELOPER, specialty=Specialty.DEVELOPER
        )
        self.dev3 = make_user(
            "dev3@teamflow.uz", "Dasturchi 3 (QA)",
            role=GlobalRole.DEVELOPER, specialty=Specialty.DEVELOPER
        )
        self.stranger = make_user(
            "stranger@teamflow.uz", "Begona odam",
            role=GlobalRole.DEVELOPER, specialty=Specialty.DEVELOPER
        )

        self.workspace = Workspace.objects.create(name="Team Workspace", owner=self.pm_user)
        self.project = Project.objects.create(
            workspace=self.workspace,
            name="Jamoaviy Loyiha", key="JTEAM", manager=self.pm_user, created_by=self.pm_user
        )
        for u in [self.pm_user, self.dev1, self.dev2, self.dev3]:
            ProjectMember.objects.create(
                project=self.project, user=u, role=ProjectRole.DEVELOPER if u != self.pm_user else ProjectRole.MANAGER,
                is_active=True
            )

        self.task = Task.objects.create(
            project=self.project, title="Katta modulni ishlab chiqish", created_by=self.dev1
        )

    def test_developer_can_add_team_members_with_datetime(self):
        """Dasturchi 1 vazifaga 3 kishini jamoa shaklida birlashtira oladi."""
        client = APIClient()
        client.force_authenticate(user=self.dev1)

        # 1-a'zo (Backend)
        res1 = client.post(f"/api/tasks/{self.task.id}/team/", {
            "user_id": self.dev1.id,
            "role": "Backend API",
            "start_date": "2026-09-15T09:00:00Z",
            "due_date": "2026-09-20T18:00:00Z",
            "allocated_hours": "16.0",
            "note": "Ma'lumotlar bazasi va API endpointlari",
        })
        self.assertEqual(res1.status_code, 200)

        # 2-a'zo (Frontend)
        res2 = client.post(f"/api/tasks/{self.task.id}/team/", {
            "user_id": self.dev2.id,
            "role": "Frontend UI",
            "start_date": "2026-09-16T10:00:00Z",
            "due_date": "2026-09-22T18:00:00Z",
            "allocated_hours": "20.0",
            "note": "React komponentlar va shakllar",
        })
        self.assertEqual(res2.status_code, 200)

        # 3-a'zo (QA / Testlash)
        res3 = client.post(f"/api/tasks/{self.task.id}/team/", {
            "user_id": self.dev3.id,
            "role": "QA Testlash",
            "start_date": "2026-09-20T09:00:00Z",
            "due_date": "2026-09-25T18:00:00Z",
            "allocated_hours": "8.0",
            "note": "Regressiya va integratsion sinovlar",
        })
        self.assertEqual(res3.status_code, 200)

        # Vazifada 3 kishi biriktirilganini tekshirish
        self.task.refresh_from_db()
        active_assignments = list(self.task.assignments.filter(is_active=True).order_by("id"))
        self.assertEqual(len(active_assignments), 3)

        # Tafsilotlar
        roles = [a.role for a in active_assignments]
        self.assertIn("Backend API", roles)
        self.assertIn("Frontend UI", roles)
        self.assertIn("QA Testlash", roles)

        # Har birining vaqti va sanasi saqlanganini tekshirish
        backend_assign = self.task.assignments.get(user=self.dev1, is_active=True)
        self.assertIsNotNone(backend_assign.start_date)
        self.assertIsNotNone(backend_assign.due_date)
        self.assertEqual(float(backend_assign.allocated_hours), 16.0)

    def test_developer_can_update_team_member(self):
        """Jamoa a'zosining muddati va roli yangilanishi."""
        client = APIClient()
        client.force_authenticate(user=self.dev1)

        # Dastlab qo'shish
        client.post(f"/api/tasks/{self.task.id}/team/", {
            "user_id": self.dev2.id,
            "role": "Dizayn",
            "allocated_hours": "5.0",
        })

        # Keyin yangilash
        res = client.post(f"/api/tasks/{self.task.id}/team/", {
            "user_id": self.dev2.id,
            "role": "Dizayn va Prototip",
            "allocated_hours": "10.0",
            "start_date": "2026-09-17T09:00:00Z",
            "due_date": "2026-09-21T18:00:00Z",
            "note": "Yangilangan vazifa",
        })
        self.assertEqual(res.status_code, 200)

        assign = self.task.assignments.get(user=self.dev2, is_active=True)
        self.assertEqual(assign.role, "Dizayn va Prototip")
        self.assertEqual(float(assign.allocated_hours), 10.0)

    def test_developer_can_remove_team_member(self):
        """Jamoa a'zosini vazifadan chiqarish."""
        client = APIClient()
        client.force_authenticate(user=self.dev1)

        # Qo'shish
        client.post(f"/api/tasks/{self.task.id}/team/", {
            "user_id": self.dev2.id,
            "role": "Frontend",
        })
        self.assertTrue(self.task.assignments.filter(user=self.dev2, is_active=True).exists())

        # Chiqarish
        res = client.post(f"/api/tasks/{self.task.id}/team-remove/", {
            "user_id": self.dev2.id,
        })
        self.assertEqual(res.status_code, 200)
        self.assertFalse(self.task.assignments.filter(user=self.dev2, is_active=True).exists())

    def test_cannot_add_non_project_member(self):
        """Loyihada bo'lmagan begona shaxs jamoaga qo'shilmaydi."""
        client = APIClient()
        client.force_authenticate(user=self.dev1)

        res = client.post(f"/api/tasks/{self.task.id}/team/", {
            "user_id": self.stranger.id,
            "role": "Begona",
        })
        self.assertEqual(res.status_code, 400)

    def test_cannot_assign_task_to_admin_or_boss(self):
        """Bosh admin va Boshliqqa task berilmasligi tekshiruvi."""
        admin_user = make_user(
            "admin_test@teamflow.uz", "Bosh Admin",
            role=GlobalRole.ADMIN, specialty=Specialty.DEVELOPER
        )
        boss_user = make_user(
            "boss_test@teamflow.uz", "Tashkilot Boshlig'i",
            role=GlobalRole.BOSS, specialty=Specialty.DEVELOPER
        )
        for u in [admin_user, boss_user]:
            ProjectMember.objects.create(
                project=self.project, user=u, role=ProjectRole.DEVELOPER, is_active=True
            )

        client = APIClient()
        client.force_authenticate(user=self.pm_user)

        # 1. Vazifa yaratishda admin yoki boshliqqa berilmasligi
        res_admin = client.post("/api/tasks/", {
            "project": self.project.id,
            "title": "Adminga berilmasin",
            "assignee_ids": [admin_user.id],
        })
        self.assertEqual(res_admin.status_code, 400)

        res_boss = client.post("/api/tasks/", {
            "project": self.project.id,
            "title": "Boshliqqa berilmasin",
            "assignee_ids": [boss_user.id],
        })
        self.assertEqual(res_boss.status_code, 400)

        # 2. Team modal orqali qo'shilmasligi
        res_team_admin = client.post(f"/api/tasks/{self.task.id}/team/", {
            "user_id": admin_user.id,
            "role": "Admin",
        })
        self.assertEqual(res_team_admin.status_code, 400)

        res_team_boss = client.post(f"/api/tasks/{self.task.id}/team/", {
            "user_id": boss_user.id,
            "role": "Boshliq",
        })
        self.assertEqual(res_team_boss.status_code, 400)

        # 3. Boshqa odamga o'tkazish (reassign) orqali ham berilmasligi
        res_reassign_admin = client.post(f"/api/tasks/{self.task.id}/reassign/", {
            "user_id": admin_user.id,
        })
        self.assertEqual(res_reassign_admin.status_code, 400)

        res_reassign_boss = client.post(f"/api/tasks/{self.task.id}/reassign/", {
            "user_id": boss_user.id,
        })
        self.assertEqual(res_reassign_boss.status_code, 400)

    def test_pm_can_only_be_assigned_task_by_boss(self):
        """PMga faqat boshliq task bera olishi tekshiruvi."""
        boss_user = make_user(
            "boss_pm_test@teamflow.uz", "Boshliq",
            role=GlobalRole.BOSS, specialty=Specialty.DEVELOPER
        )
        another_pm = make_user(
            "pm2_test@teamflow.uz", "Ikkinchi PM",
            role=GlobalRole.MANAGER, specialty=Specialty.PM
        )
        ProjectMember.objects.create(project=self.project, user=boss_user, role=ProjectRole.MANAGER, is_active=True)
        ProjectMember.objects.create(project=self.project, user=another_pm, role=ProjectRole.MANAGER, is_active=True)

        dev_client = APIClient()
        dev_client.force_authenticate(user=self.dev1)

        pm_client = APIClient()
        pm_client.force_authenticate(user=self.pm_user)

        boss_client = APIClient()
        boss_client.force_authenticate(user=boss_user)

        # 1. Dasturchi yoki PM boshqa PMga vazifa yarata olmaydi
        res_dev_to_pm = dev_client.post("/api/tasks/", {
            "project": self.project.id,
            "title": "Dasturchi PMga berganda",
            "assignee_ids": [another_pm.id],
        })
        self.assertEqual(res_dev_to_pm.status_code, 400)

        res_pm_to_pm = pm_client.post("/api/tasks/", {
            "project": self.project.id,
            "title": "PM boshqa PMga berganda",
            "assignee_ids": [another_pm.id],
        })
        self.assertEqual(res_pm_to_pm.status_code, 400)

        # 2. Team modal orqali dasturchi yoki PM boshqa PMni qo'sha olmaydi
        res_team_pm = pm_client.post(f"/api/tasks/{self.task.id}/team/", {
            "user_id": another_pm.id,
            "role": "Loyiha boshqaruvi",
        })
        self.assertEqual(res_team_pm.status_code, 400)

        # 3. Boshliq esa PMga vazifa bera oladi
        res_boss_to_pm = boss_client.post("/api/tasks/", {
            "project": self.project.id,
            "title": "Boshliq PMga vazifa topshirdi",
            "assignee_ids": [another_pm.id],
        })
        self.assertEqual(res_boss_to_pm.status_code, 201)

        # 4. Boshliq team modal orqali ham PMni biriktira oladi
        res_boss_team_pm = boss_client.post(f"/api/tasks/{self.task.id}/team/", {
            "user_id": another_pm.id,
            "role": "Menejment",
        })
        self.assertEqual(res_boss_team_pm.status_code, 200)


class TaskEditPermissionAndHistoryTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.pm_user = make_user(
            "pm_edit@teamflow.uz", "Loyiha Menejeri PM",
            role=GlobalRole.MANAGER, specialty=Specialty.PM
        )
        self.boss_user = make_user(
            "boss_edit@teamflow.uz", "Tashkilot Boshlig'i",
            role=GlobalRole.BOSS
        )
        self.dev_user = make_user(
            "dev_edit@teamflow.uz", "Dasturchi Dev",
            role=GlobalRole.DEVELOPER, specialty=Specialty.DEVELOPER
        )
        self.workspace = Workspace.objects.create(name="PM Boss Maydon", owner=self.pm_user)
        self.project = Project.objects.create(
            workspace=self.workspace,
            name="PM Boss Loyiha", key="PMB", manager=self.pm_user, created_by=self.pm_user
        )
        ProjectMember.objects.create(
            project=self.project, user=self.pm_user, role=ProjectRole.MANAGER, is_active=True
        )
        ProjectMember.objects.create(
            project=self.project, user=self.dev_user, role=ProjectRole.DEVELOPER, is_active=True
        )

        # PM bergan vazifa
        self.pm_task = Task.objects.create(
            project=self.project, title="PM bergan vazifa", created_by=self.pm_user
        )
        # Boshliq bergan vazifa
        self.boss_task = Task.objects.create(
            project=self.project, title="Boshliq bergan vazifa", created_by=self.boss_user
        )
        # Dasturchi bergan vazifa
        self.dev_task = Task.objects.create(
            project=self.project, title="Dasturchi ochgan vazifa", created_by=self.dev_user
        )

    def test_developer_cannot_edit_task_created_by_pm(self):
        client = APIClient()
        client.force_authenticate(user=self.dev_user)

        res = client.patch(f"/api/tasks/{self.pm_task.id}/", {
            "title": "Dasturchi PM vazifasini o'zgartirmoqchi bo'ldi",
        })
        self.assertEqual(res.status_code, 403)
        self.assertIn("PM va Boshliq bergan vazifalarni faqat PM va Boshliq tahrirlay oladi", str(res.data))

    def test_developer_cannot_edit_task_created_by_boss(self):
        client = APIClient()
        client.force_authenticate(user=self.dev_user)

        res = client.patch(f"/api/tasks/{self.boss_task.id}/", {
            "title": "Dasturchi Boshliq vazifasini o'zgartirmoqchi bo'ldi",
        })
        self.assertEqual(res.status_code, 403)
        self.assertIn("PM va Boshliq bergan vazifalarni faqat PM va Boshliq tahrirlay oladi", str(res.data))

    def test_pm_and_boss_can_edit_task_and_history_is_logged_with_time(self):
        from apps.activity.models import Activity

        # PM o'zgartiradi
        pm_client = APIClient()
        pm_client.force_authenticate(user=self.pm_user)

        res_pm = pm_client.patch(f"/api/tasks/{self.pm_task.id}/", {
            "title": "PM vazifa sarlavhasini yangiladi",
            "description": "Yangi tavsif",
        })
        self.assertEqual(res_pm.status_code, 200)

        # Tarixda task.updated yozuvi bo'lishi va vaqti borligini tekshirish
        hist = Activity.objects.filter(task=self.pm_task, verb="task.updated").first()
        self.assertIsNotNone(hist)
        self.assertIsNotNone(hist.created_at)
        self.assertEqual(hist.actor, self.pm_user)
        self.assertIn("Sarlavha", hist.detail)

        # /history/ endpointida ko'rinishi
        res_hist = pm_client.get(f"/api/tasks/{self.pm_task.id}/history/")
        self.assertEqual(res_hist.status_code, 200)
        self.assertTrue(any(item["verb"] == "task.updated" for item in res_hist.data))

        # Boshliq ham PM bergan vazifani o'zgartira oladi
        boss_client = APIClient()
        boss_client.force_authenticate(user=self.boss_user)
        res_boss = boss_client.patch(f"/api/tasks/{self.pm_task.id}/", {
            "title": "Boshliq PM vazifasini yangiladi",
        })
        self.assertEqual(res_boss.status_code, 200)

    def test_developer_can_edit_own_created_task(self):
        client = APIClient()
        client.force_authenticate(user=self.dev_user)

        res = client.patch(f"/api/tasks/{self.dev_task.id}/", {
            "title": "Dasturchi o'z vazifasini yangiladi",
        })
        self.assertEqual(res.status_code, 200)
        self.dev_task.refresh_from_db()
        self.assertEqual(self.dev_task.title, "Dasturchi o'z vazifasini yangiladi")



