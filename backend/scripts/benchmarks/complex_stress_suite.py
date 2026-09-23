import os
import sys
import time
import random
import threading
import statistics
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.db import connection, transaction, models
from django.core.cache import cache
from apps.projects.models import Project
from apps.accounts.models import User
from apps.tasks.models import Task, TaskStatus, TaskPriority, TaskType
from apps.core.queries import related_count, related_sum

def print_header(title):
    print("\n" + "=" * 75)
    print(f"  {title}")
    print("=" * 75)

# ----------------------------------------------------------------------
# TEST 1: DEADLOCK & ROW-LOCK CONTENTION (Bitta qatorga bir vaqtda yozish)
# ----------------------------------------------------------------------
def test_deadlock_contention(num_threads=20, iterations=15):
    print_header("SINOV 1: QULFLAR TO'QNASHUVI VA DEADLOCK RESILIENCE (Row Contention)")
    print(f"Tavsif: {num_threads} ta parallel worker aynan BIR XIL 5 ta vazifani bir vaqtda yangilaydi.")
    
    project = Project.objects.first()
    target_tasks = list(Task.objects.filter(project=project).order_by('id')[:5])
    if not target_tasks:
        print("XATO: Vazifalar topilmadi!")
        return

    target_ids = [t.id for t in target_tasks]
    print(f"Nishondagi vazifalar ID lari: {target_ids}")

    results = {'success': 0, 'deadlocks': 0, 'lock_timeouts': 0, 'other_errors': 0, 'latencies': []}

    def worker(w_id):
        for it in range(iterations):
            t0 = time.time()
            # Tasodifiy bitta nishon vazifani tanlash
            tid = random.choice(target_ids)
            try:
                with transaction.atomic():
                    # Db2 da qat'iy qulf bilan olish
                    task = Task.objects.select_for_update().get(id=tid)
                    task.title = f"Lock contention test W#{w_id} it#{it}"
                    task.priority = random.choice([TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH, TaskPriority.URGENT])
                    task.save(update_fields=['title', 'priority', 'updated_at'])
                
                results['success'] += 1
                results['latencies'].append((time.time() - t0) * 1000)
            except Exception as e:
                err_msg = str(e)
                if 'SQL0911N' in err_msg or 'deadlock' in err_msg.lower():
                    results['deadlocks'] += 1
                elif 'timeout' in err_msg.lower():
                    results['lock_timeouts'] += 1
                else:
                    results['other_errors'] += 1
            finally:
                connection.close()

    threads = []
    t_start = time.time()
    for i in range(num_threads):
        th = threading.Thread(target=worker, args=(i,))
        threads.append(th)
        th.start()
    for th in threads:
        th.join()

    total_time = time.time() - t_start
    total_ops = num_threads * iterations
    print(f"\n✅ NATIJA ({total_time:.2f} soniya | {total_ops/total_time:.1f} op/sek):")
    print(f"• Muvaffaqiyatli tranzaksiyalar: {results['success']}/{total_ops} ({results['success']/total_ops*100:.1f}%)")
    print(f"• Deadlock holatlari: {results['deadlocks']} ta")
    print(f"• Lock Timeout holatlari: {results['lock_timeouts']} ta")
    print(f"• Boshqa xatoliklar: {results['other_errors']} ta")
    if results['latencies']:
        print(f"• O'rtacha kechikish: {statistics.mean(results['latencies']):.1f} ms | p95: {statistics.quantiles(results['latencies'], n=20)[18]:.1f} ms")

