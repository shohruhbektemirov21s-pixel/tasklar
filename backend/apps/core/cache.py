"""Core kesh yordamchilari.

Qatlam arxitekturasi:
`apps.core` eng quyi qatlam bo'lib, unga `apps.tasks` va `apps.panel` bog'lana oladi.
Boshqaruv paneli (dashboard) va yon panel (sidebar) kesh kalitlarini bekor qilish
shu yerda joylashadi, natijada quyi qatlamlar (`tasks`) yuqori qatlamga (`panel`)
teskari bog'lanmaydi (reverse dependency oldini oladi).
"""
from django.core.cache import cache

DASHBOARD_TTL = 15
SIDEBAR_TTL = 10
MY_WORK_TTL = 15


def dashboard_key(user_id):
    return "panel:dash:{}".format(user_id)


def sidebar_key(user_id):
    return "panel:side:{}".format(user_id)


def my_work_version_key(user_id):
    return "panel:my_work_v:{}".format(user_id)


def get_my_work_version(user_id):
    try:
        val = cache.get(my_work_version_key(user_id))
        return int(val) if val is not None else 1
    except Exception:
        return 1


def my_work_key(user_id, query_str=""):
    v = get_my_work_version(user_id)
    return "panel:my_work:{}:{}:{}".format(user_id, v, query_str or "")


def invalidate_panel(user_id):
    """Foydalanuvchining panel keshini tozalash."""
    v_key = my_work_version_key(user_id)
    try:
        cache.incr(v_key)
    except Exception:
        cache.set(v_key, 2)
    cache.delete_many([dashboard_key(user_id), sidebar_key(user_id)])


def invalidate_panel_many(user_ids):
    """Bir nechta odamning keshini tozalash — bulk amallardan keyin."""
    if not user_ids:
        return
    keys = []
    for uid in set(user_ids):
        keys.append(dashboard_key(uid))
        keys.append(sidebar_key(uid))
        v_key = my_work_version_key(uid)
        try:
            cache.incr(v_key)
        except Exception:
            cache.set(v_key, 2)
    cache.delete_many(keys)
