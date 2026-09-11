"""Botga kelgan xabarlarga javob va buyruqlarni boshqarish.

Mavjud buyruqlar:
- /start — Telegram hisobini TeamFlow profiliga bog'lash va salomlashish
- /vazifalarim — Foydalanuvchiga biriktirilgan faol vazifalar ro'yxati
- /buyurtmalar — Foydalanuvchi bilan bog'liq buyurtmalar (TZ) ro'yxati
- /bugun — Muddati bugungi va kechikkan ishlar (vazifalar va buyurtmalar)
- /tekshiruv — Tekshiruv kutayotgan vazifalar va buyurtmalar
- /uzish — Telegram bog'lanishini uzish
- /yordam, /help — Yordam va buyruqlar ma'lumotnomasi
"""
import logging
from datetime import datetime, time as dtime

from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from . import client
from .models import TelegramLink, normalize_username, user_lookup
from .services import app_url, esc

logger = logging.getLogger(__name__)

MAX_ROWS = 10

HELP_TEXT = (
    "<b>TeamFlow bot buyruqlari:</b>\n\n"
    "📋 /vazifalarim — Menga biriktirilgan ochiq vazifalar\n"
    "📑 /buyurtmalar — Men bilan bog'liq faol buyurtmalar (TZ)\n"
    "⏰ /bugun — Bugungi va muddati o'tgan ishlar\n"
    "🔍 /tekshiruv — Tekshiruv navbatidagi ishlar\n"
    "🔌 /uzish — Telegram bog'lanishini uzish\n"
    "❓ /yordam — Ushbu yordam xabari"
)

WELCOME = (
    "<b>Salom, {name}!</b> 👋\n\n"
    "Telegram hisobingiz TeamFlow tizimiga muvaffaqiyatli bog'landi. "
    "Endi barcha yangi topshiriqlar, izohlar va bildirishnomalar shu yerga yetkaziladi.\n\n"
    + HELP_TEXT
)

NOT_LINKED = (
    "Bu Telegram akkaunti hech qaysi TeamFlow hisobiga bog'lanmagan.\n\n"
    "<b>Bog'lash yo'riqnomasi:</b>\n"
    "1. TeamFlow ilovasiga kiring;\n"
    "2. <b>Profil</b> → <b>Tahrirlash</b> sahifasini oching;\n"
    "3. Telegram maydoniga <code>{name}</code> deb yozing va saqlang;\n"
    "4. Shu yerga qaytib /start buyrug'ini bosing."
)

NO_USERNAME = (
    "Telegram akkauntingizda username yo'q.\n\n"
    "Iltimos, Telegram sozlamalaridan o'zingizga username qo'ying, "
    "keyin TeamFlow profilingizga o'sha nomni kiritib, shu yerga qaytib /start bosing."
)


def _unfinished_tasks():
    from apps.tasks.models import TaskStatus

    return [
        TaskStatus.TODO,
        TaskStatus.IN_PROGRESS,
        TaskStatus.IN_REVIEW,
        TaskStatus.CHANGES_REQUESTED,
        TaskStatus.BLOCKED,
    ]


def _unfinished_orders():
    from apps.orders.models import ChangeRequestStatus

    return [
        ChangeRequestStatus.NEW,
        ChangeRequestStatus.ACCEPTED,
        ChangeRequestStatus.ASSIGNED_TO_DEV,
        ChangeRequestStatus.IN_PROGRESS,
        ChangeRequestStatus.TESTING,
        ChangeRequestStatus.READY_FOR_REVIEW,
    ]


def _my_tasks(user):
    """Foydalanuvchiga biriktirilgan, o'chirilmagan loyihalardagi faol ishlar."""
    from apps.tasks.models import Task, TaskAssignment

    mine = Exists(
        TaskAssignment.objects.filter(
            task=OuterRef("pk"), user=user, is_active=True
        )
    )
    return (
        Task.objects.filter(mine, project__deleted_at__isnull=True)
        .select_related("project")
    )


def _my_orders(user):
    """Foydalanuvchi bilan bog'liq buyurtmalar (sohaviy, PM, dasturchi yoki admin)."""
    from apps.orders.models import ChangeRequest

    if user.is_superuser or user.is_platform_admin or user.is_boss:
        return ChangeRequest.objects.all().select_related("project", "assigned_pm", "assigned_developer")

    return ChangeRequest.objects.filter(
        Q(created_by=user) | Q(assigned_pm=user) | Q(assigned_developer=user)
    ).select_related("project", "assigned_pm", "assigned_developer")


