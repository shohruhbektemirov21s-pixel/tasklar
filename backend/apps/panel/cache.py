"""Panel keshlash yordamchilari.

MUAMMO. Bosh panel (dashboard) eng og'ir endpoint: 10-15 ta baza
so'rovi, seriyalizatsiya va bir nechta ro'yxat. 1000 ta foydalanuvchi
bir vaqtda ochsa — o'n minglab baza so'rovi. Ish soati boshida butun
jamoa bir vaqtda panelni ochadi.

YECHIM. Natija Redis da foydalanuvchi bo'yicha keshlanadi va 15 soniya
amal qiladi. Bitta odam daqiqada 4 marta navigatsiya qilsa, faqat biri
bazaga boradi — qolgan uchtasi keshdan keladi. Yuz odam uchun bu 300 ta
so'rov o'rniga 100 ta bo'ladi.

MUDDATI QISQA — 15 soniya. Vazifa holati o'zgarishi 15 soniya ichida
panelga yetib boradi. Bu yetarli: odam panelda har 15 soniyada yangi
raqam kutmaydi, amalda esa bir marta ochib, ko'rib, ishga o'tadi.

BEKOR QILISH. `invalidate_panel` chaqirilganda kesh ANIQ O'SHA odam
uchun tozalanadi — masalan, vazifa holati o'zgartirilganda. Shunda odam
harakati darrov ko'rinadi: men topshirdim -> navbat raqami oshdi.
"""
from django.core.cache import cache

# Soniya. Qisqa tutar, lekin eng og'ir endpointni 4x yengillashtiradi.
DASHBOARD_TTL = 15
SIDEBAR_TTL = 10


def dashboard_key(user_id):
    return "panel:dash:{}".format(user_id)


def sidebar_key(user_id):
    return "panel:side:{}".format(user_id)


def invalidate_panel(user_id):
    """Foydalanuvchining panel keshini tozalash.

    Chaqiriladigan joylar: vazifa holati o'zgarsa, yangi vazifa yaratilsa,
    a'zo qo'shilsa, so'rov kelib tushsa.
    """
    cache.delete_many([dashboard_key(user_id), sidebar_key(user_id)])


def invalidate_panel_many(user_ids):
    """Bir nechta odamning keshini tozalash — bulk amallardan keyin."""
    if not user_ids:
        return
    keys = []
    for uid in user_ids:
        keys.append(dashboard_key(uid))
        keys.append(sidebar_key(uid))
    cache.delete_many(keys)
