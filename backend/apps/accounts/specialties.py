"""Mutaxassisliklar va ularga bog'liq xususiyatlar.

Ro'yxatdan o'tishda har bir foydalanuvchi mutaxassislik tanlaydi.
Shu tanlov keyin butun tizimga ta'sir qiladi:
  - loyihada qaysi vazifalar unga tavsiya etiladi
  - menejer vazifa berayotganda mos odamlarni ko'radi
  - loyiha "kerakli mutaxassisliklar" ro'yxati bilan e'lon qilinadi
  - profil taklif qilinadigan ko'nikmalar bilan to'ldiriladi
"""
from django.db import models


class Specialty(models.TextChoices):
    DEVELOPER = "DEVELOPER", "Dasturchi"
    SOHAVIY = "SOHAVIY", "Boshqarmalar"
    PM = "PM", "Loyiha menejeri"
    OTHER = "OTHER", "Boshqa"


class Seniority(models.TextChoices):
    INTERN = "INTERN", "Stajyor"
    JUNIOR = "JUNIOR", "Junior"
    MIDDLE = "MIDDLE", "Middle"
    SENIOR = "SENIOR", "Senior"
    LEAD = "LEAD", "Lead / Arxitektor"


# Har bir mutaxassislik uchun tizim xususiyatlari
SPECIALTY_PROFILE = {
    Specialty.DEVELOPER: {
        "icon": "</>",
        "color": "#2f81f7",
        "skills": ["Backend", "Frontend", "Fullstack", "Mobile", "DevOps", "QA", "Database"],
        "task_types": ["FEATURE", "BUG", "CHORE", "RESEARCH"],
        "default_project_role": "DEVELOPER",
        "focus": "Dasturiy ta'minot yaratish, kod yozish va tizimlarni ishlab chiqish",
        "checklist": [
            "Kod yozildi va tekshirildi",
            "Xatolik holatlari qayta ishlandi",
            "Testlar o'tdi",
            "Hujjatlashtirildi",
        ],
    },
    Specialty.SOHAVIY: {
        "icon": "[S]",
        "color": "#0284c7",
        "skills": ["Buyurtmalar", "Talablar tahlili", "Boshqarma nazorati", "Texnik talabnoma"],
        "task_types": ["FEATURE", "BUG", "DOCS"],
        "default_project_role": "VIEWER",
        "focus": "Sohaviy boshqarmalar bo'yicha tizimga o'zgartirish kiritish buyurtmalari",
        "checklist": [
            "Buyurtma asosi va maqsadi keltirilgan",
            "Joriy holat va talab qilinayotgan o'zgartirish batafsil yozilgan",
            "Mas'ul shaxs va talab etiladigan muddat ko'rsatilgan",
        ],
    },
    Specialty.PM: {
        "icon": "= >",
        "color": "#8b949e",
        "skills": ["Rejalashtirish", "Agile", "Risk boshqaruvi", "Kommunikatsiya"],
        "task_types": ["CHORE", "DOCS", "RESEARCH"],
        "default_project_role": "MANAGER",
        "focus": "Rejalashtirish, jamoa va muddatlar",
        "checklist": [
            "Vazifa aniq tavsiflangan",
            "Ijrochi va muddat belgilangan",
            "Bog'liqliklar ko'rsatilgan",
        ],
    },
    Specialty.OTHER: {
        "icon": "*",
        "color": "#a371f7",
        "skills": ["Umumiy ko'nikmalar", "Hujjatlar", "Tahlil"],
        "task_types": ["DOCS", "RESEARCH", "CHORE"],
        "default_project_role": "DEVELOPER",
        "focus": "Boshqa yo'nalishlar va qo'llab-quvvatlash vazifalari",
        "checklist": [
            "Vazifa shartlari bajarildi",
            "Natijalar hujjatlashtirildi",
        ],
    },
}


def profile_for(specialty):
    """Mutaxassislik uchun xususiyatlar to'plami."""
    if specialty in SPECIALTY_PROFILE:
        return SPECIALTY_PROFILE[specialty]
    # Eskidan qolgan mutaxassisliklarni moslashtirish
    if specialty in ("BACKEND", "FRONTEND", "FULLSTACK", "MOBILE", "DEVOPS", "QA", "DESIGNER", "DATA", "SECURITY"):
        return SPECIALTY_PROFILE[Specialty.DEVELOPER]
    if specialty in ("ANALYST",):
        return SPECIALTY_PROFILE[Specialty.OTHER]
    try:
        from apps.accounts.models import SpecialtyItem
        item = SpecialtyItem.objects.filter(code=specialty).first()
        if item:
            skills = [s.strip() for s in item.skills.split(",") if s.strip()] if item.skills else []
            return {
                "icon": item.icon or "*",
                "color": item.color or "#2563eb",
                "skills": skills,
                "task_types": ["FEATURE", "BUG", "CHORE"],
                "default_project_role": "DEVELOPER",
                "focus": item.name,
                "checklist": [],
            }
    except Exception:
        pass
    return {
        "icon": "*", "color": "#8b949e", "skills": [], "task_types": [],
        "default_project_role": "DEVELOPER", "focus": "", "checklist": [],
    }


def specialty_catalog():
    """Frontend va tizim uchun to'liq katalog - standart va yangi qo'shilgan mutaxassisliklar."""
    from apps.accounts.models import SpecialtyItem
    out = []
    seen = set()

    # 1. Bazadagi barcha faol mutaxassisliklar (Admin qo'shganlar birinchi navbatda)
    try:
        items = list(SpecialtyItem.objects.filter(is_active=True).order_by("order", "id"))
        for item in items:
            p = profile_for(item.code)
            skills = [s.strip() for s in item.skills.split(",") if s.strip()] if item.skills else p.get("skills", [])
            out.append({
                "value": item.code,
                "label": item.name,
                "icon": item.icon or p.get("icon", "*"),
                "color": item.color or p.get("color", "#2563eb"),
                "skills": skills,
                "task_types": p.get("task_types", ["FEATURE", "BUG", "CHORE"]),
                "default_project_role": p.get("default_project_role", "DEVELOPER"),
                "focus": p.get("focus", ""),
                "checklist": p.get("checklist", []),
            })
            seen.add(item.code)
    except Exception:
        pass

    # 2. Standart tanlovlardan bazada hali kiritilmaganlari
    for value, label in Specialty.choices:
        if value in seen:
            continue
        p = profile_for(value)
        out.append({
            "value": value,
            "label": label,
            "icon": p["icon"],
            "color": p["color"],
            "skills": p["skills"],
            "task_types": p["task_types"],
            "default_project_role": p["default_project_role"],
            "focus": p["focus"],
            "checklist": p["checklist"],
        })
        seen.add(value)

    return out

