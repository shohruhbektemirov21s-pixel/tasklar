from rest_framework.routers import DefaultRouter
from .api import ChangeRequestViewSet

router = DefaultRouter()
router.register("orders", ChangeRequestViewSet, basename="order")

urlpatterns = router.urls
