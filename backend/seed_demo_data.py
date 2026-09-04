import sys
import os
from django.utils import timezone
from datetime import timedelta

from apps.accounts.models import User, GlobalRole
from apps.accounts.specialties import Specialty, Seniority
from apps.workspaces.models import Workspace, WorkspaceMember, WorkspaceRole
from apps.projects.models import Project, ProjectMember, ProjectRole, ProjectStatus
from apps.tasks.models import Task, TaskStatus, TaskPriority, TaskType, TaskAssignment, Comment, WorkLog
from apps.suggestions.models import Suggestion, SuggestionScope, SuggestionStatus, VoteChoice, SuggestionVote

def run_seed():
    print("Seed skripti boshlandi...")

    # 1. Akkauntlarni yaratish
    users_data = [
        {
            "email": "boshliq@teamflow.uz",
            "full_name": "Akmal Boshliqov",
            "job_title": "Boshliq / Kompaniya direktori",
            "global_role": GlobalRole.BOSS,
            "specialty": Specialty.PM,
            "seniority": Seniority.LEAD,
            "years_experience": 10,
            "skills": "Boshqaruv, Strategiya, Investitsiya",
            "bio": "Kompaniya rahbari hamda mahsulot strategiyasi bo'yicha mas'ul.",
        },
        {
            "email": "pm@teamflow.uz",
            "full_name": "Sardor Menejerov",
            "job_title": "Loyiha Menejeri (PM)",
            "global_role": GlobalRole.MANAGER,
            "specialty": Specialty.PM,
            "seniority": Seniority.SENIOR,
            "years_experience": 5,
            "skills": "Agile, Scrum, Jamoa boshqaruvi, Jira",
            "bio": "Loyiha muddatlari va topshiriqlar taqsimotiga mas'ul menejer.",
        },
        {
            "email": "backend@teamflow.uz",
            "full_name": "Jasur Backendchi",
            "job_title": "Senior Backend Dasturchi",
            "global_role": GlobalRole.DEVELOPER,
            "specialty": Specialty.BACKEND,
            "seniority": Seniority.SENIOR,
            "years_experience": 4,
            "skills": "Python, Django, PostgreSQL, Db2, Docker, Redis",
            "bio": "Server logikasi va ma'lumotlar bazasi optimizatsiyasi bo'yicha mutaxassis.",
        },
        {
            "email": "frontend@teamflow.uz",
            "full_name": "Malika Frontendchi",
            "job_title": "Middle Frontend Dasturchi",
            "global_role": GlobalRole.DEVELOPER,
            "specialty": Specialty.FRONTEND,
            "seniority": Seniority.MIDDLE,
            "years_experience": 3,
            "skills": "TypeScript, React, Vite, CSS, Redux, HTML5",
            "bio": "Foydalanuvchi interfeyslari va animatsiyalar mutaxassisi.",
        },
    ]

    created_users = {}
    for udata in users_data:
        email = udata["email"]
        user, created = User.objects.get_or_create(email=email, defaults=udata)
        user.set_password("password123")
        for k, v in udata.items():
            setattr(user, k, v)
        user.save()
        created_users[email] = user
        status_str = "Yaratildi" if created else "Yangilandi"
        print(f"User {email} ({user.full_name}) -> {status_str}")

    boss = created_users["boshliq@teamflow.uz"]
    pm = created_users["pm@teamflow.uz"]
    dev_backend = created_users["backend@teamflow.uz"]
    dev_frontend = created_users["frontend@teamflow.uz"]

    # 2. Ish maydoni (Workspace) yaratish
    ws, created = Workspace.objects.get_or_create(
        name="TeamFlow Digital Workspace",
        defaults={
            "description": "Kompaniyaning asosiy raqamli ish maydoni va loyihalar markazi.",
            "owner": boss,
            "is_open": True,
        }
    )
    print(f"Workspace: {ws.name}")

    # Ish maydoni a'zolarini biriktirish
    ws_members = [
        (boss, WorkspaceRole.OWNER),
        (pm, WorkspaceRole.ADMIN),
        (dev_backend, WorkspaceRole.MEMBER),
        (dev_frontend, WorkspaceRole.MEMBER),
    ]
    for u, r in ws_members:
        WorkspaceMember.objects.get_or_create(workspace=ws, user=u, defaults={"role": r})

    # 3. Loyiha (Project) yaratish
    project, created = Project.objects.get_or_create(
        workspace=ws,
        name="TeamFlow Platforma 2.0",
        defaults={
            "key": "TF",
            "description": "Jamoa vazifalarini va takliflarini boshqarish uchun zamonaviy platforma.",
            "status": ProjectStatus.ACTIVE,
            "manager": pm,
            "created_by": boss,
            "is_public": True,
            "start_date": timezone.localdate() - timedelta(days=15),
            "due_date": timezone.localdate() + timedelta(days=45),
        }
    )
    project.needed_specialties = [Specialty.BACKEND, Specialty.FRONTEND, Specialty.PM]
    project.save()
    print(f"Loyiha: {project.name} ({project.key})")

    # Loyiha a'zolarini biriktirish
    project_members = [
        (boss, ProjectRole.ADMIN),
        (pm, ProjectRole.MANAGER),
        (dev_backend, ProjectRole.DEVELOPER),
        (dev_frontend, ProjectRole.DEVELOPER),
    ]
    for u, r in project_members:
        ProjectMember.objects.get_or_create(project=project, user=u, defaults={"role": r, "is_active": True})

    # 4. Vazifalar (Tasks) yaratish
    tasks_data = [
        {
            "title": "Db2 ma'lumotlar bazasi indekslari va tranzaksiya jurnalini optimallashtirish",
            "description": "Katta hajmdagi vazifalar yuklanganda tranzaksiya jurnali to'lib qolmasligi uchun 10-teamflow-tuning sozlamasini Db2 da doimiy qilish va indekslarni qayta tashkillash.",
            "status": TaskStatus.IN_PROGRESS,
            "priority": TaskPriority.HIGH,
            "task_type": TaskType.CHORE,
            "required_specialty": Specialty.BACKEND,
            "created_by": pm,
            "reviewer": pm,
            "assignee": dev_backend,
            "estimate_hours": 8.0,
            "due_date": timezone.now() + timedelta(days=3),
        },
        {
            "title": "Takliflar taxtasining mobil va planshet ko'rinishini moslashtirish (Responsive UI)",
            "description": "Mobil qurilmalarda 4 ta ustunli doska sig'may qolyapti. Grid elementlarini mobil ekran o'lchamiga mos responsive va qulay qilish.",
            "status": TaskStatus.IN_PROGRESS,
            "priority": TaskPriority.HIGH,
            "task_type": TaskType.FEATURE,
            "required_specialty": Specialty.FRONTEND,
            "created_by": pm,
            "reviewer": pm,
            "assignee": dev_frontend,
            "estimate_hours": 12.0,
            "due_date": timezone.now() + timedelta(days=5),
        },
        {
            "title": "WebSocket orqali real-time bildirishnomalarni uzatish moduli",
            "description": "Foydalanuvchiga vazifa biriktirilganda yoki taklifga yangi izoh qoldirilganda qo'ng'iroqcha bildirishnomasi darrov yangilanishi kerak.",
            "status": TaskStatus.IN_REVIEW,
            "priority": TaskPriority.URGENT,
            "task_type": TaskType.FEATURE,
            "required_specialty": Specialty.BACKEND,
            "created_by": pm,
            "reviewer": boss,
            "assignee": dev_backend,
            "estimate_hours": 16.0,
            "due_date": timezone.now() + timedelta(days=1),
        },
        {
            "title": "Kun va tungi (Dark Mode) rejimini almashtirish tugmasi",
            "description": "Sayt tepasidagi header qismiga tungi rejim tugmasini joylash va foydalanuvchi tanlovini localStorage da saqlash.",
            "status": TaskStatus.DONE,
            "priority": TaskPriority.MEDIUM,
            "task_type": TaskType.FEATURE,
            "required_specialty": Specialty.FRONTEND,
            "created_by": pm,
            "reviewer": pm,
            "assignee": dev_frontend,
            "estimate_hours": 6.0,
            "due_date": timezone.now() - timedelta(days=2),
        },
        {
            "title": "Telegram Bot integratsiyasi: Muhim xabarlarni guruhga yuborish",
            "description": "Vazifa muddati tugashiga 3 kun qolganda Telegram bot orqali avtomatik ogohlantirish yuborish mexanizmini ishga tushirish.",
            "status": TaskStatus.TODO,
            "priority": TaskPriority.MEDIUM,
            "task_type": TaskType.FEATURE,
            "required_specialty": Specialty.BACKEND,
            "created_by": pm,
            "reviewer": pm,
            "assignee": dev_backend,
            "estimate_hours": 10.0,
            "due_date": timezone.now() + timedelta(days=10),
        },
        {
            "title": "Loyiha fayllari versiyalarini ko'rsatish va yuklab olish UI qismi",
            "description": "Hujjatlarning eski versiyalarini solishtirish va tarixi bilan tanishish uchun alohida modal oyna yaratish.",
            "status": TaskStatus.BLOCKED,
            "blocked_reason": "Backend fayllar versiyalash API si hali to'liq yakunlanmagan",
            "priority": TaskPriority.LOW,
            "task_type": TaskType.FEATURE,
            "required_specialty": Specialty.FRONTEND,
            "created_by": pm,
            "reviewer": pm,
            "assignee": dev_frontend,
            "estimate_hours": 14.0,
            "due_date": timezone.now() + timedelta(days=7),
        },
    ]

    for tdata in tasks_data:
        assignee = tdata.pop("assignee")
        task, t_created = Task.objects.get_or_create(
            project=project,
            title=tdata["title"],
            defaults=tdata
        )
        if assignee:
            TaskAssignment.objects.get_or_create(task=task, user=assignee, defaults={"assigned_by": pm})

        # Izoh va log qo'shish
        if task.status == TaskStatus.IN_PROGRESS:
            Comment.objects.get_or_create(
                task=task,
                author=assignee,
                body="Ishni boshladim, bugun asosiy qismini tugataman."
            )
            WorkLog.objects.get_or_create(
                task=task,
                user=assignee,
                hours=3.5,
                note="Dastlabki strukturani sozlash va arxitekturani tekshirish bajarildi."
            )
        print(f"Task: [{task.code}] {task.title} -> {task.status}")

    # 5. Takliflar (Suggestions) yaratish
    suggestions_data = [
        {
            "title": "Haftada 1 kun masofadan ishlash (Remote Work Day) tizimini joriy etish",
            "body": "Jamoa unumdorligini oshirish va xodimlarga qulaylik yaratish maqsadida har chorshanba kunini masofadan ishlash kuni deb belgilashni taklif qilamiz.",
            "author": dev_backend,
            "scope": SuggestionScope.OPEN,
            "is_anonymous": True,
            "status": SuggestionStatus.APPROVED,
            "decided_by": boss,
            "decided_at": timezone.now() - timedelta(days=1),
            "decision_note": "Ajoyib taklif! Sinov tariqasida kelasi haftadan chorshanba kunlari masofadan ishlashga ruxsat beriladi.",
        },
        {
            "title": "Backend va Frontend avtomatik testlarini CI/CD pipeline ga integratsiya qilish",
            "body": "Har bir Pull Request (PR) ochilganda avtomatik ravishda `npm test` va `python manage.py test` yurgazilishi shart qilib qo'yilsa, xatolar kamayadi.",
            "author": dev_backend,
            "scope": SuggestionScope.OPEN,
            "is_anonymous": False,
            "status": SuggestionStatus.PENDING,
        },
        {
            "title": "Jamoa dasturchilari uchun Figma va JetBrains pullik litsenziyalarini sotib olish",
            "body": "Kod yozish va UI dizaynlarini ko'rish tezlashishi uchun litsenziyalar xaridi uchun byudjet ajratishni so'raymiz.",
            "author": dev_frontend,
            "scope": SuggestionScope.OPEN,
            "is_anonymous": False,
            "status": SuggestionStatus.APPROVED,
            "decided_by": boss,
            "decided_at": timezone.now() - timedelta(hours=5),
            "decision_note": "Litsenziyalar uchun byudjet tasdiqlandi. PM tegishli ro'yxatni shakllantirsin.",
        },
        {
            "title": "Loyiha kodi uchun React 19 Experimental funksiyalarini ishlatish",
            "body": "Eski React komponentlarini yangi eksperimental xususiyatlarga o'tkazishni taklif qilaman.",
            "author": dev_frontend,
            "scope": SuggestionScope.OPEN,
            "is_anonymous": False,
            "status": SuggestionStatus.REJECTED,
            "decided_by": boss,
            "decided_at": timezone.now() - timedelta(days=3),
            "decision_note": "Hozircha barqarorlik (stability) birinchi o'rinda. Eksperimental funksiyalardan foydalanish xavfli.",
        },
    ]

    for sdata in suggestions_data:
        sug, s_created = Suggestion.objects.get_or_create(
            title=sdata["title"],
            defaults=sdata
        )
        # Ovozlar qo'shish
        if sug.is_open:
            SuggestionVote.objects.get_or_create(suggestion=sug, user=dev_backend, defaults={"choice": VoteChoice.FOR})
            SuggestionVote.objects.get_or_create(suggestion=sug, user=dev_frontend, defaults={"choice": VoteChoice.FOR})
            SuggestionVote.objects.get_or_create(suggestion=sug, user=pm, defaults={"choice": VoteChoice.FOR})

        print(f"Taklif: {sug.title} -> Status: {sug.status}")

    print("\n✅ Seed muvaffaqiyatli yakunlandi! 4 ta akkaunt va tegishli ma'lumotlar yaratildi.")

if __name__ == "__main__":
    run_seed()
