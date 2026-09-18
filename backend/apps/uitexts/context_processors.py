"""Django shablonlari uchun brending (loyiha nomi va logotip) kontekst protsessori.

Har bir so'rovda (xususan Django Admin va Jazzmin interfeysida) eng so'nggi
tizim nomi va logotipini shablonga hamda sozlamalarga qo'shib beradi.
"""
from django.conf import settings
from django.contrib import admin
from apps.core.media import media_url
from apps.uitexts.models import SystemSetting


def branding_context(request):
    try:
        setting = SystemSetting.get_settings()
        app_name = setting.app_name or "TeamFlow"
        logo_url = media_url(setting.logo) if setting.logo else None

        # Django Admin va Jazzmin sarlavhalarini dinamik yangilash
        admin.site.site_header = f"⚡ {app_name} Boshqaruv"
        admin.site.site_title = f"{app_name} Admin"
        admin.site.index_title = f"{app_name} Boshqaruv Paneli"

        if hasattr(settings, "JAZZMIN_SETTINGS"):
            settings.JAZZMIN_SETTINGS["site_title"] = f"{app_name} Admin"
            settings.JAZZMIN_SETTINGS["site_header"] = f"⚡ {app_name} Boshqaruv"
            settings.JAZZMIN_SETTINGS["site_brand"] = app_name
            settings.JAZZMIN_SETTINGS["site_logo"] = logo_url
            settings.JAZZMIN_SETTINGS["welcome_sign"] = f"{app_name} Boshqaruv Paneliga xush kelibsiz!"
            settings.JAZZMIN_SETTINGS["copyright"] = app_name

        return {
            "custom_app_name": app_name,
            "custom_logo_url": logo_url,
        }
    except Exception:
        return {
            "custom_app_name": "TeamFlow",
            "custom_logo_url": None,
        }
