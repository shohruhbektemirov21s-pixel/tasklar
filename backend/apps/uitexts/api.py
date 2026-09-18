"""Interfeys matnlarini beruvchi ochiq endpoint.

TOKENSIZ. Kirish va bosh sahifadagi so'zlar ham shu yerdan keladi, ya'ni
foydalanuvchi hali tizimga kirmagan paytda ham kerak bo'ladi.

KESHLASH. Ro'yxat kichik, lekin har sahifa ochilishida so'raladi. Shuning
uchun javobga ETag qo'yamiz: matn o'zgarmagan bo'lsa brauzer 304 oladi va
tanani umuman yuklamaydi. ETag - yozuvlar soni va eng oxirgi o'zgarish
vaqtidan yig'iladi; birortasi tahrirlansa `updated_at` yangilanadi va teg
o'zgaradi.
"""
from django.core.cache import cache
from django.db.models import Max
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import UiText


def current_version():
    """Matnlar holatining qisqa belgisi — soni va oxirgi o'zgarish vaqti."""
    cached = cache.get("uitexts:version")
    if cached is not None:
        return cached

    agg = UiText.objects.aggregate(n=Max("id"), last=Max("updated_at"))
    count = UiText.objects.count()
    stamp = agg["last"].isoformat() if agg["last"] else "-"
    version = f"{count}.{stamp}"
    cache.set("uitexts:version", version, 300)
    return version


@api_view(["GET"])
@permission_classes([AllowAny])
def ui_texts(request):
    version = current_version()
    etag = f'"{version}"'

    # Brauzerdagi nusxa hali ham to'g'ri bo'lsa - tanani qayta yubormaymiz.
    if request.headers.get("If-None-Match") == etag:
        response = Response(status=304)
        response["ETag"] = etag
        return response

    items = cache.get("uitexts:data")
    if items is None:
        items = dict(UiText.objects.values_list("key", "value"))
        cache.set("uitexts:data", items, 300)

    response = Response({"version": version, "items": items})
    response["ETag"] = etag
    # Matn o'zgarganda darrov ko'rinishi kerak, shuning uchun saqlamaymiz -
    # lekin ETag borligi uchun qayta so'rov baribir arzon (304).
    response["Cache-Control"] = "no-cache"
    return response


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def system_settings(request):
    """Tizim brendingi: tizim nomi va logotipi."""
    from apps.core.media import media_url
    from .models import SystemSetting

    setting = SystemSetting.get_settings()

    if request.method == "GET":
        return Response({
            "app_name": setting.app_name or "TeamFlow",
            "logo_url": media_url(setting.logo) if setting.logo else None,
            "updated_at": setting.updated_at.isoformat() if setting.updated_at else None,
        })

    # POST - faqat platforma admini yoki boss
    user = request.user
    if not (user and user.is_authenticated and (user.is_platform_admin or getattr(user, "is_boss", False))):
        return Response({"detail": "Ushbu amal faqat administratorlar uchun ruxsat etilgan."}, status=403)

    app_name = request.data.get("app_name")
    if app_name is not None:
        setting.app_name = str(app_name).strip() or "TeamFlow"

    remove_logo = request.data.get("remove_logo")
    if str(remove_logo).lower() in ["true", "1"]:
        if setting.logo:
            try:
                setting.logo.delete(save=False)
            except Exception:
                pass
            setting.logo = None
    elif "logo" in request.FILES:
        from apps.core.uploads import check_upload
        logo_file = request.FILES["logo"]
        check_upload(logo_file, allow_svg=True)
        setting.logo = logo_file

    setting.save()

    try:
        from apps.notifications.services import send_to_users
        from django.contrib.auth import get_user_model
        User = get_user_model()
        all_users = list(User.objects.filter(is_active=True))
        send_to_users(all_users, {
            "event": "system.branding_update",
            "app_name": setting.app_name,
            "logo_url": media_url(setting.logo) if setting.logo else None,
        })
    except Exception:
        pass

    return Response({
        "app_name": setting.app_name or "TeamFlow",
        "logo_url": media_url(setting.logo) if setting.logo else None,
        "updated_at": setting.updated_at.isoformat() if setting.updated_at else None,
    })
