"""Odamning ish sahifasi - `/api/users/<id>/work/`.

NEGA PANELDA. Bu javob besh domen ustidan o'qiydi: loyihalar, vazifalar,
ish jurnali, tarix va buyurtmalar. Ilgari u `accounts.UserViewSet` ning
`@action` i edi va `accounts` (eng pastdagi domenlardan biri) shu sababdan
`projects`, `tasks`, `activity` va `orders` ga funksiya ichidagi
importlar bilan bog'lanib turardi. Panel esa aynan shunday ko'rinishlar
uchun - u hammani biladi, uni hech kim bilmaydi. Manzil o'zgarmadi.

XAVFSIZLIK: hamma narsa SO'ROVCHINING huquqi bilan cheklanadi.
  * loyiha va vazifalar - `visible_projects_q` (boshqa odamning yopiq
    loyihasi nomi ham chiqmaydi);
  * buyurtmalar - `visible_orders`. Ilgari bu yerda cheklov yo'q edi:
    buyurtmalar bo'limiga umuman kira olmaydigan dasturchi ham boshqa
    odamning barcha buyurtmalarini ko'rardi.
"""
from django.contrib.auth import get_user_model
from django.db.models import Count, Exists, OuterRef, Q, Sum
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.accounts.serializers import UserBriefSerializer
from apps.activity.models import Activity
from apps.activity.serializers import ActivitySerializer
from apps.core.queries import object_or_404
from apps.orders.models import ChangeRequest, ChangeRequestStatus
from apps.orders.serializers import ChangeRequestSerializer
from apps.orders.visibility import visible_orders
from apps.projects.models import Project, ProjectMember
from apps.projects.permissions import sees_all_projects, visible_projects_q
from apps.tasks.models import Task, TaskAssignment, TaskStatus, WorkLog
from apps.tasks.serializers import TaskSerializer

User = get_user_model()

ORDER_IN_PROGRESS = (
    ChangeRequestStatus.IN_PROGRESS,
    ChangeRequestStatus.ASSIGNED_TO_DEV,
    ChangeRequestStatus.ACCEPTED,
    ChangeRequestStatus.TESTING,
)


@api_view(["GET"])
def user_work(request, pk):
    """Foydalanuvchi nima qilgani: loyihalari, vazifalari, tarixi, sarflagan soati."""
    me = request.user
    # O'chirilgan hisob - faqat adminga (ro'yxatdagi qoida bilan bir xil).
    people = User.objects.all() if me.is_platform_admin else User.objects.filter(is_active=True)
    target = object_or_404(people, pk=pk)
    ctx = {"request": request}

    # Chegarasiz ko'rinish: o'z sahifasi va hamma loyihani ko'radiganlar
    # (admin, boshliq, global menejer).
    wide = bool(sees_all_projects(me) or me.pk == target.pk)

    def limit(qs, path=""):
        return qs if wide else qs.filter(visible_projects_q(me, path))

    projects = limit(
        Project.objects.filter(Exists(ProjectMember.objects.filter(
            project=OuterRef("pk"), user=target, is_active=True)))
    ).select_related("workspace").order_by("-updated_at")[:30]

    roles = {m.project_id: m.get_role_display() for m in
             target.project_memberships.filter(is_active=True)}

    tasks = Task.objects.filter(Exists(TaskAssignment.objects.filter(
        task=OuterRef("pk"), user=target, is_active=True)))
    tasks = limit(tasks, "project__").select_related("project")

    by_status = {row["status"]: row["c"]
                 for row in tasks.values("status").annotate(c=Count("id"))}
    hours = (WorkLog.objects.filter(user=target, task__in=tasks)
             .aggregate(s=Sum("hours"))["s"] or 0)

    activity = limit(Activity.objects.timeline().filter(actor=target), "project__")

    # Buyurtmalar: target aloqador bo'lganlari, SO'ROVCHI ko'ra oladiganlari ichidan.
    order_q = Q(created_by=target) | Q(assigned_pm=target)
    if getattr(target, "department_name", None):
        order_q |= Q(department__iexact=target.department_name)
    if getattr(target, "department_id", None) and target.department:
        order_q |= Q(created_by__department=target.department)
    user_orders = list(
        visible_orders(me).filter(order_q)
        .select_related("created_by", "project", "assigned_pm", "assigned_developer")
        .prefetch_related("attachments")
        .order_by("-updated_at")[:50]
    )
    order_stats = {
        "total": len(user_orders),
        "pending_review": sum(1 for o in user_orders if o.status == ChangeRequestStatus.READY_FOR_REVIEW),
        "in_progress": sum(1 for o in user_orders if o.status in ORDER_IN_PROGRESS),
        "completed": sum(1 for o in user_orders if o.status == ChangeRequestStatus.COMPLETED),
    }

    return Response({
        "user": UserBriefSerializer(target, context=ctx).data,
        "stats": {
            "projects": len(projects),
            "open": sum(v for k, v in by_status.items()
                        if k not in (TaskStatus.DONE, TaskStatus.CANCELLED)),
            "done": by_status.get(TaskStatus.DONE, 0),
            "in_review": by_status.get(TaskStatus.IN_REVIEW, 0),
            "changes": by_status.get(TaskStatus.CHANGES_REQUESTED, 0),
            "hours": float(hours),
        },
        "order_stats": order_stats,
        "orders": ChangeRequestSerializer(user_orders, many=True, context=ctx).data,
        "projects": [{
            "id": p.id, "name": p.name, "key": p.key, "color": p.color,
            "workspace_name": p.workspace.name,
            "role": roles.get(p.id, ""),
        } for p in projects],
        # Kartada brauzerda sahifalanadi (o'ntadan) - yuztagacha olinadi.
        # `prefetch_related` shart: seriyalizator har vazifa uchun
        # ijrochilarni va teglarni o'qiydi.
        "tasks": TaskSerializer(
            tasks.exclude(status=TaskStatus.CANCELLED)
                 .prefetch_related("assignments__user", "labels")
                 .order_by("-updated_at")[:100],
            many=True, context=ctx).data,
        "activity": ActivitySerializer(activity[:25], many=True, context=ctx).data,
        "limited": not wide,
    })
