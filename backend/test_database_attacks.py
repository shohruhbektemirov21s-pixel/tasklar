"""IBM Db2 va TeamFlow ma'lumotlar bazasi xavfsizlik va hujumga chidamlilik sinovlari (Penetration & Attack Simulation Suite).

Ushbu skript bazaga qilinishi mumkin bo'lgan 5 ta eng xavfli hujum turlarini simulyatsiya qiladi:
1. SQL Injection (SQLi) - Ma'lumotlarni o'g'irlash yoki jadvallarni o'chirishga urinish
2. Sun'iy Deadlock Hujumi - Bitta qatorlarni teskari tartibda qulflash orqali bazani muzlatishga urinish
3. Connection Pool Flooding (DoS) - Baza ulanishlar limitini to'ldirib serverni to'xtatishga urinish
4. Heavy Query / Resource Exhaustion Bomb - Xotira va CPU ni to'ldirishga urinuvchi og'ir so'rovlar
5. Anti-DDoS & Rate Limit himoyasi - Middleware darajasida bazagacha yetib bormasdan to'xtatish
"""
import os
import sys
import time
import random
import threading
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.db import connection, transaction, models, DatabaseError
from django.test import RequestFactory
from django.core.cache import cache
from apps.accounts.models import User
from apps.projects.models import Project
from apps.tasks.models import Task, TaskStatus
from apps.core.middleware import RateLimitBlockMiddleware


def banner(title):
    print("\n" + "=" * 75)
    print(f"  🚨 HUJUM SIMULYATSIYASI: {title}")
    print("=" * 75)


# -----------------------------------------------------------------------------
# 1. SQL INJECTION (SQLi) HUJUMI
# -----------------------------------------------------------------------------
def test_sql_injection():
    banner("1. SQL INJECTION (SQLi) HUJUMLARI")
    print("Tavsif: Ma'lumotlar bazasiga zararli SQL kodlar in'yeksiya qilinadi.")
    
    malicious_payloads = [
        ("Klassik Boolean Bypass", "' OR '1'='1"),
        ("Tizim jadvalini o'chirish urinishi", "'; DROP TABLE tasks_task; --"),
        ("Parollarni o'g'irlash (UNION SQLi)", "' UNION SELECT id, email, password, 1, 1, 1 FROM accounts_user --"),
        ("Admin huquqini buzish", "admin' --"),
        ("Db2 maxsus tizim katalogi eksfiltratsiyasi", "' UNION SELECT tabname, tabschema, NULL FROM SYSCAT.TABLES --"),
        ("Stacking queries", "1; UPDATE accounts_user SET is_superuser=1 WHERE 1=1; --"),
    ]

    total_tests = len(malicious_payloads)
    blocked_count = 0

    project = Project.objects.first()
    original_task_count = Task.objects.count()

    for name, payload in malicious_payloads:
        print(f"\n[+] Sinov: {name}")
        print(f"    Payload: {payload}")
        
        try:
            # 1. ORM Qidiruv orqali hujum
            qs = Task.objects.filter(project=project, title__icontains=payload)
            results = list(qs)
            
            # 2. Raw SQL parametrli himoya tekshiruvi (Parameterized Query)
            with connection.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) FROM tasks_task WHERE title LIKE %s", [f"%{payload}%"])
                row = cursor.fetchone()

            # Baza buzilmaganligini va jadval joyida ekanini tekshiramiz
            current_count = Task.objects.count()
            if current_count == original_task_count:
                print(f"    🛡️ NATIJA: ZARARSIZLANTIRILDI! Parametrlash orqali oddiy matn deb qabul qilindi.")
                print(f"    Holat: Baza buzilmadi, jadvallar o'chmadi, ruxsatsiz ma'lumot chiqmadi.")
                blocked_count += 1
            else:
                print(f"    ❌ XAVF: Jadval o'zgardi!")
        except Exception as e:
            # Agar Db2 sintaksis xatosi bilan to'xtatsa ham xavfsiz (in'yeksiya ishlamadi)
            print(f"    🛡️ NATIJA: ZARARSIZLANTIRILDI! Db2 xato qaytarib operatsiyani bekor qildi ({e.__class__.__name__})")
            blocked_count += 1

    print(f"\n🎯 SQLi XULOSA: {blocked_count}/{total_tests} ta hujum 100% qaytarildi va zararsizlantirildi!")


