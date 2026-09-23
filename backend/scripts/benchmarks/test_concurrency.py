import os
import sys
import time
import threading
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.db import connection, transaction
from apps.projects.models import Project
from apps.accounts.models import User
from apps.tasks.models import Task, TaskStatus, TaskPriority, TaskType

def worker_task(worker_id, num_ops, stats):
    project = Project.objects.first()
    user = User.objects.first()

    for i in range(num_ops):
        t0 = time.time()
        op_type = i % 4

        try:
            if op_type == 0:
                # O'qish: Task ro'yxati
                list(Task.objects.filter(project=project).order_by('-id')[:20])
                stats['reads'] += 1
            elif op_type == 1:
                # O'qish: Filter va hisob
                Task.objects.filter(project=project, status=TaskStatus.TODO).count()
                stats['counts'] += 1
            elif op_type == 2:
                # Yozish: Yangi vazifa yaratish (har bir worker alohida raqam bilan)
                with transaction.atomic():
                    num = 50000 + (worker_id * 1000) + i
                    Task.objects.create(
                        project=project,
                        title=f"Worker #{worker_id} concurrency task #{i}",
                        description="Parallel tranzaksiya sinovi.",
                        status=TaskStatus.TODO,
                        priority=TaskPriority.MEDIUM,
                        task_type=TaskType.FEATURE,
                        created_by=user,
                        number=num
                    )
                stats['writes'] += 1
            elif op_type == 3:
                # Yangilash (UPDATE): Oxirgi vazifaning statusini o'zgartirish
                with transaction.atomic():
                    t = Task.objects.filter(project=project).order_by('-id').first()
                    if t:
                        t.status = TaskStatus.IN_PROGRESS
                        t.save(update_fields=['status', 'updated_at'])
                stats['updates'] += 1

            stats['latencies'].append((time.time() - t0) * 1000)

        except Exception as e:
            stats['errors'].append(f"Worker {worker_id} xato: {str(e)}")
        finally:
            connection.close()

def run_concurrent_test(num_workers=10, ops_per_worker=25):
    print("=" * 65)
    print(f"PARALLEL TRANZAKSIYA VA BAZA BARQARORLIK SINOVI")
    print(f"Parallel Workerlar: {num_workers} ta | Har biri: {ops_per_worker} ta amal | Jami: {num_workers * ops_per_worker} ta operatsiya")
    print("=" * 65)

    stats = {
        'reads': 0,
        'counts': 0,
        'writes': 0,
        'updates': 0,
        'errors': [],
        'latencies': []
    }

    threads = []
    start_time = time.time()

    for w_id in range(num_workers):
        t = threading.Thread(target=worker_task, args=(w_id, ops_per_worker, stats))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    total_duration = time.time() - start_time
    total_ops = stats['reads'] + stats['counts'] + stats['writes'] + stats['updates']
    ops_per_sec = total_ops / total_duration if total_duration > 0 else 0

    print(f"\n✅ SINOV YAKUNLANDI ({total_duration:.2f} soniya):")
    print(f"• Jami bajarilgan amallar: {total_ops} ta ({ops_per_sec:.1f} op/sek)")
    print(f"  - O'qish (SELECT): {stats['reads']} ta")
    print(f"  - Sanash (COUNT): {stats['counts']} ta")
    print(f"  - Yozish (INSERT): {stats['writes']} ta")
    print(f"  - Yangilash (UPDATE): {stats['updates']} ta")
    print(f"• Xatoliklar soni: {len(stats['errors'])} ta")

    if stats['errors']:
        print("Xatoliklar namunalari:")
        for err in stats['errors'][:3]:
            print(f"  ❌ {err}")
    else:
        print("🎉 BIRORTA HAM XATOLIK YO'Q! Baza barcha parallel tranzaksiyalarni muvaffaqiyatli qabul qildi.")

    if stats['latencies']:
        avg_lat = sum(stats['latencies']) / len(stats['latencies'])
        max_lat = max(stats['latencies'])
        print(f"• O'rtacha kechikish: {avg_lat:.2f} ms | Maksimal: {max_lat:.2f} ms")

if __name__ == "__main__":
    run_concurrent_test(num_workers=10, ops_per_worker=25)
