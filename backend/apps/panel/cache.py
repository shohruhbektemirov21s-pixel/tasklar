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
from apps.core.cache import (
    DASHBOARD_TTL,
    SIDEBAR_TTL,
    MY_WORK_TTL,
    dashboard_key,
    sidebar_key,
    my_work_key,
    invalidate_panel,
    invalidate_panel_many,
)

__all__ = [
    "DASHBOARD_TTL",
    "SIDEBAR_TTL",
    "MY_WORK_TTL",
    "dashboard_key",
    "sidebar_key",
    "my_work_key",
    "invalidate_panel",
    "invalidate_panel_many",
]