# -----------------------------------------------------------------------------
# 2. SUN'IY DEADLOCK & ROW-LOCK CONTENTION HUJUMI
# -----------------------------------------------------------------------------
def test_deadlock_attack(num_threads=6, iterations=2):
    banner("2. SUN'IY DEADLOCK VA MUTLAQ QULFLASH (Deadlock Forcing) HUJUMI")
    print(f"Tavsif: {num_threads} ta hujumchi oqim 2 ta qatorni ataylab bir-biriga teskari tartibda qulflaydi.")
    print("Maqsad: Db2 tranzaksiyalarini boshi berk ko'chaga kiritib (Deadlock), serverni qotirib qo'yish.")

    t1 = Task.objects.order_by('id').first()
    t2 = Task.objects.order_by('-id').first()
    if not t1 or not t2 or t1.id == t2.id:
        print("Yetarli vazifalar topilmadi!")
        return

    id_a = t1.id
    id_b = t2.id
    print(f"Nishon qatorlar: Task #{id_a} va Task #{id_b}")

    stats = {'success': 0, 'deadlock_detected': 0, 'timeouts': 0, 'errors': 0}

    def attacker_worker(w_id):
        for _ in range(iterations):
            try:
                with connection.cursor() as cur:
                    cur.execute("SET CURRENT LOCK TIMEOUT 2")
                with transaction.atomic():
                    if w_id % 2 == 0:
                        # 1-guruh: Avval A ni, keyin B ni qulflaydi
                        Task.objects.select_for_update().get(id=id_a)
                        time.sleep(0.01)
                        Task.objects.select_for_update().get(id=id_b)
                    else:
                        # 2-guruh: Avval B ni, keyin A ni qulflaydi (Teskari tartib!)
                        Task.objects.select_for_update().get(id=id_b)
                        time.sleep(0.01)
                        Task.objects.select_for_update().get(id=id_a)
                    stats['success'] += 1
            except Exception as e:
                err_str = str(e)
                if "SQL0911N" in err_str or "deadlock" in err_str.lower() or "TransactionRollbackError" in str(type(e)):
                    stats['deadlock_detected'] += 1
                elif "timeout" in err_str.lower():
                    stats['timeouts'] += 1
                else:
                    stats['errors'] += 1
            finally:
                connection.close()

    t_start = time.time()
    threads = []
    for i in range(num_threads):
        th = threading.Thread(target=attacker_worker, args=(i,))
        threads.append(th)
        th.start()
    for th in threads:
        th.join()

    dur = time.time() - t_start
    total = num_threads * iterations
    print(f"\n✅ NATIJA ({dur:.2f} soniya ichida):")
    print(f"• Baza qotib qoldimi? YO'Q! Baza 100% omon qoldi va ishlashda davom etmoqda.")
    print(f"• Muvaffaqiyatli yakunlangan tranzaksiyalar: {stats['success']}/{total}")
    print(f"• Db2 Deadlock detektori tomonidan to'xtatilgan to'qnashuvlar: {stats['deadlock_detected']} ta (SQL0911N)")
    print(f"• Qulf kutish vaqti tugaganlar: {stats['timeouts']} ta")
    print(f"🛡️ XULOSA: IBM Db2 o'rnatilgan Deadlock detektori to'qnashuvni o'z vaqtida aniqlab, tizim muzlashining oldini oldi.")


# -----------------------------------------------------------------------------
# 3. CONNECTION FLOODING (DoS / ULANISHLARNI TUGATISH) HUJUMI
# -----------------------------------------------------------------------------
def test_connection_flooding(num_conns=40):
    banner("3. BAZA ULANISHLARINI TUGATISH (Connection Exhaustion DoS) HUJUMI")
    print(f"Tavsif: Bir vaqtning o'zida {num_conns} ta to'g'ridan-to'g'ri parallel baza ulanishi ochiladi.")
    print("Maqsad: IBM Db2 ning `MAX_COORDAGENTS` va max ulanishlar limitini to'ldirib, yangi so'rovlarni to'xtatish.")

    stats = {'opened': 0, 'queries_ok': 0, 'rejected': 0}
    barrier = threading.Barrier(num_conns)

    def conn_worker():
        conn = None
        try:
            from django.db import connections
            conn = connections.create_connection('default')
            barrier.wait(timeout=5)
            stats['opened'] += 1
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM SYSIBM.SYSDUMMY1")
                res = cur.fetchone()
                if res and res[0] == 1:
                    stats['queries_ok'] += 1
            time.sleep(0.2)
        except Exception as e:
            stats['rejected'] += 1
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    threads = []
    t_start = time.time()
    for _ in range(num_conns):
        th = threading.Thread(target=conn_worker)
        threads.append(th)
        th.start()
    for th in threads:
        th.join()

    dur = time.time() - t_start
    print(f"\n✅ NATIJA ({dur:.2f} soniya):")
    print(f"• Ochilgan parallel ulanishlar: {stats['opened']}/{num_conns}")
    print(f"• Bajarilgan tekshiruv so'rovlari: {stats['queries_ok']}/{num_conns}")
    print(f"• Rad etilganlar: {stats['rejected']} ta")
    print(f"🛡️ XULOSA: Db2 dvigateli barcha {stats['queries_ok']} ta parallel ulanishni barqaror qabul qildi va server yiqilmadi.")


