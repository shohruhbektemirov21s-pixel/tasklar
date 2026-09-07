from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType
from apps.accounts.models import GlobalRole

User = get_user_model()


class Command(BaseCommand):
    help = "Admin, Menejer va Operator rollari hamda guruhlarini sozlash"

    def handle(self, *args, **options):
        self.stdout.write("Guruhlar va huquqlar sozlanmoqda...")

        # 1. Guruhlar
        manager_group, _ = Group.objects.get_or_create(name="Menejerlar")
        operator_group, _ = Group.objects.get_or_create(name="Operatorlar")
        boss_group, _ = Group.objects.get_or_create(name="Boshliqlar")

        # Ruxsatlarni biriktirish
        # ContentTypelarni topamiz
        try:
            from apps.tasks.models import Task, Comment
            from apps.projects.models import Project
            from apps.workspaces.models import Workspace

            task_ct = ContentType.objects.get_for_model(Task)
            comment_ct = ContentType.objects.get_for_model(Comment)
            project_ct = ContentType.objects.get_for_model(Project)
            workspace_ct = ContentType.objects.get_for_model(Workspace)
            user_ct = ContentType.objects.get_for_model(User)

            # Menejer huquqlari: Loyihalar, Vazifalar, Ish maydonlarini to'liq ko'rish/o'zgartirish, Foydalanuvchilarni ko'rish
            manager_perms = Permission.objects.filter(
                content_type__in=[task_ct, comment_ct, project_ct, workspace_ct]
            ) | Permission.objects.filter(
                content_type=user_ct,
                codename__in=["view_user", "change_user"]
            )
            manager_group.permissions.set(manager_perms)

            # Operator huquqlari: Vazifalarni ko'rish va holatini o'zgartirish, Izoh yozish, Loyihalarni ko'rish
            operator_perms = Permission.objects.filter(
                content_type=task_ct,
                codename__in=["view_task", "change_task"]
            ) | Permission.objects.filter(
                content_type=comment_ct,
                codename__in=["view_comment", "add_comment"]
            ) | Permission.objects.filter(
                content_type__in=[project_ct, workspace_ct],
                codename__in=["view_project", "view_workspace"]
            )
            operator_group.permissions.set(operator_perms)
            self.stdout.write(self.style.SUCCESS("Guruhlar va ruxsatlar muvaffaqiyatli saqlandi."))
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"Ruxsatlarni belgilashda ogohlantirish: {e}"))

        # 2. Xodimlarni yangilash va yaratish
        # Admin
        admin_user = User.objects.filter(email="admin@teamflow.uz").first()
        if admin_user:
            admin_user.global_role = GlobalRole.ADMIN
            admin_user.is_staff = True
            admin_user.is_superuser = True
            admin_user.set_password("admin123")
            admin_user.save()
            self.stdout.write(self.style.SUCCESS("Admin sozlandi: admin@teamflow.uz / admin123"))

        # Menejer (Platformada ishlaydi, admin panelga kirmaydi)
        manager_user = User.objects.filter(email="menejer@teamflow.uz").first()
        if not manager_user:
            manager_user = User.objects.create_user(
                email="menejer@teamflow.uz",
                password="menejer123",
                full_name="Bobur Rahimov (Menejer)",
                job_title="Katta Loyiha Menejeri",
                global_role=GlobalRole.MANAGER,
                is_staff=False,
            )
            self.stdout.write(self.style.SUCCESS("Menejer yaratildi: menejer@teamflow.uz / menejer123"))
        else:
            manager_user.is_staff = False
            manager_user.is_superuser = False
            manager_user.global_role = GlobalRole.MANAGER
            manager_user.save()

        manager_user.groups.add(manager_group)

        # Operator (Platformada ishlaydi, admin panelga kirmaydi)
        operator_user = User.objects.filter(email="operator@teamflow.uz").first()
        if not operator_user:
            operator_user = User.objects.create_user(
                email="operator@teamflow.uz",
                password="operator123",
                full_name="Dilshod Karimov (Operator)",
                job_title="Tizim Operatori",
                global_role=GlobalRole.OPERATOR,
                is_staff=False,
            )
            self.stdout.write(self.style.SUCCESS("Operator yaratildi: operator@teamflow.uz / operator123"))
        else:
            operator_user.is_staff = False
            operator_user.is_superuser = False
            operator_user.global_role = GlobalRole.OPERATOR
            operator_user.save()

        operator_user.groups.add(operator_group)

        # Faqat ADMIN ga is_staff=True qoldiramiz, boshqa barcha foydalanuvchilardan is_staff ni olib tashlaymiz
        User.objects.exclude(global_role=GlobalRole.ADMIN).update(is_staff=False, is_superuser=False)
        User.objects.filter(global_role=GlobalRole.ADMIN).update(is_staff=True, is_superuser=True)
        self.stdout.write(self.style.SUCCESS("Faqat ADMIN hisoblari admin panelga kirishi sozlandi!"))