def _task_row(task):
    code = f"{task.project.key}-{task.number}" if task.project else f"T-{task.id}"
    due_str = f" <i>(Muddat: {task.due_date.strftime('%d.%m.%Y')})</i>" if task.due_date else ""
    return f"• <code>{esc(code)}</code> {esc(task.title)} — <b>{esc(task.get_status_display())}</b>{due_str}"


def _order_row(order):
    name = f"{order.system_name}{' — ' + order.module if order.module else ''}"
    due = order.pm_deadline or order.due_date
    due_str = f" <i>(Muddat: {due.strftime('%d.%m.%Y')})</i>" if due else ""
    return f"• <code>{esc(order.request_no)}</code> {esc(name)} — <b>{esc(order.get_status_display())}</b>{due_str}"


# ------------------------------------------------------------------ Buyruqlar

def cmd_start(link, _args):
    return WELCOME.format(name=esc(link.user.full_name))


def cmd_help(_link, _args):
    return HELP_TEXT


def cmd_my_tasks(link, _args):
    tasks = (
        _my_tasks(link.user)
        .filter(status__in=_unfinished_tasks())
        .order_by("-priority", "due_date", "id")
    )
    total = tasks.count()
    if not total:
        return "<b>Mening ochiq vazifalarim</b>\n\nSizga biriktirilgan faol vazifalar yo'q. Baraka toping!"

    items = list(tasks[:MAX_ROWS])
    rows = [_task_row(t) for t in items]
    text = f"<b>Mening ochiq vazifalarim ({total} ta):</b>\n\n" + "\n".join(rows)
    if total > MAX_ROWS:
        text += f"\n\n<i>… va yana {total - MAX_ROWS} ta vazifa. To'liq ro'yxat ilovada.</i>"
    return text


def cmd_my_orders(link, _args):
    orders = (
        _my_orders(link.user)
        .filter(status__in=_unfinished_orders())
        .order_by("-created_at")
    )
    total = orders.count()
    if not total:
        return "<b>Mening buyurtmalarim</b>\n\nSiz bilan bog'liq faol buyurtmalar (TZ) mavjud emas."

    items = list(orders[:MAX_ROWS])
    rows = [_order_row(o) for o in items]
    text = f"<b>Faol buyurtmalar ({total} ta):</b>\n\n" + "\n".join(rows)
    if total > MAX_ROWS:
        text += f"\n\n<i>… va yana {total - MAX_ROWS} ta buyurtma. To'liq ro'yxat ilovada.</i>"
    return text


def cmd_today(link, _args):
    today = timezone.localdate()
    day_end = timezone.make_aware(datetime.combine(today, dtime.min)) + timezone.timedelta(days=1)

    tasks = (
        _my_tasks(link.user)
        .filter(status__in=_unfinished_tasks(), due_date__lt=day_end)
        .order_by("due_date", "-priority", "id")
    )
    orders = (
        _my_orders(link.user)
        .filter(
            status__in=_unfinished_orders(),
            due_date__lt=today,
        )
        .order_by("due_date")
    )

    t_count = tasks.count()
    o_count = orders.count()

    if not t_count and not o_count:
        return "<b>Bugungi ishlar</b>\n\nBugun bajarilishi kerak bo'lgan yoki muddati o'tgan ishlar yo'q."

    lines = ["<b>Bugun bajarilishi kerak bo'lgan ishlar:</b>\n"]
    if t_count:
        lines.append(f"<b>Vazifalar ({t_count} ta):</b>")
        lines.extend([_task_row(t) for t in tasks[:MAX_ROWS]])
        if t_count > MAX_ROWS:
            lines.append(f"<i>… yana {t_count - MAX_ROWS} ta vazifa.</i>")
        lines.append("")

    if o_count:
        lines.append(f"<b>Buyurtmalar ({o_count} ta):</b>")
        lines.extend([_order_row(o) for o in orders[:MAX_ROWS]])
        if o_count > MAX_ROWS:
            lines.append(f"<i>… yana {o_count - MAX_ROWS} ta buyurtma.</i>")

    return "\n".join(lines).strip()


