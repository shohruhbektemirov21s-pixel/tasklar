"""Kim qaysi buyurtmani ko'radi - bitta joyda.

Ilgari qoida faqat `ChangeRequestViewSet.get_queryset` ichida edi. Profil
sahifasi (`/api/users/<id>/work/`) esa buyurtmalarni o'zicha, hech qanday
cheklovsiz olardi: istalgan kirgan foydalanuvchi - hatto buyurtmalar
bo'limiga umuman kira olmaydigan dasturchi ham - boshqa odamning barcha
buyurtmalarini (tizim nomi, bo'lim, TZ) ko'ra olardi.

Endi ikkala eshik ham shu funksiyalardan o'tadi.
"""
from django.db.models import Q

from .models import ChangeRequest, ChangeRequestStatus
from .workflow import is_admin_or_boss


def can_access_orders(user):
    """Buyurtmalar bo'limiga umuman kirish (`CanAccessOrders` bilan bir xil)."""
    if not (user and user.is_authenticated):
        return False
    return bool(
        is_admin_or_boss(user)
        or getattr(user, "is_manager", False)
        or getattr(user, "can_access_orders", False)
        or getattr(user, "is_sohaviy_boshqarma", False)
        or getattr(user, "can_create_project", False)
    )


def is_sohaviy(user):
    return bool(
        getattr(user, "is_sohaviy_boshqarma", False)
        or getattr(user, "specialty", "") == "SOHAVIY"
        or getattr(user, "global_role", "") == "SOHAVIY"
    )


def sohaviy_q(user):
    """Sohaviy vakil: o'zi yaratgani va (qoralamasiz) boshqarmasiniki."""
    q = Q(created_by=user)
    if getattr(user, "department_id", None) and user.department:
        q |= ((Q(department__iexact=user.department.name) | Q(created_by__department=user.department))
              & ~Q(status=ChangeRequestStatus.DRAFT))
    elif getattr(user, "department_name", None) and user.department_name != "Sohaviy boshqarmalar":
        q |= Q(department__iexact=user.department_name) & ~Q(status=ChangeRequestStatus.DRAFT)
    return q


def involved_q(user):
    """Odam bevosita aloqador buyurtmalar."""
    return (Q(created_by=user) | Q(assigned_pm=user)
            | Q(assigned_developer=user) | Q(project__manager=user))


def visible_orders(user, qs=None):
    """Foydalanuvchi ko'ra oladigan buyurtmalar (qo'shimcha filtrlarsiz).

    Qoralama faqat egasiga ko'rinadi - admin va boshliqqa ham.
    """
    qs = ChangeRequest.objects.all() if qs is None else qs
    if not can_access_orders(user):
        return qs.none()
    if is_sohaviy(user) and not is_admin_or_boss(user):
        qs = qs.filter(sohaviy_q(user))
    elif not is_admin_or_boss(user) and not getattr(user, "is_manager", False):
        qs = qs.filter(involved_q(user))
    return qs.exclude(Q(status=ChangeRequestStatus.DRAFT) & ~Q(created_by=user))
