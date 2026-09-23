"""TeamFlow To'liq Foydalanuvchi Yo'lagi va Barcha Sahifalar Yuklama Testi.

Har bir virtual foydalanuvchi tizimga kirib, quyidagi 12 ta asosiy sahifa
va bo'limlarning har biriga ketma-ket tashrif buyuradi va ma'lumotlarni o'qiydi:
1. Bosh panel (Dashboard)
2. Mening ishim (My Work)
3. Yon panel statistikasi (Sidebar Counts)
4. Loyihalar ro'yxati (Projects)
5. Vazifalar va doska (Tasks)
6. Loyiha faolligi va tarixi (Activity)
7. Bildirishnomalar (Notifications)
8. Jamoa takliflari (Suggestions)
9. Xodimlar so'rovlari (Inquiries)
10. Axborot tizimi buyurtmalari (Orders)
11. Ish maydonlari (Workspaces)
12. Interfeys matnlari va sozlamalar (UI Texts)
"""
import os
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.test import Client
from apps.accounts.models import User

PAGES = [
    ("1. Bosh panel (Dashboard)", "/api/dashboard/"),
    ("2. Mening ishim (My Work)", "/api/my-work/"),
    ("3. Statistika (Counts)", "/api/counts/"),
    ("4. Loyihalar (Projects)", "/api/projects/"),
    ("5. Vazifalar (Tasks)", "/api/tasks/"),
    ("6. Tarix (Activity)", "/api/activity/"),
    ("7. Bildirishnomalar", "/api/notifications/"),
    ("8. Takliflar (Suggestions)", "/api/suggestions/"),
    ("9. So'rovlar (Inquiries)", "/api/inquiries/"),
    ("10. Buyurtmalar (Orders)", "/api/orders/"),
    ("11. Ish maydonlari", "/api/workspaces/"),
    ("12. UI Matnlari", "/api/ui-texts/"),
]


def simulate_single_user_journey(user_id: int):
    """Bitta foydalanuvchining barcha 12 ta sahifani aylanib chiqishi."""
    client = Client(HTTP_HOST="localhost")
    user = User.objects.get(id=user_id)
    client.force_login(user)

    page_results = []
    # Virtual foydalanuvchi har bir sahifaga kiradi
    for page_name, url in PAGES:
        t0 = time.time()
        resp = client.get(url, HTTP_X_FORWARDED_FOR=f"10.0.{user_id % 250}.{(user_id * 3) % 250}")
        dur = (time.time() - t0) * 1000
        page_results.append((page_name, resp.status_code, dur))

    return page_results


def run_journey_benchmark(num_users=500, concurrency=10):
    users = list(User.objects.all()[:10])
    if not users:
        print("Xatolik: Tizimda foydalanuvchilar yo'q!")
        return

    total_page_views = num_users * len(PAGES)
    print("=" * 80)
    print("        TEAMFLOW: BARCHA SAHIFALAR BO'YICHA FOYDALANUVCHI OQIMI        ")
    print("=" * 80)
    print(f"👥 Simulyatsiya qilinayotgan foydalanuvchilar: {num_users:,} ta")
    print(f"📄 Har bir foydalanuvchi ko'radigan sahifalar:  {len(PAGES)} ta")
    print(f"🌐 Jami bajariladigan sahifa so'rovlari:       {total_page_views:,} ta")
    print(f"⚡ Bir vaqtdagi parallel oqimlar (Workers):     {concurrency} ta")
    print("=" * 80)
    print("\n⏳ Foydalanuvchilar barcha sahifalarga kirishni boshlamoqda...\n")

    page_stats = defaultdict(lambda: {"count": 0, "status_200": 0, "errors": 0, "latencies": []})
    t_start = time.time()

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        # Har bir foydalanuvchi barcha sahifalarni ketma-ket ko'radi
        user_ids = [users[i % len(users)].id for i in range(num_users)]
        futures = [executor.submit(simulate_single_user_journey, uid) for uid in user_ids]

        done_users = 0
        for f in futures:
            results = f.result()
            done_users += 1
            for page_name, status, dur in results:
                page_stats[page_name]["count"] += 1
                if status == 200:
                    page_stats[page_name]["status_200"] += 1
                else:
                    page_stats[page_name]["errors"] += 1
                page_stats[page_name]["latencies"].append(dur)

            if done_users % 50 == 0 or done_users == num_users:
                elapsed = time.time() - t_start
                pct = (done_users / num_users) * 100
                reqs_so_far = done_users * len(PAGES)
                speed = reqs_so_far / elapsed if elapsed > 0 else 0
                print(f"  [{done_users:>5,}/{num_users:,} user] ({pct:>5.1f}%) | "
                      f"Vaqt: {elapsed:>5.1f}s | "
                      f"Sahifalar: {reqs_so_far:>6,} ta | "
                      f"Tezlik: {speed:>6.1f} sahifa/s")

    total_time = time.time() - t_start
    overall_speed = total_page_views / total_time if total_time > 0 else 0

    print("\n" + "=" * 80)
    print("              HAR BIR SAHIFA BO'YICHA UNUMDORLIK NATIJALARI            ")
    print("=" * 80)
    print(f"{'Sahifa / Bo\'lim':<32} | {'So\'rov':<7} | {'Muvaffaq':<8} | {'O\'rtacha':<9} | {'Min':<7} | {'Max':<7}")
    print("-" * 80)

    for page_name, _ in PAGES:
        st = page_stats[page_name]
        lats = st["latencies"]
        avg_l = sum(lats) / len(lats) if lats else 0
        min_l = min(lats) if lats else 0
        max_l = max(lats) if lats else 0
        success_pct = (st["status_200"] / st["count"]) * 100 if st["count"] > 0 else 0
        print(f"{page_name:<32} | {st['count']:>7,} | {success_pct:>7.1f}% | {avg_l:>7.2f}ms | {min_l:>5.1f}ms | {max_l:>5.1f}ms")

    print("=" * 80)
    print(f"⏱️  Umumiy ketgan vaqt:          {total_time:.2f} soniya ({total_time/60:.2f} daqiqa)")
    print(f"🚀 O'rtacha o'tkazuvchanlik:      {overall_speed:.1f} sahifa so'rovi / soniya")
    print("=" * 80)

    # 100,000 foydalanuvchi hisobi
    time_100k = (100_000 * len(PAGES)) / overall_speed if overall_speed > 0 else 0
    print("\n" + "#" * 80)
    print("          100 000 TA FOYDALANUVCHI BO'YICHA PROGNOZ VA TAHLIL          ")
    print("#" * 80)
    print(f"• Jami sahifalar ko'rish soni:     1,200,000 ta sahifa (Page Views)")
    print(f"• Bitta mashinada ketadigan vaqt: ~{time_100k:.0f} soniya (~{time_100k/3600:.1f} soat)")
    print(f"• Tavsiya etilgan arxitektura:    Kubernetes (5-10 Pods) + Nginx Load Balancer + Redis Cache")
    print("#" * 80)


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 300
    run_journey_benchmark(num_users=n, concurrency=10)
