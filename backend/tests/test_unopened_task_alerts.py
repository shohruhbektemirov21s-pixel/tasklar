"""3 soat ichida ochilmagan vazifalar ogohlantirishi testlari."""
from datetime import timedelta
from unittest import mock

from django.core.management import call_command
from django.utils import timezone

from apps.notifications.models import Notification, NotificationKind
from apps.notifications.services import (
    check_unopened_task_notifications,
    mark_task_notifications_read,
    notify,
)
from apps.projects.models import ProjectMember, ProjectRole
from apps.tasks.models import Task, TaskAssignment
from apps.tasks.services import sync_assignees
from apps.telegram.models import TelegramLink

from .base import ApiTestCase, make_user


class UnopenedTaskAlertTest(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.developer = make_user("xodim@sinov.uz", "Aziz Rahimov")
        ProjectMember.objects.create(
            project=cls.project, user=cls.developer, role=ProjectRole.DEVELOPER
        )

    def setUp(self):
        super().setUp()
        self.task = Task.objects.create(
            project=self.project,
            title="Backend xavfsizlik modulini yaratish",
            created_by=self.manager,
            number=101,
        )

    def test_unopened_task_alerts_pm_after_3_hours(self):
        """Vazifa berilgach 3 soat ichida ochilmasa, PMga bildirishnoma boradi."""
        # 1. Vazifani xodimga biriktiramiz
        sync_assignees(self.task, [self.developer.id], self.manager)

        # Xodimga TASK_ASSIGNED bildirishnomasi kelganini tekshiramiz
        notif = Notification.objects.filter(
            recipient=self.developer,
            kind=NotificationKind.TASK_ASSIGNED,
            is_read=False,
        ).first()
        self.assertIsNotNone(notif)

        # 2. Vaqtni 3 soat 10 daqiqa orqaga suramiz
        past_time = timezone.now() - timedelta(hours=3, minutes=10)
        Notification.objects.filter(pk=notif.pk).update(created_at=past_time)

        # 3. Tekshiruv funksiyasini ishga tushiramiz
        sent = check_unopened_task_notifications()
        self.assertEqual(sent, 1)

        # 4. PMga kelgan ogohlantirishni tekshiramiz
        pm_notifs = Notification.objects.filter(
            recipient=self.manager,
            kind=NotificationKind.TASK_UNOPENED_WARNING,
        )
        self.assertEqual(pm_notifs.count(), 1)
        pm_notif = pm_notifs.first()
        self.assertIn("Aziz Rahimov", pm_notif.title)
        self.assertIn("Aziz Rahimov", pm_notif.body)
        self.assertIn(self.task.code, pm_notif.body)
        self.assertIn("3 soat", pm_notif.body)
        self.assertEqual(pm_notif.url, f"/vazifa/{self.task.pk}")

        # 5. Qayta tekshirilganda takroriy xabar yuborilmasligi kerak
        sent_again = check_unopened_task_notifications()
        self.assertEqual(sent_again, 0)
        self.assertEqual(pm_notifs.count(), 1)

    def test_opened_task_does_not_alert_pm(self):
        """Agar xodim vazifani ochib ko'rgan bo'lsa, 3 soatdan keyin ham ogohlantirish ketmaydi."""
        sync_assignees(self.task, [self.developer.id], self.manager)

        notif = Notification.objects.filter(
            recipient=self.developer,
            kind=NotificationKind.TASK_ASSIGNED,
        ).first()
        self.assertIsNotNone(notif)

        # Xodim vazifani ochib ko'radi (GET /api/tasks/{id}/)
        res = self.client_for(self.developer).get(f"/api/tasks/{self.task.pk}/")
        self.assertEqual(res.status_code, 200)

        # Bildirishnoma o'qilgan deb belgilanganini tekshiramiz
        notif.refresh_from_db()
        self.assertTrue(notif.is_read)

        # Vaqtni 4 soat orqaga suramiz
        past_time = timezone.now() - timedelta(hours=4)
        Notification.objects.filter(pk=notif.pk).update(created_at=past_time)

        # Tekshiruv ishga tushadi
        sent = check_unopened_task_notifications()
        self.assertEqual(sent, 0)

        pm_notifs = Notification.objects.filter(
            recipient=self.manager,
            kind=NotificationKind.TASK_UNOPENED_WARNING,
        )
        self.assertEqual(pm_notifs.count(), 0)

    def test_task_view_marks_notifications_read(self):
        """Vazifa sahifasini ochish ushbu vazifaga tegishli bildirishnomalarni avtomatik o'qilgan qiladi."""
        notify(
            self.developer,
            NotificationKind.TASK_ASSIGNED,
            title="Yangi vazifa",
            url=f"/vazifa/{self.task.pk}",
            actor=self.manager,
            meta={"task": self.task.pk},
        )
        self.assertEqual(
            Notification.objects.filter(recipient=self.developer, is_read=False).count(), 1
        )

        res = self.client_for(self.developer).get(f"/api/tasks/{self.task.pk}/")
        self.assertEqual(res.status_code, 200)

        self.assertEqual(
            Notification.objects.filter(recipient=self.developer, is_read=False).count(), 0
        )

    def test_telegram_notification_to_pm(self):
        """Telegram ulangan PMga ochilmagan vazifa xabari bot orqali ham yetkaziladi."""
        # PM uchun Telegram bog'lanishini yaratamiz
        self.manager.telegram = "@pm_manager"
        self.manager.save(update_fields=["telegram"])
        TelegramLink.objects.create(
            user=self.manager, chat_id=777888999
        )

        sync_assignees(self.task, [self.developer.id], self.manager)

        notif = Notification.objects.filter(
            recipient=self.developer,
            kind=NotificationKind.TASK_ASSIGNED,
        ).first()
        past_time = timezone.now() - timedelta(hours=3, minutes=15)
        Notification.objects.filter(pk=notif.pk).update(created_at=past_time)

        with mock.patch("apps.telegram.client.is_configured", return_value=True), \
             mock.patch("apps.telegram.client.send_message", return_value=True) as mock_send:
            sent = check_unopened_task_notifications()
            self.assertEqual(sent, 1)
            self.assertTrue(mock_send.called)
            args, kwargs = mock_send.call_args
            self.assertEqual(args[0], 777888999)
            self.assertIn("Aziz Rahimov", args[1])
            self.assertIn(self.task.code, args[1])

    def test_management_command_check_unopened_tasks(self):
        """Management command check_unopened_tasks to'g'ri ishlaydi."""
        sync_assignees(self.task, [self.developer.id], self.manager)
        notif = Notification.objects.filter(
            recipient=self.developer,
            kind=NotificationKind.TASK_ASSIGNED,
        ).first()
        past_time = timezone.now() - timedelta(hours=5)
        Notification.objects.filter(pk=notif.pk).update(created_at=past_time)

        call_command("check_unopened_tasks", hours=3)

        pm_notifs = Notification.objects.filter(
            recipient=self.manager,
            kind=NotificationKind.TASK_UNOPENED_WARNING,
        )
        self.assertEqual(pm_notifs.count(), 1)
