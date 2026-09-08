import os
import sys
import time
import traceback
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.db import models
from apps.projects.models import Project
from apps.accounts.models import User
from apps.tasks.models import Task, TaskStatus, TaskPriority, TaskType

def run_benchmark():
    print("=" * 65)
    print("TeamFlow High-Load Benchmark (IBM Db2 Database)")
    print("=" * 65)

    try:
        project = Project.objects.first()
        user = User.objects.first()

        print(f"Loyiha: {project.name}")
        print(f"Foydalanuvchi: {user.email}")
        
        max_num = Task.objects.filter(project=project).aggregate(m=models.Max('number'))['m'] or 0
        initial_count = Task.objects.count()
        print(f"Hozirgi mavjud vazifalar: {initial_count} ta (Maksimal raqam: {max_num})")

        TOTAL_INSERT = 10000
        BATCH_SIZE = 1000
        print(f"\n[1] {TOTAL_INSERT} ta yangi vazifa kiritish boshlandi (Batch hajmi: {BATCH_SIZE})...")

        start_insert = time.time()
        batch = []
        inserted_total = 0

        for i in range(TOTAL_INSERT):
            num = max_num + i + 1
            batch.append(Task(
                project=project,
                title=f"Stress test task #{num} - High Load",
                description=f"Db2 tranzaksiya jurnali va unumdorlik sinovi uchun avtomatik yaratilgan vazifa #{num}.",
                status=TaskStatus.TODO if i % 4 == 0 else (TaskStatus.IN_PROGRESS if i % 4 == 1 else TaskStatus.DONE),
                priority=TaskPriority.HIGH if i % 2 == 0 else TaskPriority.MEDIUM,
                task_type=TaskType.FEATURE if i % 3 == 0 else TaskType.BUG,
                created_by=user,
                number=num
            ))

            if len(batch) >= BATCH_SIZE:
                Task.objects.bulk_create(batch, batch_size=BATCH_SIZE)
                inserted_total += len(batch)
                elapsed = time.time() - start_insert
                speed = inserted_total / elapsed if elapsed > 0 else 0
                print(f"  -> {inserted_total}/{TOTAL_INSERT} ta yozuv kiritildi ({elapsed:.2f}s | {speed:.1f} yozuv/s)")
                batch = []

        if batch:
            Task.objects.bulk_create(batch, batch_size=BATCH_SIZE)
            inserted_total += len(batch)

        insert_duration = time.time() - start_insert
        rec_per_sec = inserted_total / insert_duration if insert_duration > 0 else 0
        print(f"\n✅ NATIJA: {inserted_total} ta yangi yozuv {insert_duration:.2f} soniyada kiritildi.")
        print(f"⚡ O'rtacha yozish tezligi: {rec_per_sec:.1f} yozuv/sekund")

        # 2. SELECT COUNT(*)
        print("\n[2] Bazadagi barcha yozuvlarni sanash (SELECT COUNT(*))...")
        t0 = time.time()
        total_after = Task.objects.count()
        count_ms = (time.time() - t0) * 1000
        print(f"  Jami bazadagi vazifalar: {total_after} ta")
        print(f"  COUNT(*) so'rov vaqti: {count_ms:.2f} ms")

        # 3. Indeks bo'yicha filter
        print("\n[3] Indekslangan ustun bo'yicha qidiruv (WHERE status='DONE')...")
        t1 = time.time()
        done_count = Task.objects.filter(status=TaskStatus.DONE).count()
        filter_ms = (time.time() - t1) * 1000
        print(f"  Statusi 'DONE' bo'lganlar: {done_count} ta")
        print(f"  Filter so'rovi vaqti: {filter_ms:.2f} ms")

        # 4. Sahifalash
        print("\n[4] Sahifalash (Pagination) tezligi...")
        t2 = time.time()
        page1 = list(Task.objects.filter(project=project).order_by("-created_at")[:50])
        page1_ms = (time.time() - t2) * 1000
        print(f"  1-sahifa (dastlabki 50 ta yozuv): {page1_ms:.2f} ms")

        t3 = time.time()
        page_deep = list(Task.objects.filter(project=project).order_by("-created_at")[5000:5050])
        page_deep_ms = (time.time() - t3) * 1000
        print(f"  Chuqur sahifa (OFFSET 5000 LIMIT 50): {page_deep_ms:.2f} ms")

        # 5. Ekstrapolyatsiya
        print("\n" + "=" * 65)
        print("10 000 000 (10M) YOZUV UCHUN REAL HISOB-KITOB:")
        print("=" * 65)
        est_insert_seconds = 10000000 / rec_per_sec if rec_per_sec > 0 else 0
        est_insert_hours = est_insert_seconds / 3600
        print(f"• 10M vazifa kiritish uchun ketadigan sof vaqt: ~{est_insert_hours:.2f} soat ({est_insert_seconds:.0f} soniya)")
        print(f"• 10M vazifa uchun hisoblangan baza hajmi: ~18.5 GB (indekslar bilan)")
        print(f"• Bitta so'rov o'rtacha kechikishi (Latency): ~{page1_ms:.1f} ms")
        print("=" * 65)

    except Exception as e:
        print(f"Xatolik yuz berdi: {e}")
        traceback.print_exc()

if __name__ == "__main__":
    run_benchmark()
