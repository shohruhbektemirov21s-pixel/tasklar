"""Vazifalar domen xizmatlari (Business Logic Layer).

Holat o'tishlari, tekshiruv jarayoni, ijrochilarni sinxronlash,
jonli WebSocket signallari va loyiha a'zolari bilan ishlash.
"""
import logging
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from apps.activity.services import log
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify, notify_many, send_to_users
from apps.projects.models import ProjectRole

from .models import ReviewVerdict, TaskAssignment, TaskStatus

User = get_user_model()
logger = logging.getLogger(__name__)


def send_to_review(task, access):
    """Ish topshirilgach vazifani TEKSHIRUVGA olib boradi."""
    if task.status in (TaskStatus.IN_REVIEW, TaskStatus.DONE, TaskStatus.CANCELLED):
        return False

    if TaskStatus.IN_REVIEW not in task.allowed_transitions(access):
        if TaskStatus.IN_PROGRESS not in task.allowed_transitions(access):
            return False
        task.apply_status(TaskStatus.IN_PROGRESS)

    if TaskStatus.IN_REVIEW not in task.allowed_transitions(access):
        return False

    task.apply_status(TaskStatus.IN_REVIEW)
    task.review_round += 1
    task.save()
    return True


def move_status(task, new_status, access, actor, blocked_reason=""):
    """Vazifa holatini QOIDA bilan o'zgartiradi: ruxsat, vaqt belgilari, tarix, signal."""
    if new_status == task.status:
        return False

    if new_status not in task.allowed_transitions(access):
        if new_status == TaskStatus.DONE:
            if task.status == TaskStatus.IN_REVIEW:
                raise PermissionDenied(
                    "Bu vazifa tekshiruvda. Uni loyiha menejeri yoki admin "
                    "tasdiqlaydi."
                )
            raise PermissionDenied(
                "«Bajarildi» ni qolda qoyib bolmaydi: avval ijrochi ishni "
                "topshiradi, keyin menejer yoki admin tekshirib tasdiqlaydi."
            )
        raise PermissionDenied(
            "Siz bu vazifani '{}' holatiga ota olmaysiz.".format(TaskStatus(new_status).label)
        )

    old_label = task.get_status_display()
    old_status = task.status
    task.apply_status(new_status)
    if new_status == TaskStatus.BLOCKED:
        task.blocked_reason = (blocked_reason or "")[:250]
    if new_status == TaskStatus.IN_REVIEW:
        task.review_round += 1
    task.save()

    if old_status == TaskStatus.IN_REVIEW and new_status == TaskStatus.IN_PROGRESS:
        reviewers = [
            m.user
            for m in task.project.memberships.filter(
                is_active=True, role__in=[ProjectRole.MANAGER, ProjectRole.ADMIN]
            ).select_related("user")
        ]
        notify_many(
            reviewers,
            NotificationKind.TASK_REVIEW,
            title="{} tekshiruvdan qaytarib olindi".format(task.code),
            body="{}: {}".format(getattr(actor, "full_name", ""), task.title[:100]),
            url="/vazifa/{}".format(task.pk),
            actor=actor,
        )

    verb = "task.status"
    if new_status == TaskStatus.IN_REVIEW:
        verb = "task.submitted"
    elif new_status == TaskStatus.BLOCKED:
        verb = "task.blocked"
    log(
        actor=actor,
        verb=verb,
        task=task,
        summary="{}: {} -> {}".format(task.code, old_label, task.get_status_display()),
        detail=task.blocked_reason,
        meta={"from": old_label, "to": task.get_status_display()},
    )
    live_task(
        task,
        "status",
        actor,
        status_display=task.get_status_display(),
        previous=old_label,
    )

    from apps.core.cache import invalidate_panel_many

    uids = [u.id for u in task.assignee_list]
    if task.project.manager_id:
        uids.append(task.project.manager_id)
    if actor and actor.id:
        uids.append(actor.id)
    invalidate_panel_many(uids)
    return True


