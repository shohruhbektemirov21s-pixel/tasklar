from rest_framework.permissions import BasePermission


class CanAccessInquiries(BasePermission):
    """Faqat So'rovlar bo'limiga ruxsati bor foydalanuvchilar kira oladi.

    Boshliq (BOSS) va Platform Adminiga (ADMIN) doim ruxsat berilgan.
    Boshqa xodimlarga Admin panel orqali `can_access_inquiries=True`
    qilib berilgan bo'lsa kiradi.
    """

    message = "Ushbu bo'limga kirish uchun administrator ruxsati talab qilinadi."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "has_inquiries_access", False)
        )
