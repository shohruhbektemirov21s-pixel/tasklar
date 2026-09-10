from django.urls import path
from rest_framework_simplejwt.views import TokenVerifyView

from . import api

app_name = "accounts"

urlpatterns = [
    path("specialties/", api.specialties, name="specialties"),
    path("specialties/<int:item_id>/", api.specialties, name="specialties_detail"),
    path("login/", api.LoginView.as_view(), name="login"),
    path("refresh/", api.RefreshView.as_view(), name="refresh"),
    path("verify/", TokenVerifyView.as_view(), name="verify"),
    path("register/", api.RegisterView.as_view(), name="register"),
    path("logout/", api.LogoutView.as_view(), name="logout"),
    path("me/", api.MeView.as_view(), name="me"),
    path("me/avatar/", api.AvatarView.as_view(), name="me_avatar"),
    path("change-password/", api.ChangePasswordView.as_view(), name="change_password"),
]
