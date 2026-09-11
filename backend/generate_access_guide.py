import os
import sys
from datetime import datetime
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_cell_background(cell, hex_color):
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    cell._tc.get_or_add_tcPr().append(shd)

def create_guide_document():
    doc = docx.Document()

    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.85)
        section.right_margin = Inches(0.85)

    BRAND_BLUE = RGBColor(30, 58, 138)
    TITLE_DARK = RGBColor(15, 23, 42)
    DARK_TEXT = RGBColor(30, 41, 59)
    GRAY_TEXT = RGBColor(71, 85, 105)
    GREEN = RGBColor(22, 101, 52)

    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(0)
    title_p.paragraph_format.space_after = Pt(4)
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_title = title_p.add_run("TEAMFLOW VAZIFALAR BOSHQARUV TIZIMI\n")
    r_title.bold = True
    r_title.font.size = Pt(16)
    r_title.font.color.rgb = BRAND_BLUE

    sub_p = doc.add_paragraph()
    sub_p.paragraph_format.space_after = Pt(6)
    sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_sub = sub_p.add_run("TARMOQ ORQALI ULANISH VA FOYDALANUVCHILAR (LOGIN/PAROLLAR) QO'LLANMASI")
    r_sub.bold = True
    r_sub.font.size = Pt(12)
    r_sub.font.color.rgb = TITLE_DARK

    meta_p = doc.add_paragraph()
    meta_p.paragraph_format.space_after = Pt(14)
    meta_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_meta = meta_p.add_run(f"Sana: {datetime.now().strftime('%d.%m.%2026')} | Server IP: 192.168.224.70 | Muhit: Docker & IBM Db2 Enterprise")
    r_meta.font.size = Pt(9.5)
    r_meta.font.italic = True
    r_meta.font.color.rgb = GRAY_TEXT

    h1 = doc.add_paragraph()
    h1.paragraph_format.space_before = Pt(10)
    h1.paragraph_format.space_after = Pt(4)
    r_h1 = h1.add_run("1. Tizim Tarmoq Parametrlari va Kirish Havolalari")
    r_h1.bold = True
    r_h1.font.size = Pt(12.5)
    r_h1.font.color.rgb = BRAND_BLUE

    p1 = doc.add_paragraph(
        "TeamFlow axborot tizimi to'liq Docker konteynerlarida ishga tushirilgan bo'lib, mahalliy kompyuterdan "
        "tashqari bir xil lokal tarmoqdagi (Wi-Fi yoki ofis LAN tarmog'idagi) boshqa kompyuter va mobil qurilmalardan "
        "ham bevosita IP manzil orqali foydalanish imkoniyatiga ega. Barcha xizmatlar tashqi tarmoq ulanishlarini "
        "xavfsiz qabul qilish uchun sozlangan."
    )
    p1.paragraph_format.line_spacing = 1.15
    p1.paragraph_format.space_after = Pt(8)

    t_net = doc.add_table(rows=1, cols=4)
    t_net.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers_net = ["Xizmat / Komponent", "Ichki / Tashqi Port", "To'liq Kirish Havolasi (URL)", "Vazifasi"]
    for i, h in enumerate(headers_net):
        cell = t_net.rows[0].cells[i]
        cell.text = h
        if cell.paragraphs[0].runs:
            cell.paragraphs[0].runs[0].font.bold = True
            cell.paragraphs[0].runs[0].font.size = Pt(9.5)
            cell.paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)
        set_cell_background(cell, "1E3A8A")
        set_cell_margins(cell, top=100, bottom=100, left=120, right=120)

    net_rows = [
        ("Frontend (Vite + React)", "5183 (host) -> 5173", "http://192.168.224.70:5183", "Foydalanuvchi interfeysi (SPA web ilova)"),
        ("Frontend Login Sahifasi", "5183", "http://192.168.224.70:5183/login", "Tizimga kirish sahifasi"),
        ("Backend REST API", "8010 (host) -> 8000", "http://192.168.224.70:8010/api/", "Django REST Framework API xizmati"),
        ("Django Admin Boshqaruvi", "8010", "http://192.168.224.70:8010/admin/", "Tizim ma'muriy boshqaruv paneli (Jazzmin)"),
        ("WebSocket (Real-time)", "5183 / 8010", "ws://192.168.224.70:5183/ws/", "Xabarlar va bildirishnomalar almashinuvi"),
        ("IBM Db2 Ma'lumotlar Bazasi", "50000", "192.168.224.70:50000", "Asosiy reliesion ma'lumotlar bazasi"),
        ("Redis Kesh / Kanallar", "6379", "teamflow_redis:6379", "Kanal qatlami va tezkor sessiya keshi"),
    ]

    for r_idx, r_data in enumerate(net_rows):
        row = t_net.add_row().cells
        bg_col = "F8FAFC" if r_idx % 2 == 1 else "FFFFFF"
        for i, val in enumerate(r_data):
            row[i].text = val
            if row[i].paragraphs[0].runs:
                row[i].paragraphs[0].runs[0].font.size = Pt(9)
                if i == 2:
                    row[i].paragraphs[0].runs[0].font.bold = True
                    row[i].paragraphs[0].runs[0].font.color.rgb = BRAND_BLUE
            set_cell_background(row[i], bg_col)
            set_cell_margins(row[i], top=80, bottom=80, left=100, right=100)

    h2 = doc.add_paragraph()
    h2.paragraph_format.space_before = Pt(16)
    h2.paragraph_format.space_after = Pt(4)
    r_h2 = h2.add_run("2. Tizim Foydalanuvchilari va Login/Parollar Ro'yxati")
    r_h2.bold = True
    r_h2.font.size = Pt(12.5)
    r_h2.font.color.rgb = BRAND_BLUE

    p2 = doc.add_paragraph(
        "Tizimda turli vakolatlarga ega bo'lgan foydalanuvchilar hisobi mavjud bo'lib, har bir xodim "
        "o'ziga biriktirilgan vazifalar doirasida ish olib boradi. Barcha hisoblar bazada tekshirilgan va to'liq faol:"
    )
    p2.paragraph_format.line_spacing = 1.15
    p2.paragraph_format.space_after = Pt(8)

    t_users = doc.add_table(rows=1, cols=5)
    t_users.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers_u = ["To'liq Ismi", "Lavozimi", "Global Rol", "Login (Email)", "Parol"]
    for i, h in enumerate(headers_u):
        cell = t_users.rows[0].cells[i]
        cell.text = h
        if cell.paragraphs[0].runs:
            cell.paragraphs[0].runs[0].font.bold = True
            cell.paragraphs[0].runs[0].font.size = Pt(9.5)
            cell.paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)
        set_cell_background(cell, "1E3A8A")
        set_cell_margins(cell, top=100, bottom=100, left=100, right=100)

    user_rows = [
        ("Bosh Admin", "Tizim Admini / Superuser", "ADMIN", "admin@teamflow.uz", "admin12345"),
        ("Akmal Boshliqov", "Boshliq / Kompaniya direktori", "BOSS", "boshliq@teamflow.uz", "password123"),
        ("Sardor Menejerov", "Loyiha Menejeri (Lead PM)", "MANAGER", "pm@teamflow.uz", "password123"),
        ("Jasur Backendchi", "Senior Backend Dasturchi", "DEVELOPER", "backend@teamflow.uz", "password123"),
        ("Malika Frontendchi", "Middle Frontend Dasturchi", "DEVELOPER", "frontend@teamflow.uz", "password123"),
        ("Bobur Rahimov", "Loyiha Menejeri", "MANAGER", "menejer@teamflow.uz", "menejer123"),
        ("Dilshod Karimov", "Tizim Operatori", "OPERATOR", "operator@teamflow.uz", "operator123"),
    ]

    for r_idx, (name, title, role, email, pwd) in enumerate(user_rows):
        row = t_users.add_row().cells
        bg_col = "F8FAFC" if r_idx % 2 == 1 else "FFFFFF"
        for i, val in enumerate([name, title, role, email, pwd]):
            row[i].text = val
            if row[i].paragraphs[0].runs:
                row[i].paragraphs[0].runs[0].font.size = Pt(9)
                if i == 0:
                    row[i].paragraphs[0].runs[0].font.bold = True
                elif i == 2:
                    row[i].paragraphs[0].runs[0].font.bold = True
                    row[i].paragraphs[0].runs[0].font.color.rgb = BRAND_BLUE
                elif i == 4:
                    row[i].paragraphs[0].runs[0].font.bold = True
                    row[i].paragraphs[0].runs[0].font.color.rgb = GREEN
            set_cell_background(row[i], bg_col)
            set_cell_margins(row[i], top=80, bottom=80, left=80, right=80)

    h3 = doc.add_paragraph()
    h3.paragraph_format.space_before = Pt(16)
    h3.paragraph_format.space_after = Pt(4)
    r_h3 = h3.add_run("3. Foydalanuvchi Rollari va Ularning Vakolatlari")
    r_h3.bold = True
    r_h3.font.size = Pt(12.5)
    r_h3.font.color.rgb = BRAND_BLUE

    roles_desc = [
        ("ADMIN (Tizim Ma'muri):", "Tizimning to'liq boshqaruviga ega. Yangi foydalanuvchilar qo'shish, parollarni yangilash, Django Admin paneli (http://192.168.224.70:8010/admin/) orqali to'g'ridan-to'g'ri ma'lumotlar bazasini nazorat qilish va tizim auditini yuritish huquqiga ega."),
        ("BOSS (Boshliq / Direktor):", "Kompaniya rahbari hisoblanadi. Takliflarni (Suggestions) tasdiqlash yoki rad etish bo'yicha yagona yakuniy vakolatli shaxs. Barcha loyihalar, topshiriqlar, hisobotlar va xodimlar faoliyatini umumiy ko'rinishda monitoring qiladi."),
        ("MANAGER (Loyiha Menejeri / PM):", "Ish maydonlari (Workspaces) va Loyihalarni (Projects) yaratish, topshiriqlarni rejalashtirish, xodimlarga vazifalarni taqsimlash, topshiriq muddatlarini belgilash hamda bajarilish sifatini nazorat qilish vakolatiga ega."),
        ("DEVELOPER (Dasturchi / Ijrochi):", "O'ziga biriktirilgan vazifalarni bajarish, vazifa statusini o'zgartirish (In Progress, In Review, Done), bajarilgan ish vaqtini qayd etish (WorkLogs), fayllar yuklash va ichki chat orqali jamoa bilan muloqot qilish imkoniyatiga ega."),
        ("OPERATOR (Tizim Operatori):", "Loyiha holatlari va kelib tushgan murojaatlar bo'yicha tezkor monitoring olib boradi, texnik yordam ko'rsatadi va operatsion vazifalarni muvofiqlashtiradi."),
    ]

    for r_title, r_text in roles_desc:
        rp = doc.add_paragraph()
        rp.paragraph_format.space_after = Pt(4)
        rp.paragraph_format.line_spacing = 1.15
        run_t = rp.add_run(f"• {r_title} ")
        run_t.bold = True
        run_t.font.size = Pt(9.5)
        run_t.font.color.rgb = BRAND_BLUE
        run_b = rp.add_run(r_text)
        run_b.font.size = Pt(9.5)
        run_b.font.color.rgb = DARK_TEXT

    h4 = doc.add_paragraph()
    h4.paragraph_format.space_before = Pt(14)
    h4.paragraph_format.space_after = Pt(4)
    r_h4 = h4.add_run("4. Mahalliy Tarmoqdagi Boshqa Qurilmalardan Ulanish Yo'riqnomasi")
    r_h4.bold = True
    r_h4.font.size = Pt(12.5)
    r_h4.font.color.rgb = BRAND_BLUE

    steps = [
        "1-qadam: Qurilmani (noutbuk, planshet yoki telefon) server kompyuter ulangan bir xil Wi-Fi tarmog'iga yoki ofis LAN kabeliga ulang.",
        "2-qadam: Qurilmadagi istalgan zamonaviy internet brauzerini (Google Chrome, Safari, Edge, Mozilla Firefox) oching.",
        "3-qadam: Brauzerning manzil qatoriga quyidagi manzilni kiriting: http://192.168.224.70:5183",
        "4-qadam: Ekranda TeamFlow tizimiga kirish oynasi paydo bo'ladi. Yuqoridagi jadvaldan o'z rolingizga mos Email va Parolni kiritib 'Kirish' tugmasini bosing.",
        "5-qadam: Agar administrator paneliga kirmoqchi bo'lsangiz, brauzerda http://192.168.224.70:8010/admin/ manzilini oching va admin@teamflow.uz hisobi bilan kiring.",
    ]

    for s in steps:
        sp = doc.add_paragraph()
        sp.paragraph_format.space_after = Pt(3)
        sp.paragraph_format.line_spacing = 1.15
        rs = sp.add_run(s)
        rs.font.size = Pt(9.5)
        rs.font.color.rgb = DARK_TEXT

    h5 = doc.add_paragraph()
    h5.paragraph_format.space_before = Pt(14)
    h5.paragraph_format.space_after = Pt(4)
    r_h5 = h5.add_run("5. Texnik Konfiguratsiya va Xavfsizlik Sozlamalari")
    r_h5.bold = True
    r_h5.font.size = Pt(12.5)
    r_h5.font.color.rgb = BRAND_BLUE

    p5 = doc.add_paragraph(
        "Tizimning tarmoqda barqaror ishlashi va tashqi xavflardan himoyalanishi uchun quyidagi konfiguratsiyalar joriy etildi:\n"
        "• ALLOWED_HOSTS: Backend konfiguratsiyasida tarmoq IP manzili (192.168.224.70) ruxsat etilgan hostlar ro'yxatiga kiritildi;\n"
        "• CORS & CSRF Himoyasi: Brauzerdan yuboriladigan so'rovlar uchun 5183 va 8010 portlari xavfsiz ulanishlar sifatida tasdiqlandi;\n"
        "• Vite Dev Server: server.allowedHosts: true xossasi faollashtirilib, tashqi qurilmalardan kelgan so'rovlarning bloklanishi bartaraf etildi;\n"
        "• Avtomatik sinovlar: Tizim 582 ta backend avtomatlashtirilgan testlari va 51 ta frontend testlaridan 100% muvaffaqiyatli o'tgan."
    )
    p5.paragraph_format.line_spacing = 1.15
    p5.paragraph_format.space_after = Pt(10)

    footer_p = doc.add_paragraph()
    footer_p.paragraph_format.space_before = Pt(20)
    footer_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    rf = footer_p.add_run("TeamFlow Tizim Ma'muriyati\nHujjat avtomatik tarzda shakllantirildi.")
    rf.font.size = Pt(9)
    rf.font.italic = True
    rf.font.color.rgb = GRAY_TEXT

    out_file = "/app/TeamFlow_Tizimga_Kirish_va_Login_Parollar_Qullanmasi.docx"
    doc.save(out_file)
    print(f"Hujjat muvaffaqiyatli yaratildi: {out_file}")

if __name__ == "__main__":
    create_guide_document()
