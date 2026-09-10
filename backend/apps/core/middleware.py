"""Haddan tashqari ko'p so'rov yuboruvchi tajovuzkorlarni bloklash va tezlikni cheklash middleware-i.

NEGA MIDDLEWARE QATLAMI:
Agar tajovuzkor bir vaqtda minglab yoki o'n minglab so'rov yuborsa, bu so'rovlar
baza (IBM Db2), autentifikatsiya va DRF ko'rinishlariga yetib bormasligi shart!
Aks holda har bir so'rov baza ulanishlarini band qilib, serverni yiqitadi.

Ushbu middleware so'rov kelgan zahoti (eng birinchi qatlamda) ishlaydi:
1. Redis keshidan mijoz IP-manzilini qora ro'yxatda (Blacklist/Ban) bor-yo'qligini tekshiradi:
   - Agar bloklangan bo'lsa -> zudlik bilan HTTP 403 Forbidden qaytaradi (0.1 ms, Db2 va CPU ga 0 yuk!).
2. Bir daqiqalik sirg'aluvchi oyna (Sliding Window) orqali so'rovlar sonini sanaydi:
   - Agar limitdan oshsa (masalan, daqiqasiga > 120 ta so'rov) -> HTTP 429 Too Many Requests (Retry-After).
   - Agar tajovuzkor to'xtamasdan spam yuborsa va qattiq chegaradan oshsa (masalan, daqiqasiga > 300 ta so'rov):
     -> Ushbu IP avtomatik tarzda QORA RO'YXATGA (Ban) tushadi va 10 daqiqa (yoki 1 soat) ga butunlay bloklanadi!
"""
import logging
import time

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse

logger = logging.getLogger(__name__)

# Standart konfiguratsiya (agar settings da berilmagan bo'lsa)
DEFAULT_RATE_LIMIT = 120        # bir daqiqadagi me'yoriy so'rovlar soni
DEFAULT_BAN_THRESHOLD = 300     # bir daqiqada shunchadan oshsa - to'g'ridan-to'g'ri bloklanadi (BAN)
DEFAULT_BAN_SECONDS = 10 * 60   # bloklash muddati: 10 daqiqa (600 soniya)


def get_client_ip(request):
    """Mijozning haqiqiy IP manzilini proksi va load balancer ortidan aniqlash."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        # Vergul bilan ajratilgan ro'yxatning birinchisi haqiqiy klient IP-si bo'ladi
        ip = x_forwarded_for.split(",")[0].strip()
        if ip:
            return ip
    x_real_ip = request.META.get("HTTP_X_REAL_IP")
    if x_real_ip:
        return x_real_ip.strip()
    return request.META.get("REMOTE_ADDR", "127.0.0.1").strip()


class RateLimitBlockMiddleware:
    """Spam/DoS hujumlarini aniqlovchi va tajovuzkorlarni avtomatik bloklovchi middleware."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Statik va media fayllarga tekshiruv shart emas
        path = request.path_info
        if path.startswith(("/static/", "/media/", "/favicon.ico")):
            return self.get_response(request)

        # Agar tezlikni cheklash settings da o'chirilgan bo'lsa (masalan ba'zi ichki testlarda)
        if not getattr(settings, "RATE_LIMIT_ENABLED", True):
            return self.get_response(request)

        client_ip = get_client_ip(request)

        # 1-QADAM: Mijoz qora ro'yxatda (BAN) bormi?
        ban_key = f"ratelimit:ban:{client_ip}"
        ban_info = cache.get(ban_key)
        if ban_info:
            logger.warning(
                "BLOKLANGAN IP urinishi rad etildi: %s (Manzil: %s)", client_ip, path
            )
            return JsonResponse(
                {
                    "detail": "Xavfsizlik tizimi: IP manzilingiz haddan tashqari ko'p so'rov yuborgani (Spam/DDoS) tufayli vaqtincha BLOKLANGAN.",
                    "error": "ip_banned",
                    "client_ip": client_ip,
                    "status": 403,
                },
                status=403,
            )

        # 2-QADAM: So'rovlar sonini bir daqiqalik oyna bo'yicha sanash
        rate_limit = getattr(settings, "RATE_LIMIT_PER_MINUTE", DEFAULT_RATE_LIMIT)
        ban_threshold = getattr(settings, "RATE_LIMIT_BAN_THRESHOLD", DEFAULT_BAN_THRESHOLD)
        ban_seconds = getattr(settings, "RATE_LIMIT_BAN_SECONDS", DEFAULT_BAN_SECONDS)

        current_minute = int(time.time() // 60)
        count_key = f"ratelimit:count:{client_ip}:{current_minute}"

        try:
            req_count = cache.incr(count_key)
        except ValueError:
            # Kalit hali keshda yo'q - 70 soniyalik TTL bilan 1 qilib yaratamiz
            cache.set(count_key, 1, timeout=70)
            req_count = 1
        except Exception:
            # Agar keshda boshqa nosozlik bo'lsa, xavfsiz o'tish
            try:
                req_count = (cache.get(count_key) or 0) + 1
                cache.set(count_key, req_count, timeout=70)
            except Exception:
                return self.get_response(request)

        # 3-QADAM: Tajovuzkor qattiq chegaradan (BAN THRESHOLD) oshdimi?
        if req_count >= ban_threshold:
            # IP-ni zudlik bilan qora ro'yxatga kiritamiz
            cache.set(
                ban_key,
                {"banned_at": time.time(), "requests_in_min": req_count},
                timeout=ban_seconds,
            )
            logger.error(
                "🚨 XAVFSIZLIK: IP %s avtomatik ravishda %d soniyaga BLOKLANDI! (1 daqiqada %d ta so'rov, me'yor: %d)",
                client_ip,
                ban_seconds,
                req_count,
                ban_threshold,
            )
            return JsonResponse(
                {
                    "detail": "Xavfsizlik tizimi: Haddan tashqari ko'p so'rov aniqlandi! IP manzilingiz vaqtincha BLOKLANDI.",
                    "error": "ip_banned_flood",
                    "client_ip": client_ip,
                    "status": 403,
                    "ban_duration_seconds": ban_seconds,
                },
                status=403,
            )

        # 4-QADAM: Me'yoriy limitdan (RATE LIMIT) oshdimi?
        if req_count > rate_limit:
            retry_after = max(1, 60 - int(time.time() % 60))
            logger.warning(
                "Tezlik chegarasi oshdi: IP %s (%d/%d ta so'rov). 429 qaytarildi.",
                client_ip,
                req_count,
                rate_limit,
            )
            response = JsonResponse(
                {
                    "detail": "Juda ko'p so'rov yuborildi. Iltimos, biroz kutib qayta urinib ko'ring (Rate limit exceeded).",
                    "error": "too_many_requests",
                    "client_ip": client_ip,
                    "limit_per_minute": rate_limit,
                    "retry_after_seconds": retry_after,
                    "status": 429,
                },
                status=429,
            )
            response["Retry-After"] = str(retry_after)
            return response

        # Hammasi joyida - so'rov ilovaga o'tkaziladi
        return self.get_response(request)
