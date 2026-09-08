"""Buyurtma (O'zgartirish so'rovi / TZ) ma'lumotlarini rasmiy Word (.docx) blankiga eksport qilish.

Asos: C:\\Users\\sh.temirov\\Desktop\\Буюртма.docx
"""
import io
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls


def set_cell_border(cell, **kwargs):
    """Katak chetlariga hoshiya (border) qo'yish."""
    tcPr = cell._element.get_or_add_tcPr()
    tcBorders = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>\n'
        f'<w:top w:val="single" w:sz="4" w:space="0" w:color="A0AEC0"/>\n'
        f'<w:left w:val="single" w:sz="4" w:space="0" w:color="A0AEC0"/>\n'
        f'<w:bottom w:val="single" w:sz="4" w:space="0" w:color="A0AEC0"/>\n'
        f'<w:right w:val="single" w:sz="4" w:space="0" w:color="A0AEC0"/>\n'
        f'</w:tcBorders>'
    )
    tcPr.append(tcBorders)


def set_cell_background(cell, fill_hex):
    """Katak orqa fonini bo'yash."""
    tcPr = cell._element.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)


def generate_order_docx(order) -> io.BytesIO:
    """ChangeRequest ob'ektidan to'liq rasmiy Word hujjati yasaydi."""
    doc = docx.Document()

    # Sahifa chekkalari (1.5 sm)
    for section in doc.sections:
        section.top_margin = Inches(0.5)
        section.bottom_margin = Inches(0.5)
        section.left_margin = Inches(0.6)
        section.right_margin = Inches(0.6)

    # 1. Sarlavha jadvali
    t_head = doc.add_table(rows=1, cols=1)
    t_head.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell_h = t_head.rows[0].cells[0]
    set_cell_background(cell_h, "1E3A8A")
    p_h = cell_h.paragraphs[0]
    p_h.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_h1 = p_h.add_run("AXBOROT TIZIMIGA O'ZGARTIRISH KIRITISH BO'YICHA SO'ROV BLANKASI\n")
    r_h1.bold = True
    r_h1.font.size = Pt(13)
    r_h1.font.color.rgb = RGBColor(255, 255, 255)
    r_h2 = p_h.add_run("Har bir yangi funksiya yoki texnik topshiriq (TZ) uchun alohida to'ldiriladi")
    r_h2.italic = True
    r_h2.font.size = Pt(9.5)
    r_h2.font.color.rgb = RGBColor(226, 232, 240)

    doc.add_paragraph()

    # Loyiha nomi
    project_str = f"{order.project.name} ({order.project.key})" if getattr(order, "project", None) else "Umumiy tizim"
    pm_name = ""
    if getattr(order, "project", None) and order.project.manager:
        pm_name = order.project.manager.full_name

    # 2. Metama'lumotlar jadvali (3 qator, 4 ustun)
    t_meta = doc.add_table(rows=3, cols=4)
    t_meta.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_rows = [
        [
            ("Tizim nomi:", order.system_name),
            ("Modul:", order.module or "-"),
            ("Talabnoma №:", order.request_no),
            ("Sana:", str(order.request_date)),
        ],
        [
            ("Tegishli loyiha:", project_str),
            ("Loyiha PM:", pm_name or (order.assigned_pm.full_name if order.assigned_pm else "-")),
            ("Bo'linma:", order.department),
            ("Mas'ul shaxs:", order.responsible_person),
        ],
        [
            ("Ustuvorligi / Muhimlilik:", order.get_priority_display()),
            ("Kerakli muddat:", str(order.due_date or "-")),
            ("Qanchada tugashi (PM):", order.pm_estimated_duration or "-"),
            ("PM muddati:", str(order.pm_deadline or "-")),
        ],
    ]
    for r_idx, row_data in enumerate(meta_rows):
        for c_idx, (label, val) in enumerate(row_data):
            cell = t_meta.rows[r_idx].cells[c_idx]
            set_cell_border(cell)
            set_cell_background(cell, "F8FAFC" if r_idx % 2 == 0 else "FFFFFF")
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r1 = p.add_run(f"{label}\n")
            r1.bold = True
            r1.font.size = Pt(9)
            r1.font.color.rgb = RGBColor(71, 85, 105)
            r2 = p.add_run(str(val))
            r2.font.size = Pt(10)
            r2.font.color.rgb = RGBColor(15, 23, 42)

    doc.add_paragraph()

    def add_section_box(title_num, title_text, items):
        t = doc.add_table(rows=1 + len(items), cols=1)
        t.alignment = WD_TABLE_ALIGNMENT.CENTER

        # Sarlavha
        cell_title = t.rows[0].cells[0]
        set_cell_background(cell_title, "2563EB")
        p_title = cell_title.paragraphs[0]
        p_title.paragraph_format.space_before = Pt(3)
        p_title.paragraph_format.space_after = Pt(3)
        r_t = p_title.add_run(f"{title_num}  {title_text.upper()}")
        r_t.bold = True
        r_t.font.size = Pt(10.5)
        r_t.font.color.rgb = RGBColor(255, 255, 255)

        # Qismlar
        for idx, (sub_label, content) in enumerate(items, start=1):
            cell_body = t.rows[idx].cells[0]
            set_cell_border(cell_body)
            set_cell_background(cell_body, "FFFFFF" if idx % 2 == 1 else "F8FAFC")
            p_b = cell_body.paragraphs[0]
            p_b.paragraph_format.space_before = Pt(4)
            p_b.paragraph_format.space_after = Pt(4)
            r_sl = p_b.add_run(f"{sub_label}\n")
            r_sl.bold = True
            r_sl.font.size = Pt(9.5)
            r_sl.font.color.rgb = RGBColor(30, 41, 59)
            r_c = p_b.add_run(content if content else "(To'ldirilmagan)")
            r_c.font.size = Pt(10)
            r_c.font.color.rgb = RGBColor(51, 65, 85)

        doc.add_paragraph()

    # 1. Tizimga qo'shimcha va o'zgartirish kiritish
    add_section_box(
        "1",
        "Tizimga qo'shimcha va o'zgartirish kiritish",
        [
            ("1.1 Joriy holat (nima ishlamayapti / nimani o'zgartirish kerak):", order.current_state),
            ("1.2 Talab qilinayotgan o'zgartirish (aniq va batafsil tavsif):", order.requested_change),
            ("1.3 Sabab / maqsad (qonun talabi, biznes ehtiyoji, xato va h.k.):", order.reason),
        ],
    )

    # 2. Ta'sir doirasi
    add_section_box(
        "2",
        "Ta'sir doirasi",
        [
            ("2.1 Qaysi modul / funksionallikka ta'sir qiladi:", order.affected_modules or "-"),
            ("2.2 Bog'liq tizimlar / integratsiyalar:", order.dependent_systems or "-"),
            ("2.3 Foydalanuvchiga ko'rinadigan o'zgarishmi yoki ichki (backend)?", order.get_change_nature_display()),
        ],
    )

    # 3. Qo'shimcha materiallar va biriktirilgan TZ fayli
    tz_file_info = ""
    if order.tz_file_name:
        tz_file_info = f"Biriktirilgan TZ fayli: {order.tz_file_name} ({order.tz_file_size_display})\n"

    materials_text = (tz_file_info + (order.additional_materials or "")).strip()
    add_section_box(
        "3",
        "Qo'shimcha materiallar (Ilovalar va TZ fayli)",
        [
            ("Skrinshotlar, xato xabarlari, texnik topshiriq fayli, namuna hujjatlar:", materials_text or "Mavjud emas"),
        ],
    )

    # 4. O'zgarishni test qilish
    add_section_box(
        "4",
        "O'zgarishni test qilish (Buyurtmachi tomonidan test qilinadi)",
        [
            ("4.1 Test qilish natijasi:", order.test_result or "Hali test qilinmagan"),
        ],
    )

    # 5. Tasdiqlash
    t_sign_title = doc.add_table(rows=1, cols=1)
    t_sign_title.alignment = WD_TABLE_ALIGNMENT.CENTER
    c_st = t_sign_title.rows[0].cells[0]
    set_cell_background(c_st, "2563EB")
    p_st = c_st.paragraphs[0]
    p_st.paragraph_format.space_before = Pt(3)
    p_st.paragraph_format.space_after = Pt(3)
    r_st = p_st.add_run("5  TASDIQLASH VA IJRO (PM tomonidan belgilanadi)")
    r_st.bold = True
    r_st.font.size = Pt(10.5)
    r_st.font.color.rgb = RGBColor(255, 255, 255)

    t_sign = doc.add_table(rows=2, cols=2)
    t_sign.alignment = WD_TABLE_ALIGNMENT.CENTER

    signer_val = order.client_signer or f"{order.responsible_person}, {order.request_date}"
    executor_val = order.executor_signer or (order.assigned_pm.full_name if order.assigned_pm else f"Qabul qilingan ({order.get_status_display()})")
    time_val = order.pm_estimated_duration or order.estimated_resources or "Ko'rib chiqilmoqda"
    deadline_val = f"Yakuniy muddat: {order.pm_deadline}" if order.pm_deadline else "Muddat hali belgilanmagan"
    exec_full = f"{executor_val}\nQanchada tugashi: {time_val}\n{deadline_val}"
    if order.pm_notes:
        exec_full += f"\nPM izohi: {order.pm_notes}"

    sign_cells = [
        [("Buyurtmachi (Sohaviy boshqarma):", signer_val), ("Ijrochi / Loyiha menejeri (PM):", exec_full)],
        [("Holati:", order.get_status_display()), ("Baholangan vaqt / Resurslar:", time_val)],
    ]

    for r_i, row in enumerate(sign_cells):
        for c_i, (lbl, val) in enumerate(row):
            c = t_sign.rows[r_i].cells[c_i]
            set_cell_border(c)
            set_cell_background(c, "F8FAFC" if r_i % 2 == 0 else "FFFFFF")
            p = c.paragraphs[0]
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(4)
            r1 = p.add_run(f"{lbl}\n")
            r1.bold = True
            r1.font.size = Pt(9.5)
            r2 = p.add_run(str(val))
            r2.font.size = Pt(9.5)
            r2.italic = True

    bio = io.BytesIO()
    doc.save(bio)
    bio.seek(0)
    return bio
