"""IP manzilni qo'lda bloklash yoki bloklanganlarni ko'rish buyrug'i.

    python manage.py block_ip 192.168.1.50 --minutes 60 --reason "DoS hujumi"
    python manage.py block_ip --list
"""
import time
from django.core.cache import cache
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "IP manzilni bloklash yoki barcha bloklangan IP manzillarni ko'rish"

    def add_arguments(self, parser):
        parser.add_argument("ip", nargs="?", type=str, help="Bloklanadigan IP manzil")
        parser.add_argument("--minutes", type=int, default=10, help="Bloklash muddati (daqiqa, standarti: 10)")
        parser.add_argument("--reason", type=str, default="manual_ban", help="Bloklash sababi")
        parser.add_argument("--list", action="store_true", help="Barcha bloklangan IP larni ko'rsatish")

    def handle(self, *args, **options):
        if options["list"]:
            self.stdout.write("Bloklangan IP manzillar tekshirilmoqda...")
            # Redis dan 'ratelimit:ban:*' kalitlarini qidirish
            try:
                import redis
                from django.conf import settings
                r = redis.from_url(settings.REDIS_CACHE_URL)
                keys = r.keys("*:ratelimit:ban:*") or r.keys("ratelimit:ban:*")
                if not keys:
                    self.stdout.write(self.style.SUCCESS("Hozircha hech qanday IP bloklanmagan."))
                    return
                self.stdout.write(self.style.WARNING(f"Jami bloklangan IP lar: {len(keys)} ta"))
                for k in keys:
                    ttl = r.ttl(k)
                    k_str = k.decode() if isinstance(k, bytes) else str(k)
                    ip = k_str.split(":")[-1]
                    self.stdout.write(f" - IP: {ip} | Qolgan vaqt: {ttl} soniya")
            except Exception as e:
                self.stderr.write(f"Redis ulanishida xatolik: {e}")
            return

        ip = options["ip"]
        if not ip:
            self.stderr.write("Iltimos, IP manzilni ko'rsating yoki --list parametrini bering.")
            return

        minutes = options["minutes"]
        ban_seconds = minutes * 60
        ban_key = f"ratelimit:ban:{ip}"
        cache.set(
            ban_key,
            {"banned_at": time.time(), "reason": options["reason"], "manual": True},
            timeout=ban_seconds,
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"✅ IP {ip} muvaffaqiyatli BLOKLANDI! Muddati: {minutes} daqiqa ({ban_seconds}s). Sabab: {options['reason']}"
            )
        )