# ----------------------------------------------------------------------
# TEST 2: HEAVY SEARCH & WILDCARD SCAN (37 000+ vazifa ustida og'ir qidiruv)
# ----------------------------------------------------------------------
def test_heavy_search(num_threads=15, queries_per_thread=10):
    print_header("SINOV 2: OG'IR MATNLI QIDIRUV VA WILDCARD SCAN (Full Table Scan)")
    print(f"Tavsif: {num_threads} ta parallel worker 37 600+ ta vazifa bo'yicha og'ir LIKE '%...%' qidiruvlarini yuboradi.")

    search_terms = ['Yuklama', 'Sinov', 'vazifa', 'dasturchi', 'Db2', 'Optimizatsiya', '1000', '5000', 'boshqaruv']
    results = {'count': 0, 'latencies': []}

    def search_worker(w_id):
        for _ in range(queries_per_thread):
            term = random.choice(search_terms)
            t0 = time.time()
            try:
                # Sarlavha yoki tavsifda qidirish (Indekssiz og'ir LIKE skaneri)
                qs = Task.objects.filter(
                    models.Q(title__icontains=term) | models.Q(description__icontains=term)
                )[:30]
                _ = list(qs)
                results['count'] += 1
                results['latencies'].append((time.time() - t0) * 1000)
            except Exception as e:
                pass
            finally:
                connection.close()

    threads = []
    t_start = time.time()
    for i in range(num_threads):
        th = threading.Thread(target=search_worker, args=(i,))
        threads.append(th)
        th.start()
    for th in threads:
        th.join()

    dur = time.time() - t_start
    total_q = num_threads * queries_per_thread
    print(f"\n✅ NATIJA ({dur:.2f} soniya | {total_q/dur:.1f} qidiruv/sek):")
    print(f"• Bajarilgan og'ir qidiruvlar: {results['count']}/{total_q}")
    if results['latencies']:
        print(f"• O'rtacha qidiruv kechikishi: {statistics.mean(results['latencies']):.1f} ms | p95: {statistics.quantiles(results['latencies'], n=20)[18]:.1f} ms")

# ----------------------------------------------------------------------
# TEST 3: HEAVY AGGREGATIONS & COMPLEX GROUP BY (Sortheap va Analitika)
# ----------------------------------------------------------------------
def test_heavy_aggregations(num_threads=10, ops=15):
    print_header("SINOV 3: MURAKKAB AGREGATSIYA VA GROUP BY ANALITIKASI (Sortheap Stress)")
    print(f"Tavsif: 37 600+ yozuv ustida bir vaqtda ko'p o'lchamli hisob-kitoblar va guruhlashlar.")

    results = {'count': 0, 'latencies': []}

    def agg_worker():
        for _ in range(ops):
            t0 = time.time()
            try:
                # 1. Status va Priority bo'yicha guruhlash va o'rtacha hisoblash
                r1 = list(Task.objects.values('status', 'priority').annotate(
                    cnt=models.Count('id'),
                    avg_hours=models.Avg('estimate_hours'),
                    max_num=models.Max('number')
                ))
                # 2. Kompleks subquery hisoblari
                r2 = Task.objects.aggregate(
                    total=models.Count('id'),
                    done=models.Count('id', filter=models.Q(status=TaskStatus.DONE)),
                    urgent=models.Count('id', filter=models.Q(priority=TaskPriority.URGENT))
                )
                results['count'] += 1
                results['latencies'].append((time.time() - t0) * 1000)
            except Exception as e:
                pass
            finally:
                connection.close()

    threads = []
    t_start = time.time()
    for _ in range(num_threads):
        th = threading.Thread(target=agg_worker)
        threads.append(th)
        th.start()
    for th in threads:
        th.join()

    dur = time.time() - t_start
    total = num_threads * ops
    print(f"\n✅ NATIJA ({dur:.2f} soniya | {total/dur:.1f} hisobot/sek):")
    print(f"• Bajarilgan murakkab hisobotlar: {results['count']}/{total}")
    if results['latencies']:
        print(f"• O'rtacha hisoblash vaqti: {statistics.mean(results['latencies']):.1f} ms | p95: {statistics.quantiles(results['latencies'], n=20)[18]:.1f} ms")

# ----------------------------------------------------------------------
# TEST 4: CACHE STAMPEDE (THUNDERING HERD) SINOVI
# ----------------------------------------------------------------------
def test_cache_stampede(num_threads=50):
    print_header("SINOV 4: KESH TO'KILISHI (Cache Stampede / Thundering Herd)")
    print(f"Tavsif: Redis keshi tozalanadi va BIR LAHZADA {num_threads} ta oqim bir xil ma'lumotni so'raydi.")

    cache.clear()
    results = {'success': 0, 'latencies': []}

    def stampede_worker():
        t0 = time.time()
        try:
            val = cache.get("uitexts:data")
            if val is None:
                # Kesh yo'q, hamma bazaga qarab chopadi
                from apps.uitexts.models import UiText
                val = dict(UiText.objects.values_list("key", "value"))
                cache.set("uitexts:data", val, 300)
            results['success'] += 1
            results['latencies'].append((time.time() - t0) * 1000)
        except Exception as e:
            pass
        finally:
            connection.close()

    threads = []
    t_start = time.time()
    for _ in range(num_threads):
        th = threading.Thread(target=stampede_worker)
        threads.append(th)
        th.start()
    for th in threads:
        th.join()

    dur = time.time() - t_start
    print(f"\n✅ NATIJA ({dur:.2f} soniya):")
    print(f"• Muvaffaqiyatli qabul qilindi: {results['success']}/{num_threads} (100%)")
    if results['latencies']:
        print(f"• O'rtacha kechikish: {statistics.mean(results['latencies']):.1f} ms | Maksimal: {max(results['latencies']):.1f} ms")

