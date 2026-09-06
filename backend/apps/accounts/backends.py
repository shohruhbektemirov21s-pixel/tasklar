from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend

UserModel = get_user_model()


class EmailBackend(ModelBackend):
    """Email + parol orqali kirish."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        raw = (username or kwargs.get("email") or "").strip().lower()
        if not raw or password is None:
            return None
        # Agar domen kiritilmagan bo'lsa (masalan "frontend", "backend", "admin"),
        # @teamflow.uz qo'shib ham tekshiriladi.
        emails_to_try = [raw]
        if "@" not in raw:
            emails_to_try.append(f"{raw}@teamflow.uz")

        user = None
        for candidate in emails_to_try:
            try:
                user = UserModel.objects.get(email__iexact=candidate)
                break
            except UserModel.DoesNotExist:
                continue

        if user is None:
            UserModel().set_password(password)  # timing attack himoyasi
            return None

        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
