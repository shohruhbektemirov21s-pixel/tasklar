"""Tarixni yozish uchun yagona kirish nuqtasi.

Barcha viewlar shu funksiyani chaqiradi - shunda tarix bir xil formatda,
tola va ishonchli boladi.
"""
import logging

logger = logging.getLogger(__name__)


def log(actor=None, verb="", summary="", *, project=None, task=None, workspace=None,
        target=None, detail="", meta=None):
    from .models import Activity

    if task is not None and project is None:
        project = task.project
    if project is not None and workspace is None:
        workspace = project.workspace

    try:
        return Activity.objects.create(
            actor=actor if (actor and getattr(actor, "pk", None)) else None,
            verb=verb,
            summary=summary[:300],
            detail=detail or "",
            meta=meta or {},
            project=project,
            task=task,
            workspace=workspace,
            target_label=str(target)[:200] if target is not None else "",
        )
    except Exception:  # tarix yozilmasa ham asosiy amal buzilmasin
        logger.exception("Tarixga yozib bolmadi: %s", verb)
        return None


def _format_change_val(val):
    if val is None or val == "":
        return "-"
    if hasattr(val, "strftime"):
        return val.strftime("%d.%m.%Y %H:%M")
    return str(val)


def log_field_changes(actor, task, changes):
    """Task maydonlari ozgarganda birma-bir emas, bitta yozuvda saqlaymiz."""
    if not changes:
        return None
    parts = []
    for field, (old, new) in changes.items():
        parts.append("{}: {} -> {}".format(field, _format_change_val(old), _format_change_val(new)))
    return log(
        actor=actor, verb="task.updated", task=task,
        summary="{} tahrirlandi".format(task.code),
        detail="; ".join(parts),
        meta={"changes": {k: [_format_change_val(v[0]), _format_change_val(v[1])] for k, v in changes.items()}},
    )

