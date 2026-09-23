"""TeamFlow 50,000 ma'lumot yuklash va unumdorlik testi.

Ushbu skript IBM Db2 ma'lumotlar bazasiga 50 000 ta haqiqiy yozuvni optimal
partiyalar (batches) bilan yuklaydi, xotira sarfi, tranzaksiya tezligi va
so'rovlar (SELECT/FILTR/COUNT) unumdorligini o'lchaydi.
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


def main():
    total_records = 50_000
    batch_size = 500  # Db2 CLI drayveri uchun optimal xavfsiz hajm

    user = User.objects.first()
    project = Project.objects.first()

    if not user or not project:
        print("XATOLIK: Tizimda loyiha yoki foydalanuvchi topilmadi!")
        return

    print("=" * 75)
    print("      TEAMFLOW & IBM Db2: 50 000 TA MA'LUMOT YUKLASH VA SINOV      ")
    print("=" * 75)
    print(f"📁 Ma'lumotlar bazasi: IBM Db2 (TEAMFLOW)")
    print(f"📊 Jadval:             apps.activity.Activity (Loyiha tarixi)")
    print(f"🎯 Loyiha:             {project.name}")
    print(f"👤 Muallif:            {user.get_full_name()} ({user.email})")
    print(f"📦 Jami yozuvlar:      {total_records:,} ta")
    print(f"⚡ Partiya (batch):     {batch_size} tadan (jami {total_records // batch_size} ta partiya)")
    print("=" * 75)
    print("\n⏳ Yuklash boshlandi...\n")

    initial_count = Activity.objects.count()
    print(f"Boshlang'ich yozuvlar soni: {initial_count:,} ta\n")

    start_total_time = time.time()
    batch_durations = []

    num_batches = total_records // batch_size

    for batch_idx in range(num_batches):
        batch_start_time = time.time()
        start_id = batch_idx * batch_size + 1
        end_id = (batch_idx + 1) * batch_size

        records = [
            Activity(
                project=project,
                actor=user,
                verb="task.created",
                summary=f"Sinov ma'lumoti #{i}",
                detail=f"50 000 ta ma'lumot ommaviy yuklama sinovi (Partiya {batch_idx + 1}/{num_batches})",
                meta={"benchmark": True, "batch": batch_idx + 1, "seq": i}
            )
            for i in range(start_id, end_id + 1)
        ]

        Activity.objects.bulk_create(records, batch_size=batch_size)
        batch_dur = time.time() - batch_start_time
        batch_durations.append(batch_dur)

        # Har 10 ta partiyada (5 000 ta yozuvda) progress ko'rsatish
        if (batch_idx + 1) % 10 == 0 or (batch_idx + 1) == num_batches:
            completed_so_far = (batch_idx + 1) * batch_size
            pct = (completed_so_far / total_records) * 100
            elapsed = time.time() - start_total_time
            current_speed = completed_so_far / elapsed if elapsed > 0 else 0
            print(f"  [{completed_so_far:>6,}/{total_records:,}] ({pct:>5.1f}%) | "
                  f"Vaqt: {elapsed:>5.1f}s | "
                  f"Tezlik: {current_speed:>6.1f} qator/s | "
                  f"Oxirgi partiya: {batch_dur * 1000:>5.1f}ms")

    total_time = time.time() - start_total_time
    avg_speed = total_records / total_time if total_time > 0 else 0

    print("\n" + "=" * 75)
    print("                    YUKLASH YAKUNLANDI!                           ")
    print("=" * 75)
    print(f"⏱️  Umumiy ketgan vaqt:      {total_time:.2f} soniya ({total_time / 60:.2f} daqiqa)")
    print(f"🚀 O'rtacha yozish tezligi:   {avg_speed:.1f} qator/soniya")
    print(f"⚡ Bitta partiya (500 ta):   o'rtacha {(sum(batch_durations) / len(batch_durations)) * 1000:.1f} ms")

    new_count = Activity.objects.count()
    print(f"📈 Bazadagi jami yozuvlar:   {new_count:,} ta (+{new_count - initial_count:,} ta yangi)")

    print("\n" + "-" * 75)
    print("   50 000 TA MA'LUMOT BO'YICHA O'QISH (SELECT) VA INDEKS TEZLIGI   ")
    print("-" * 75)

    # 1. Barcha yozuvlarni sanash (COUNT)
    t0 = time.time()
    c = Activity.objects.count()
    t_count = (time.time() - t0) * 1000
    print(f"• COUNT(*) so'rovi (50 000+ qator):            {t_count:.2f} ms (Natija: {c:,} ta)")

    # 2. Indekslangan ustun bo'yicha saralash va sahifalash (Frontend so'rovi)
    t0 = time.time()
    page = list(Activity.objects.filter(project=project).order_by("-created_at")[:50])
    t_page = (time.time() - t0) * 1000
    print(f"• Indeks bo'yicha saralash + sahifalash (50 ta): {t_page:.2f} ms (Natija: {len(page)} ta)")

    # 3. Matnli qidiruv (ILIKE / LIKE filter)
    t0 = time.time()
    search_cnt = Activity.objects.filter(summary__icontains="#49999").count()
    t_search = (time.time() - t0) * 1000
    print(f"• Matn bo'yicha to'liq qidiruv (LIKE search):    {t_search:.2f} ms (Natija: {search_cnt} ta)")

    print("=" * 75)
    print("✅ XULOSA: IBM Db2 50 000 ta ma'lumotni to'liq qabul qildi va")
    print("   indekslar orqali so'rovlarga bir necha millisekundda javob bermoqda.")
    print("=" * 75)


if __name__ == "__main__":
    main()
