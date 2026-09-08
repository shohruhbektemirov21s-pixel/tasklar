import os
import sys
import time
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.db import connection, transaction
from apps.tasks.models import Task
from apps.projects.models import Project
from apps.accounts.models import User
import seed_demo_data

def clean_database():
    print("=" * 65)
    print("TEAMFLOW: MA'LUMOTLAR BAZASINI TOZALASH (CLEAN DATABASE)")
    print("=" * 65)

    initial_tasks = Task.objects.count()
    print(f"Joriy mavjud vazifalar: {initial_tasks} ta")

    # 1. Eski test va yuklama vazifalarini xavfsiz batchlarda tozalash
    print("\n[1] Sinov va yuklama vazifalarini tozalash boshlandi...")
    batch_size = 3000
    deleted_total = 0

    while True:
        task_ids = list(Task.objects.values_list('id', flat=True)[:batch_size])
        if not task_ids:
            break
        with transaction.atomic():
            deleted_count, _ = Task.objects.filter(id__in=task_ids).delete()
            deleted_total += deleted_count
        print(f"  -> {deleted_total}/{initial_tasks} ta vazifa tozalandi...")
        time.sleep(0.05)

    print(f"✅ Barcha eski test vazifalar tozalandi: {deleted_total} ta.")

    # 2. Toza boshlang'ich demo ma'lumotlarni qayta kiritish
    print("\n[2] Toza demo ma'lumotlarni (Loyihalar, Vazifalar, Foydalanuvchilar) qayta tiklash...")
    seed_demo_data.run_seed()

    # 3. Natijalarni ko'rsatish
    final_tasks = Task.objects.count()
    final_projects = Project.objects.count()
    final_users = User.objects.count()

    print("\n" + "=" * 65)
    print("✅ BAZA TOZALANDI VA STANDART HOLATGA KELTIRILDI:")
    print(f"• Vazifalar: {final_tasks} ta (toza demo vazifalar)")
    print(f"• Loyihalar: {final_projects} ta")
    print(f"• Foydalanuvchilar: {final_users} ta")
    print("=" * 65)

if __name__ == "__main__":
    clean_database()
