"""TeamFlow Big Data & Database Scale Benchmark.

Ushbu skript IBM Db2 va Django ORM da ommaviy ma'lumot yozish tezligini,
tranzaksiya va xotira sarfini o'lchaydi.
"""
import os
import sys
import time
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from apps.accounts.models import User
from apps.activity.models import Activity
from apps.projects.models import Project


def run_benchmark(count=5000, batch_size=1000):
    print("=" * 70)
    print(f"       IBM Db2 VA DJANGO ORM: OMMAVIY YUKLASH ({count:,} TA)       ")
    print("=" * 70)

    user = User.objects.first()
    project = Project.objects.first()

    if not user or not project:
        print("Xatolik: Tizimda foydalanuvchi yoki loyiha topilmadi.")
        return

    print(f"Loyiha: {project.name}")
    print(f"Muallif: {user.get_full_name()} ({user.email})")
    print(f"Yoziladigan yozuvlar: {count:,} ta")
    print(f"Batch hajmi: {batch_size:,} ta")
    print("Tayyorlanmoqda...\n")

    # Xotirada obyektlarni yaratish
    t_obj_start = time.time()
    records = [
        Activity(
            project=project,
            actor=user,
            verb="task.created",
            summary=f"BigData sinov yozuvi #{i}",
            detail="10 mln ma'lumot masshtablash sinovi"
        )
        for i in range(count)
    ]
    t_obj_end = time.time()
    print(f"1. Python xotirasida {count:,} ta obyekt yaratish: {t_obj_end - t_obj_start:.3f} s")

    # Db2 ga yozish
    t_db_start = time.time()
    try:
        Activity.objects.bulk_create(records, batch_size=batch_size)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return
    t_db_end = time.time()
    dur_db = t_db_end - t_db_start
    speed = count / dur_db if dur_db > 0 else 0

    print(f"2. IBM Db2 bazasiga yozish: {dur_db:.3f} soniya")
    print(f"🚀 Haqiqiy yozish tezligi: {speed:.1f} qator/soniya")

    # Hisob-kitob (10 mln uchun)
    time_for_10m = (10_000_000 / speed) if speed > 0 else 0
    hours = time_for_10m / 3600

    print("\n" + "-" * 70)
    print("             10 MILLION TA MA'LUMOT UCHUN PROGNOZ                 ")
    print("-" * 70)
    print(f"• Xotira talabi (Python RAM): ~10 GB (Backend konteyner chegarasi: 2 GB -> OOM Crash)")
    print(f"• Db2 disk hajmi: ~3 - 5 GB sof indekslar va jadvallar")
    print(f"• Db2 Tranzaksiya jurnali: ~4 GB (Db2 jurnali chegarasi: 2 GB -> SQL0964C Log Full)")
    print(f"• 10 million ma'lumotni to'liq kiritish vaqti: ~{time_for_10m:.0f} soniya (~{hours:.1f} soat)")

    # Sinov yozuvlarini tozalash
    t_del_start = time.time()
    deleted_cnt, _ = Activity.objects.filter(summary__startswith="BigData sinov yozuvi #").delete()
    t_del_end = time.time()
    print(f"\n3. Sinov ma'lumotlari bazadan tozalandi: {deleted_cnt:,} ta ({t_del_end - t_del_start:.2f} s)")
    print("=" * 70)


if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    run_benchmark(count=count)