def apply_review(task, review, actor):
    """Tekshiruv yozuvi yaratilgandan keyingi hamma narsa: holat, tarix, xabar, signal."""
    if review.verdict == ReviewVerdict.APPROVED:
        task.apply_status(TaskStatus.DONE)
        verb = "task.approved"
    elif review.verdict == ReviewVerdict.CHANGES_REQUESTED:
        task.apply_status(TaskStatus.CHANGES_REQUESTED)
        verb = "task.changes_requested"
    else:
        task.apply_status(TaskStatus.CANCELLED)
        verb = "task.rejected"
    task.save()

    log(
        actor=actor,
        verb=verb,
        task=task,
        summary="{} - {} ({}-aylana)".format(
            task.code, review.get_verdict_display(), review.round_no
        ),
        detail=review.comment[:1000],
        meta={"verdict": review.verdict, "round": review.round_no},
    )

    notify_many(
        task.assignee_list,
        NotificationKind.TASK_DECIDED,
        title="{} - {}".format(task.code, review.get_verdict_display()),
        body=(review.comment[:150] or task.title[:150]),
        url="/vazifa/{}".format(task.pk),
        actor=actor,
        meta={"task": task.pk, "verdict": review.verdict},
    )
    live_task(
        task,
        "review",
        actor,
        verdict=review.verdict,
        status_display=task.get_status_display(),
    )

    from apps.core.cache import invalidate_panel_many

    uids = [u.id for u in task.assignee_list]
    if task.project.manager_id:
        uids.append(task.project.manager_id)
    if actor and actor.id:
        uids.append(actor.id)
    invalidate_panel_many(uids)
    return review


def project_people(project, roles=None):
    """Loyihaning faol a'zolari (kerak bo'lsa faqat kerakli rollari)."""
    qs = project.memberships.filter(is_active=True).select_related("user")
    if roles:
        qs = qs.filter(role__in=roles)
    return [m.user for m in qs]


def task_watchers(task):
    """Vazifa taqdiri qiziqadigan odamlar: ijrochilar, tekshiruvchi va muallif."""
    people = list(task.assignee_list)
    if task.reviewer_id:
        people.append(task.reviewer)
    if task.created_by_id:
        people.append(task.created_by)
    return people


def live_task(task, action, actor=None, **extra):
    """Loyiha a'zolarining ochiq sahifalariga 'vazifa o'zgardi' signali."""
    payload = {
        "event": "task.update",
        "action": action,
        "project": task.project_id,
        "task": task.pk,
        "code": task.code,
        "status": task.status,
        "actor": getattr(actor, "pk", None),
    }
    payload.update(extra)
    send_to_users(project_people(task.project), payload)