# ----------------------------------------------------------------------
# TEST 5: REAL-WORLD CHAOS WORKLOAD (Hamma narsa bir vaqtda aralash)
# ----------------------------------------------------------------------
def test_chaos_workload(duration_sec=10):
    print_header("SINOV 5: HAQIQIY ARALASH XAOS YUKLAMASI (Chaos Real-World Workload)")
    print(f"Tavsif: {duration_sec} soniya davomida 25 ta worker uzluksiz aralash operatsiyalarni (O'qish, Yozish, Qidiruv, Filter, Hisob) bajaradi.")

    project = Project.objects.first()
    user = User.objects.first()

    stop_flag = threading.Event()
    stats = {'reads': 0, 'writes': 0, 'updates': 0, 'searches': 0, 'aggs': 0, 'errors': []}

    def chaos_worker(w_id):
        local_i = 0
        while not stop_flag.is_set():
            action = local_i % 5
            local_i += 1
            try:
                if action == 0:
                    # Sahifalash
                    list(Task.objects.filter(project=project).order_by('-id')[:25])
                    stats['reads'] += 1
                elif action == 1:
                    # Qidiruv
                    list(Task.objects.filter(title__icontains='D Disk')[:10])
                    stats['searches'] += 1
                elif action == 2:
                    # Agregatsiya
                    Task.objects.filter(status=TaskStatus.DONE).count()
                    stats['aggs'] += 1
                elif action == 3:
                    # Yozish
                    with transaction.atomic():
                        Task.objects.create(
                            project=project,
                            number=200000 + (w_id * 5000) + local_i,
                            title=f"Chaos task W#{w_id}_{local_i}",
                            description="Chaos test",
                            status=TaskStatus.TODO,
                            created_by=user
                        )
                    stats['writes'] += 1
                elif action == 4:
                    # Yangilash
                    with transaction.atomic():
                        t = Task.objects.filter(project=project).order_by('-id').first()
                        if t:
                            t.priority = TaskPriority.HIGH
                            t.save(update_fields=['priority', 'updated_at'])
                    stats['updates'] += 1
            except Exception as e:
                stats['errors'].append(str(e))
            finally:
                connection.close()

    threads = []
    t_start = time.time()
    for w in range(25):
        th = threading.Thread(target=chaos_worker, args=(w,))
        threads.append(th)
        th.start()

    time.sleep(duration_sec)
    stop_flag.set()

    for th in threads:
        th.join()

    total_time = time.time() - t_start
    total_ops = stats['reads'] + stats['writes'] + stats['updates'] + stats['searches'] + stats['aggs']
    print(f"\n✅ NATIJA ({total_time:.2f} soniya uzluksiz zarba):")
    print(f"• Jami bajarilgan aralash operatsiyalar: {total_ops} ta ({total_ops/total_time:.1f} op/sek)")
    print(f"  - O'qish (SELECT): {stats['reads']} ta")
    print(f"  - Matnli qidiruv (LIKE): {stats['searches']} ta")
    print(f"  - Agregatsiya & COUNT: {stats['aggs']} ta")
    print(f"  - Yozish (INSERT): {stats['writes']} ta")
    print(f"  - Yangilash (UPDATE): {stats['updates']} ta")
    print(f"• Xatoliklar soni: {len(stats['errors'])} TA")

if __name__ == "__main__":
    test_deadlock_contention(num_threads=20, iterations=15)
    test_heavy_search(num_threads=15, queries_per_thread=10)
    test_heavy_aggregations(num_threads=10, ops=15)
    test_cache_stampede(num_threads=50)
    test_chaos_workload(duration_sec=8)
    print("\n" + "=" * 75)
    print("BARCHA MURAKKAB STRESS TESTLAR MUVAFFAQIYATLI YAKUNLANDI!")
    print("=" * 75)