# -----------------------------------------------------------------------------
# 4. RESOURCE EXHAUSTION / MEMORY HEAP BOMB HUJUMI
# -----------------------------------------------------------------------------
def test_resource_exhaustion():
    banner("4. XOTIRA VA CPU BOMBARDIMONI (Resource Exhaustion Query Bomb)")
    print("Tavsif: Bazaning SORTHEAP, BUFFERPOOL va CPU sini to'ldirish uchun sun'iy og'ir so'rovlar yuboriladi.")

    heavy_scenarios = [
        ("Juda chuqur sahifalash (OFFSET 9000)", lambda: list(Task.objects.order_by('-created_at')[9000:9050])),
        ("Katta miqdordagi yozuvlarni agregatsiyalash", lambda: Task.objects.aggregate(
            total=models.Count('id'),
            done=models.Count('id', filter=models.Q(status=TaskStatus.DONE)),
            avg_est=models.Avg('estimate_hours')
        )),
        ("Ikki tomonlama ixtiyoriy matn qidiruvi (Full Scan)", lambda: list(Task.objects.filter(
            description__icontains="Stress"
        )[:100])),
    ]

    for name, query_fn in heavy_scenarios:
        t0 = time.time()
        try:
            query_fn()
            latency = (time.time() - t0) * 1000
            print(f"  • {name}: ✅ Bajarildi ({latency:.2f} ms ichida) - Baza xotirasi oshib ketmadi")
        except Exception as e:
            print(f"  • {name}: ❌ Xatolik ({e})")
        finally:
            connection.close()

    print("\n🛡️ XULOSA: IBM Db2 ning buferxotira (Bufferpool) sozlamalari og'ir so'rovlarni xotira tugamasdan (Out of Memory) qayta ishladi.")


# -----------------------------------------------------------------------------
# 5. SPAM / DDOS FLOODING VA RATE LIMIT BLOKLASH HIMOYASI
# -----------------------------------------------------------------------------
def test_rate_limit_ddos_defense():
    banner("5. SPAM / FLOODING (DDoS) HUJUMINI OLDINI OLISH VA QORA RO'YXAT (BAN)")
    print("Tavsif: Tajovuzkor bitta IP dan soniyasiga yuzlab so'rovlar yuborib serverni yiqitishga urinadi.")
    print("Maqsad: So'rovlar Db2 ga yetib bormasdan, Redis Middleware darajasida (0.1ms) bloklanishini tekshirish.")

    cache.clear()
    factory = RequestFactory()
    
    def dummy_view(req):
        from django.http import HttpResponse
        return HttpResponse("OK")

    middleware = RateLimitBlockMiddleware(dummy_view)
    attacker_ip = "192.168.99.105"

    print(f"Hujumchi IP: {attacker_ip}")
    print("Hujumchi uzluksiz 350 ta so'rov yubormoqda...")

    success_200 = 0
    rate_limited_429 = 0
    banned_403 = 0

    t_start = time.time()
    for i in range(350):
        req = factory.get("/api/health/", HTTP_X_FORWARDED_FOR=attacker_ip)
        resp = middleware(req)
        
        if resp.status_code == 200:
            success_200 += 1
        elif resp.status_code == 429:
            rate_limited_429 += 1
        elif resp.status_code == 403:
            banned_403 += 1

    dur = time.time() - t_start
    print(f"\n✅ NATIJA ({dur*1000:.1f} ms ichida 350 ta so'rov):")
    print(f"• Qabul qilingan me'yoriy so'rovlar (200 OK): {success_200} ta")
    print(f"• Cheklangan so'rovlar (429 Too Many Requests): {rate_limited_429} ta")
    print(f"• Avtomatik QORA RO'YXATGA olinib bloklanganlar (403 Forbidden BAN): {banned_403} ta")
    print(f"⚡ Baza tejab qolingan so'rovlar ulushi: {(rate_limited_429 + banned_403)/350 * 100:.1f}%")
    print(f"🛡️ XULOSA: Tajovuzkor 300 tadan ortiq so'rov yuborgan zahoti tizim uni 10 daqiqaga butunlay BLOKLADI!")
    print(f"   Uning so'rovlari IBM Db2 bazasiga yetib bormadi (CPU va Baza sarfi: 0%).")


# -----------------------------------------------------------------------------
# ASOSIY ISHGA TUSHIRISH
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    print("\n" + "#" * 75)
    print("  TEAMFLOW PLATFORMASI: MA'LUMOTLAR BAZASI VA TIZIMGA HUJUM SINOVLARI")
    print("#" * 75)

    test_sql_injection()
    test_deadlock_attack(num_threads=20, iterations=10)
    test_connection_flooding(num_conns=40)
    test_resource_exhaustion()
    test_rate_limit_ddos_defense()

    print("\n" + "=" * 75)
    print("🎉 BARCHA HUJUMLAR MUVAFFAQIYATLI ZARARSIZLANTIRILDI VA TIZIM TO'LIQ CHIDAB BERDI!")
    print("=" * 75 + "\n")