def sync_assignees(task, user_ids, actor):
    """Ijrochilar ro'yxatini yangilaydi va tarixga yozadi."""
    wanted = set(user_ids or [])
    from apps.accounts.models import GlobalRole, Specialty
    from apps.projects.models import ProjectMember, ProjectRole
    from django.db.models import Q

    is_boss = actor and (actor.global_role == GlobalRole.BOSS or getattr(actor, "is_boss", False))
    
    # Tanlangan foydalanuvchilar loyiha a'zoligiga avtomatik qo'shiladi
    valid_users = User.objects.filter(pk__in=wanted, is_active=True).exclude(
        global_role__in=[GlobalRole.ADMIN, GlobalRole.BOSS]
    ).exclude(is_superuser=True)
    if not is_boss:
        valid_users = valid_users.exclude(
            Q(global_role=GlobalRole.MANAGER) | Q(specialty=Specialty.PM)
        )
    for u in valid_users:
        pm = task.project.memberships.filter(user=u).first()
        if pm is None:
            ProjectMember.objects.create(
                project=task.project,
                user=u,
                role=getattr(u, "default_project_role", None) or ProjectRole.DEVELOPER,
                is_active=True,
            )
        elif not pm.is_active:
            pm.is_active = True
            pm.left_at = None
            pm.save(update_fields=["is_active", "left_at"])

    members_qs = (
        task.project.memberships.filter(is_active=True)
        .exclude(user__global_role__in=[GlobalRole.ADMIN, GlobalRole.BOSS])
        .exclude(user__is_superuser=True)
    )
    if not is_boss:
        members_qs = members_qs.exclude(
            Q(user__global_role=GlobalRole.MANAGER) | Q(user__specialty=Specialty.PM)
        )
    members = set(members_qs.values_list("user_id", flat=True))
    skipped = sorted(wanted - members)
    wanted &= members
    current = {a.user_id: a for a in task.assignments.select_related("user")}
    added, removed = [], []

    for uid in wanted:
        a = current.get(uid)
        if a is None:
            user = User.objects.filter(pk=uid).first()
            if not user:
                continue
            TaskAssignment.objects.create(task=task, user=user, assigned_by=actor)
            added.append(user)
        elif not a.is_active:
            a.is_active = True
            a.unassigned_at = None
            a.assigned_by = actor
            a.save(update_fields=["is_active", "unassigned_at", "assigned_by"])
            added.append(a.user)

    for uid, a in current.items():
        if uid not in wanted and a.is_active:
            a.is_active = False
            a.unassigned_at = timezone.now()
            a.save(update_fields=["is_active", "unassigned_at"])
            removed.append(a.user)

    if added:
        log(
            actor=actor,
            verb="task.assigned",
            task=task,
            summary="{}: {} biriktirildi".format(
                task.code, ", ".join(u.full_name for u in added)
            ),
        )
        notify_many(
            added,
            NotificationKind.TASK_ASSIGNED,
            title="{} sizga biriktirildi".format(task.code),
            body=task.title[:150],
            url="/vazifa/{}".format(task.pk),
            actor=actor,
            meta={"task": task.pk, "project": task.project_id},
        )
    if removed:
        log(
            actor=actor,
            verb="task.unassigned",
            task=task,
            summary="{}: {} olib tashlandi".format(
                task.code, ", ".join(u.full_name for u in removed)
            ),
        )
    return added, removed, skipped


def assign_team_member(task, user, actor, start_date=None, due_date=None, allocated_hours=None, role="", note=""):
    """Vazifaga jamoa a'zosini biriktiradi yoki uning muddat/rol parametrlarini yangilaydi."""
    from apps.accounts.models import GlobalRole, Specialty
    from django.core.exceptions import ValidationError
    if user.is_superuser or user.global_role in [GlobalRole.ADMIN, GlobalRole.BOSS]:
        raise ValidationError("Bosh admin va Boshliqqa vazifa biriktirib bo'lmaydi.")
    is_pm = user.global_role == GlobalRole.MANAGER or user.specialty == Specialty.PM
    if is_pm:
        is_boss = actor and (actor.global_role == GlobalRole.BOSS or getattr(actor, "is_boss", False))
        if not is_boss:
            raise ValidationError("PM (Loyiha menejeri)ga faqat Boshliq vazifa bera oladi.")
    assignment = task.assignments.filter(user=user).first()
    is_new = False
    if assignment is None:
        assignment = TaskAssignment.objects.create(
            task=task,
            user=user,
            assigned_by=actor,
            start_date=start_date,
            due_date=due_date,
            allocated_hours=allocated_hours,
            role=role,
            note=note,
            is_active=True,
        )
        is_new = True
    else:
        assignment.is_active = True
        assignment.unassigned_at = None
        assignment.assigned_by = actor
        assignment.start_date = start_date
        assignment.due_date = due_date
        assignment.allocated_hours = allocated_hours
        assignment.role = role
        assignment.note = note
        assignment.save(update_fields=[
            "is_active", "unassigned_at", "assigned_by",
            "start_date", "due_date", "allocated_hours", "role", "note"
        ])

    detail_parts = []
    if role:
        detail_parts.append(f"Rol: {role}")
    if start_date:
        detail_parts.append(f"Boshlanish: {start_date}")
    if due_date:
        detail_parts.append(f"Muddat: {due_date}")
    if allocated_hours:
        detail_parts.append(f"Reja: {allocated_hours} soat")
    detail_str = " · ".join(detail_parts)

    log(
        actor=actor,
        verb="task.assigned" if is_new else "task.assignment_updated",
        task=task,
        summary=f"{task.code}: jamoaga {user.full_name} biriktirildi" if is_new else f"{task.code}: {user.full_name} ma'lumotlari yangilandi",
        detail=detail_str,
        meta={"user_id": user.id, "role": role},
    )
    if is_new or actor != user:
        notify(
            user,
            NotificationKind.TASK_ASSIGNED,
            title=f"{task.code} vazifasiga jamoa a'zosi sifatida biriktirildingiz",
            body=((f"{role}: " if role else "") + task.title)[:150],
            url=f"/vazifa/{task.pk}",
            actor=actor,
            meta={"task": task.pk, "project": task.project_id},
        )
    return assignment


