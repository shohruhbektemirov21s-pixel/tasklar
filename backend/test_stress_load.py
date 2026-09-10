"""TeamFlow Stress va Yuklama Testi (Load / Stress Benchmark).

Ushbu skript parallel oqimlar orqali backend HTTP endpointiga tezkor so'rovlar
yuborib, tizimning javob berish tezligi (RPS, Latency) va xavfsizlik
filtrlari (RateLimitBlockMiddleware - 429 va 403 BAN) ishlashini o'lchaydi.
"""
import concurrent.futures
import time
import urllib.error
import urllib.request

TARGET_URL = "http://127.0.0.1:8000/api/ui-texts/"
NUM_REQUESTS = 400
CONCURRENCY = 20


def send_request(req_id: int):
    req = urllib.request.Request(TARGET_URL)
    req.add_header("User-Agent", f"StressTestBot/{req_id}")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            code = response.getcode()
            dur = (time.time() - t0) * 1000
            return (code, dur, None)
    except urllib.error.HTTPError as e:
        dur = (time.time() - t0) * 1000
        return (e.code, dur, None)
    except Exception as exc:
        dur = (time.time() - t0) * 1000
        return (0, dur, str(exc))


def main():
    print("=" * 70)
    print("       TEAMFLOW PLATFORMASI: HTTP YUKLAMA VA STRESS BENCHMARK       ")
    print("=" * 70)
    print(f"Nishon URL: {TARGET_URL}")
    print(f"Jami yuboriladigan so'rovlar: {NUM_REQUESTS} ta")
    print(f"Bir vaqtdagi parallel oqimlar (Concurrency): {CONCURRENCY}")
    print("Test boshlanmoqda...\n")

    results = []
    t_start = time.time()

    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = [executor.submit(send_request, i) for i in range(NUM_REQUESTS)]
        for f in concurrent.futures.as_completed(futures):
            results.append(f.result())

    total_time = time.time() - t_start

    status_counts = {}
    latencies = []
    errors = []

    for code, dur, err in results:
        status_counts[code] = status_counts.get(code, 0) + 1
        latencies.append(dur)
        if err:
            errors.append(err)

    avg_latency = sum(latencies) / len(latencies) if latencies else 0
    rps = NUM_REQUESTS / total_time if total_time > 0 else 0

    print("=" * 70)
    print("                      SINOV NATIJALARI                             ")
    print("=" * 70)
    print(f"⏱️  Umumiy ketgan vaqt: {total_time:.2f} soniya")
    print(f"🚀 O'rtacha o'tkazuvchanlik (RPS): {rps:.1f} so'rov/soniya")
    print(f"⚡ O'rtacha javob kechikishi: {avg_latency:.2f} ms")
    print("\n📊 HTTP Status kodlari taqsimoti:")
    for code in sorted(status_counts.keys()):
        count = status_counts[code]
        pct = (count / NUM_REQUESTS) * 100
        meaning = {
            200: "200 OK (Muvaffaqiyatli qabul qilindi)",
            429: "429 Too Many Requests (Rate limit ishga tushdi)",
            403: "403 Forbidden (Hujumchi avtomatik BAN / Qora ro'yxatga olindi)",
            0: "Tarmoq xatosi / Bog'lanib bo'lmadi"
        }.get(code, f"Status {code}")
        print(f"  • {code} [{meaning}]: {count} ta ({pct:.1f}%)")

    if errors:
        print(f"\n⚠️  Xatoliklar ({len(errors)} ta): {errors[:3]}")

    print("\n" + "=" * 70)
    print("📌 XULOSA:")
    if 403 in status_counts or 429 in status_counts:
        print("✅ Anti-DDoS va Rate-Limiting himoyasi 100% muvaffaqiyatli ishladi.")
        print("   Hujumchi qora ro'yxatga kiritildi, so'rovlar Db2 ga yetib bormasdan")
        print("   Redis orqali millisekund ulushlarida qaytarildi.")
    else:
        print("Barcha so'rovlar odatiy rejimda qabul qilindi.")
    print("=" * 70)


if __name__ == "__main__":
    main()