def cmd_review(link, _args):
    """Menejer / admin tekshiruvini kutayotgan vazifalar va buyurtmalar."""
    from apps.orders.models import ChangeRequest, ChangeRequestStatus
    from apps.projects.models import Project, ProjectMember, ProjectRole
    from apps.tasks.models import Task, TaskStatus

    user = link.user
    if user.is_platform_admin or user.is_boss:
        tasks = Task.objects.filter(status=TaskStatus.IN_REVIEW, project__deleted_at__isnull=True)
        orders = ChangeRequest.objects.filter(status=ChangeRequestStatus.READY_FOR_REVIEW)
    else:
        managed = Project.objects.filter(
            Q(manager=user)
            | Exists(
                ProjectMember.objects.filter(
                    project=OuterRef("pk"), user=user, is_active=True, role=ProjectRole.MANAGER
                )
            )
        )
        tasks = Task.objects.filter(status=TaskStatus.IN_REVIEW, project__in=managed)
        orders = ChangeRequest.objects.filter(
            status=ChangeRequestStatus.READY_FOR_REVIEW,
            assigned_pm=user,
        )

    t_count = tasks.count()
    o_count = orders.count()

    if not t_count and not o_count:
        return "<b>Tekshiruv navbati</b>\n\nTekshiruv kutayotgan vazifalar yoki buyurtmalar yo'q."

    lines = ["<b>Tekshiruv navbati:</b>\n"]
    if t_count:
        lines.append(f"<b>Vazifalar ({t_count} ta):</b>")
        lines.extend([_task_row(t) for t in tasks.select_related("project")[:MAX_ROWS]])
        lines.append("")

    if o_count:
        lines.append(f"<b>Buyurtmalar ({o_count} ta):</b>")
        lines.extend([_order_row(o) for o in orders[:MAX_ROWS]])

    return "\n".join(lines).strip()


def cmd_unlink(link, _args):
    link.delete()
    return (
        "Telegram hisobingiz TeamFlow dan muvaffaqiyatli uzildi.\n\n"
        "Qayta ulash uchun istalgan vaqtda shu yerga /start buyrug'ini yuboring."
    )


COMMANDS = {
    "start": cmd_start,
    "yordam": cmd_help,
    "help": cmd_help,
    "vazifalarim": cmd_my_tasks,
    "buyurtmalar": cmd_my_orders,
    "bugun": cmd_today,
    "tekshiruv": cmd_review,
    "uzish": cmd_unlink,
}


def _bind(chat, username):
    """Kelgan xabarni foydalanuvchi hisobiga moslaydi va bog'laydi."""
    from django.contrib.auth import get_user_model

    name = normalize_username(username)
    chat_id = chat.get("id")
    if not name or not chat_id:
        return None

    User = get_user_model()
    user = User.objects.filter(user_lookup(name), is_active=True).first()
    if user is None:
        return None

    link = TelegramLink.objects.filter(user=user).first()
    if link is not None and link.chat_id == chat_id:
        return link

    # Unikal chat_id bo'yicha tozalash
    TelegramLink.objects.filter(chat_id=chat_id).delete()
    TelegramLink.objects.filter(user=user).delete()
    return TelegramLink.objects.create(user=user, chat_id=chat_id)


def handle(update):
    """Bitta yangilikni (xabarni) qayta ishlaydi. Javob yuborilsa `True`."""
    message = (update or {}).get("message") or {}
    chat = message.get("chat") or {}
    sender = message.get("from") or {}
    text = (message.get("text") or "").strip()

    chat_id = chat.get("id")
    if not chat_id or not text:
        return False

    link = _bind(chat, sender.get("username"))

    # Agar hisob bog'lanmagan bo'lsa
    if link is None:
        who = sender.get("username")
        reply = NOT_LINKED.format(name=esc(who)) if who else NO_USERNAME
        client.send_message(chat_id, reply)
        return True

    # Buyruqni aniqlash (/vazifalarim@bot -> vazifalarim)
    if text.startswith("/"):
        raw_cmd = text.split()[0][1:].split("@")[0].lower()
        args = text.split()[1:]
        handler = COMMANDS.get(raw_cmd)
        if handler is not None:
            try:
                reply = handler(link, args)
            except Exception:
                logger.exception("Telegram buyrug'i bajarilmadi: /%s", raw_cmd)
                reply = "Buyruqni bajarishda xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring."
        else:
            reply = f"Bunday buyruq mavjud emas: <code>/{esc(raw_cmd)}</code>\n\n" + HELP_TEXT
    else:
        # Oddiy matn kiritilganda
        reply = (
            f"Assalomu alaykum, <b>{esc(link.user.full_name)}</b>!\n\n"
            "Kerakli ma'lumotni olish uchun quyidagi buyruqlardan foydalaning:\n\n"
            + HELP_TEXT
        )

    buttons = None
    url = app_url("/panel")
    if url:
        buttons = [[("🌐 TeamFlow ilovasini ochish", url)]]

    client.send_message(chat_id, reply, buttons=buttons)
    return True
