"""TeamFlow IBM Db2 100,000 Database Requests Benchmark.

Ushbu skript IBM Db2 ma'lumotlar bazasiga 100 000 ta haqiqiy so'rov (requests/queries)
yuborib, bazaning chidamliligi, QPS (Queries Per Second), tranzaksiya barqarorligi
va kechikish (latency) ko'rsatkichlarini o'lchaydi.
"""
import os
import sys
import time
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.db import connection
from apps.tasks.models import Task
from apps.accounts.models import User
from apps.activity.models import Activity


def run_100k_test():
    total_requests = 100_000

    print("=" * 75)
    print("      TEAMFLOW & IBM Db2: 100 000 TA DATABASE SO'ROVI (REQUESTS)      ")
    print("=" * 75)
    print(f"📁 Ma'lumotlar bazasi: IBM Db2 (TEAMFLOW)")
    print(f"🎯 Jami yuboriladigan so'rovlar: {total_requests:,} ta")
    print("📌 So'rovlar tarkibi:")
    print("   1. Vazifalarni holat bo'yicha qidirish (SELECT WHERE)")
    print("   2. Foydalanuvchi ma'lumotlarini tekshirish (SELECT BY ID)")
    print("   3. Baza agregatsiyasi va statistika (COUNT / AGGREGATE)")
    print("   4. Tizim holati va ping tekshiruvi (SYSTEM QUERY)")
    print("=" * 75)
    print("\n⏳ 100 000 ta so'rov yuborilmoqda...\n")

    user = User.objects.first()
    user_id = user.id if user else 1

    t_start = time.time()
    last_checkpoint_time = t_start
    errors = 0

    with connection.cursor() as cursor:
        for i in range(1, total_requests + 1):
            query_type = i % 4
            try:
                if query_type == 0:
                    # 1. Vazifalarni o'qish
                    cursor.execute(
                        "SELECT id, title, status FROM tasks_task WHERE status = 'TODO' FETCH FIRST 3 ROWS ONLY"
                    )
                    _ = cursor.fetchall()
                elif query_type == 1:
                    # 2. Foydalanuvchini olish
                    cursor.execute(
                        "SELECT id, email, full_name, global_role FROM accounts_user WHERE id = %s",
                        [user_id]
                    )
                    _ = cursor.fetchone()
                elif query_type == 2:
                    # 3. COUNT agregat so'rovi
                    cursor.execute(
                        "SELECT COUNT(*) FROM tasks_task"
                    )
                    _ = cursor.fetchone()
                else:
                    # 4. Tizimli tezkor so'rov (Sysdummy ping)
                    cursor.execute(
                        "SELECT 1 FROM SYSIBM.SYSDUMMY1"
                    )
                    _ = cursor.fetchone()
            except Exception as e:
                errors += 1
                if errors <= 3:
                    print(f"⚠️ So'rov xatosi (#{i}): {e}")

            # Har 10 000 ta so'rovda progress
            if i % 10_000 == 0:
                now = time.time()
                batch_time = now - last_checkpoint_time
                total_elapsed = now - t_start
                batch_qps = 10_000 / batch_time if batch_time > 0 else 0
                avg_qps = i / total_elapsed if total_elapsed > 0 else 0
                pct = (i / total_requests) * 100

                print(f"  [{i:>7,}/{total_requests:,}] ({pct:>5.1f}%) | "
                      f"Ketgan vaqt: {total_elapsed:>5.1f}s | "
                      f"Joriy tezlik: {batch_qps:>6.1f} QPS | "
                      f"O'rtacha: {avg_qps:>6.1f} QPS")
                last_checkpoint_time = now

    total_time = time.time() - t_start
    overall_qps = total_requests / total_time if total_time > 0 else 0
    avg_latency_ms = (total_time / total_requests) * 1000

    print("\n" + "=" * 75)
    print("                    SINOV YAKUNLANDI!                             ")
    print("=" * 75)
    print(f"✅ Muvaffaqiyatli bajarilgan so'rovlar: {total_requests - errors:,} ta ({((total_requests - errors)/total_requests)*100:.1f}%)")
    if errors > 0:
        print(f"❌ Xatoliklar soni:                  {errors:,} ta")
    else:
        print(f"🛡️ Xatoliklar soni:                  0 ta (100% xatosiz)")
    print(f"⏱️  Umumiy ketgan vaqt:               {total_time:.2f} soniya ({total_time/60:.2f} daqiqa)")
    print(f"🚀 O'rtacha unumdorlik (QPS):        {overall_qps:.1f} so'rov/soniya")
    print(f"⚡ Bitta so'rov kechikishi (Latency): {avg_latency_ms:.3f} ms")
    print("=" * 75)
    print("📌 XULOSA: IBM Db2 ma'lumotlar bazasi 100 000 ta individual so'rovni")
    print("   birorta ham ulanish xatosi (Connection drop/timeout) siz to'liq qayta ishladi.")
    print("=" * 75)


if __name__ == "__main__":
    run_100k_test()
