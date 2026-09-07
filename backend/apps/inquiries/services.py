"""So'rovlar bo'yicha bildirishnomalar."""
import logging

from apps.notifications.models import NotificationKind
from apps.notifications.services import notify, notify_many

from .models import InquiryScope, InquiryStatus

logger = logging.getLogger(__name__)

URL = "/sorovlar"


def _bosses(exclude_id=None):
    """Qaror qiladigan odamlar — faol boshliqlar."""
    from apps.accounts.models import GlobalRole, User

    qs = User.objects.filter(global_role=GlobalRole.BOSS, is_active=True)
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    return list(qs)


def notify_new(inquiry):
    """Yangi so'rov — boshliqqa."""
    author = None if inquiry.is_anonymous else inquiry.author
    who = "Anonim" if inquiry.is_anonymous else inquiry.author.full_name
    if inquiry.scope == InquiryScope.CLOSED:
        who = "{} · yopiq".format(who)

    return notify_many(
        _bosses(exclude_id=inquiry.author_id),
        NotificationKind.INQUIRY_NEW,
        title="Yangi so'rov: {}".format(inquiry.title),
        body=who,
        url=URL,
        actor=author,
        meta={"inquiry": inquiry.pk},
    )


_TITLES = {
    InquiryStatus.APPROVED: "So'rovingiz tasdiqlandi",
    InquiryStatus.REJECTED: "So'rovingiz rad etildi",
}


def notify_decision(inquiry, actor, status_changed):
    """Boshliqning qarori yoki izohi — so'rov muallifiga."""
    if status_changed:
        title = _TITLES.get(inquiry.status, "So'rovingiz bo'yicha qaror")
    else:
        title = "So'rovingizga izoh qoldirildi"

    return notify(
        inquiry.author,
        NotificationKind.INQUIRY_DECIDED,
        title=title,
        body=inquiry.decision_note or inquiry.title,
        url=URL,
        actor=actor,
        meta={"inquiry": inquiry.pk, "status": inquiry.status},
    )
