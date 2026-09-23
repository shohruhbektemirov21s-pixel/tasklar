"""Buyurtma holatlari: qaysi holatdan qaysiga o'tish mumkin va kim o'tkazadi.

MUAMMO. Holat o'n ikki joyda qo'lda yozilardi (`order.status = ...`) va
har biri o'zicha tekshirardi - ba'zisi umuman tekshirmasdi:

  * `submit-completion` holatga qaramasdi: qoralama, bekor qilingan va
    hatto YOPILGAN buyurtma ham «Boshqarma tasdig'ida» ga qaytardi;
  * `set-pm-decision` va `approve-version` istalgan holatni qabul qilardi:
    PM yopilgan buyurtmani qayta ochardi, `approve-version` esa
    `status=COMPLETED` bilan boshqarma tasdig'ini butunlay chetlab o'tardi;
  * «PM kim» degan savol besh joyda uch xil yozilgan edi.

YECHIM. Qoidalar shu yerda, bitta jadvalda. Har bir o'tish
`check_transition` dan o'tadi; jadvalda yo'q o'tish 400 bilan qaytadi.

IKKI XIL O'TISH.
  * Tizim o'tishi - aniq amal natijasi: yuborish (DRAFT → NEW), ishni
    topshirish (→ READY_FOR_REVIEW), boshqarma qarori (→ COMPLETED yoki
    qaytarish). Bularni faqat o'z endpointi qiladi.
  * Qo'lda o'tish (`manual=True`) - PM ro'yxatdan holat tanlaydi
    (`set-pm-decision`, `approve-version`, tahrirlash). Unga tizim
    o'tishlarining nishonlari yopiq: qo'lda «Bajarildi» ham, «Boshqarma
    tasdig'ida» ham qo'yib bo'lmaydi, boshqarma ko'rib turgan buyurtmaga
    esa PM umuman tegmaydi.
"""
from rest_framework.exceptions import ValidationError

from .models import ChangeRequestStatus as S

# PM qabul qilgandan keyingi ish holatlari.
WORK_STATES = frozenset({S.ACCEPTED, S.ASSIGNED_TO_DEV, S.IN_PROGRESS, S.TESTING})
# Hali yopilmagan, PM qo'lida turgan holatlar.
OPEN_STATES = WORK_STATES | {S.NEW}


def _work_step(current):
    # Ish holatlari orasida erkin harakat: PM ishni oldinga ham, orqaga ham
    # suradi (masalan testdan qaytarib jarayonga). Qo'shimcha: qaytarish
    # (NEW), topshirish, rad etish va bekor qilish.
    return (OPEN_STATES - {current}) | {S.READY_FOR_REVIEW, S.REJECTED, S.CANCELLED}


TRANSITIONS = {
    S.DRAFT: frozenset({S.NEW}),
    S.NEW: WORK_STATES | {S.REJECTED, S.CANCELLED},
    **{state: frozenset(_work_step(state)) for state in WORK_STATES},
    # Boshqarma navbati: faqat qabul qiladi yoki kamchilik bilan qaytaradi.
    S.READY_FOR_REVIEW: frozenset({S.COMPLETED, S.IN_PROGRESS}),
    # Rad etilgan va bekor qilingan buyurtmani PM qayta ko'rib chiqa oladi.
    S.REJECTED: OPEN_STATES | {S.CANCELLED},
    S.CANCELLED: OPEN_STATES,
    # Yopilgan - yopilgan. Qayta ochish yo'li yo'q: boshqarma imzolagan.
    S.COMPLETED: frozenset(),
}

# Qo'lda tanlab bo'lmaydigan holatlar - ularga faqat o'z amali olib boradi.
SYSTEM_ONLY_TARGETS = frozenset({S.DRAFT, S.READY_FOR_REVIEW, S.COMPLETED})


def can_transition(current, target, *, manual=False):
    if current == target:
        return True
    if manual and (target in SYSTEM_ONLY_TARGETS or current == S.READY_FOR_REVIEW):
        return False
    return target in TRANSITIONS.get(current, frozenset())


def check_transition(current, target, *, manual=False):
    """O'tish mumkin bo'lmasa `ValidationError` (400)."""
    if can_transition(current, target, manual=manual):
        return
    labels = dict(S.choices)
    raise ValidationError({"status": (
        f"Buyurtmani «{labels.get(current, current)}» holatidan "
        f"«{labels.get(target, target)}» holatiga o'tkazib bo'lmaydi."
    )})


# ---------------------------------------------------------------- rollar

def is_admin_or_boss(user):
    return bool(user.is_platform_admin or getattr(user, "is_boss", False))


def is_order_pm(user):
    """Buyurtmani qabul qiladigan, qaror chiqaradigan va topshiradigan odam.

    Admin, boshliq va global menejer. Ilgari ayrim joylarda
    `specialty == "PM"` ham sanalardi, lekin bunday odam (global roli
    menejer bo'lmasa) `CanAccessOrders` dan o'tmaydi - ya'ni u shart
    amalda hech qachon ishlamasdi.
    """
    return bool(is_admin_or_boss(user) or getattr(user, "is_manager", False))


def can_be_order_pm(target):
    """Buyurtma kimga BIRIKTIRILISHI mumkin (claim/reassign nishoni)."""
    is_pm = bool(target.is_platform_admin or target.is_boss or target.is_manager
                 or target.specialty == "PM")
    is_developer = target.specialty == "DEVELOPER" or target.global_role == "DEVELOPER"
    return is_pm and not is_developer
