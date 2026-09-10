"""IP manzilni blokdan chiqarish buyrug'i.

    python manage.py unblock_ip 192.168.1.50
    python manage.py unblock_ip --all
"""
from django.core.cache import cache
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Bloklangan IP manzilni cheklovdan chiqarish"

    def add_arguments(self, parser):
        parser.add_argument("ip", nargs="?", type=str, help="Blokdan chiqariladigan IP manzil")
        parser.add_argument("--all", action="store_true", help="Barcha bloklangan IP larni ochish")

    def handle(self, *args, **options):
        if options["all"]:
            try:
                import redis
                from django.conf import settings
                r = redis.from_url(settings.REDIS_CACHE_URL)
                keys = r.keys("*:ratelimit:ban:*") or r.keys("ratelimit:ban:*")
                if not keys:
                    self.stdout.write(self.style.SUCCESS("Ochish uchun bloklangan IP lar topilmadi."))
                    return
                r.delete(*keys)
                self.stdout.write(self.style.SUCCESS(f"✅ Barcha ({len(keys)} ta) IP manzillar blokdan chiqarildi!"))
            except Exception as e:
                self.stderr.write(f"Xatolik yuz berdi: {e}")
            return

        ip = options["ip"]
        if not ip:
            self.stderr.write("Iltimos, IP manzilni ko'rsating yoki --all bering.")
            return

        ban_key = f"ratelimit:ban:{ip}"
        cache.delete(ban_key)
        self.stdout.write(self.style.SUCCESS(f"✅ IP {ip} blokdan chiqarildi!"))
