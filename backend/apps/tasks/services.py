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
from apps.notifications.services import notify_many, send_to_users
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
    from apps.accounts.models import GlobalRole

    members = set(
        task.project.memberships.filter(is_active=True)
        .exclude(user__global_role__in=[GlobalRole.ADMIN, GlobalRole.BOSS])
        .exclude(user__is_superuser=True)
        .values_list("user_id", flat=True)
    )
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