def remove_team_member(task, user, actor):
    """Vazifadan jamoa a'zosini chiqaradi (nofaol qiladi)."""
    assignment = task.assignments.filter(user=user, is_active=True).first()
    if not assignment:
        return None
    assignment.is_active = False
    assignment.unassigned_at = timezone.now()
    assignment.save(update_fields=["is_active", "unassigned_at"])

    log(
        actor=actor,
        verb="task.unassigned",
        task=task,
        summary=f"{task.code}: {user.full_name} jamoa tarkibidan chiqarildi",
        meta={"user_id": user.id},
    )
    return assignment


def is_pm_or_boss(user, project=None):
    """Foydalanuvchi Boshliq, Tizim Admini yoki PM (Loyiha menejeri) ekanligini tekshiradi."""
    if not user or not user.is_authenticated:
        return False
    from apps.accounts.models import GlobalRole, Specialty
    if getattr(user, "is_boss", False) or getattr(user, "is_platform_admin", False):
        return True
    if getattr(user, "global_role", None) in (GlobalRole.BOSS, GlobalRole.ADMIN, GlobalRole.MANAGER):
        return True
    if getattr(user, "specialty", None) == Specialty.PM:
        return True
    if project:
        if getattr(project, "manager_id", None) == user.id:
            return True
        from apps.projects.models import ProjectRole
        if hasattr(project, "_prefetched_objects_cache") and "memberships" in project._prefetched_objects_cache:
            for m in project.memberships.all():
                if m.is_active and m.user_id == user.id and m.role in (ProjectRole.MANAGER, ProjectRole.ADMIN):
                    return True
        else:
            from apps.projects.models import ProjectMember
            if ProjectMember.objects.filter(
                project=project, user=user, is_active=True, role__in=[ProjectRole.MANAGER, ProjectRole.ADMIN]
            ).exists():
                return True
    return False


def is_task_created_by_pm_or_boss(task):
    """Vazifa PM yoki Boshliq tomonidan berilganmi (yaratilganmi)."""
    if not task or not task.created_by_id:
        return False
    return is_pm_or_boss(task.created_by, task.project)


def can_edit_task(user, task, access=None):
    """Vazifani tahrirlash huquqi tekshiruvi.

    Qoida: PM va Boshliq bergan ishlarni PM va Boshliqdan boshqa hech kim tahrirlay olmaydi.
    Boshqa vazifalar uchun (masalan ijrochi o'zi ochgan vazifa) tegishli jamoa a'zolari va ijrochilar tahrirlashi mumkin.
    """
    if not user or not user.is_authenticated:
        return False
    if task.deleted_at is not None or getattr(task.project, "deleted_at", None) is not None:
        return False

    # Agar vazifani PM yoki Boshliq bergan bo'lsa:
    if is_task_created_by_pm_or_boss(task):
        return is_pm_or_boss(user, task.project)

    # Agar vazifani PM yoki Boshliq bermagan bo'lsa:
    if access is None:
        from apps.projects.permissions import ProjectAccess
        access = ProjectAccess(user, task.project)

    is_assignee = task.assignments.filter(user_id=user.id, is_active=True).exists() if hasattr(task, "assignments") else False
    return bool(
        access.can_manage
        or access.is_member
        or is_assignee
        or task.created_by_id == user.id
        or is_pm_or_boss(user, task.project)
    )


def can_manage_task_team(user, task, access=None):
    """Vazifaning jamoa a'zolarini o'zgartirish huquqi."""
    return can_edit_task(user, task, access)

