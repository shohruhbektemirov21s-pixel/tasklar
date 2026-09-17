import json
import re

# 1. Update defaults.json
def update_defaults():
    with open('D:/Task/backend/apps/uitexts/defaults.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    new_keys = {
        "orders.buyurtmani_yuklab_bolmadi": "Buyurtmani yuklab bo'lmadi.",
        "orders.muddat_otgan_xatolik": "Muddat bugungi kundan oldingi sana bo'lishi mumkin emas.",
        "orders.saqlashda_xatolik": "Buyurtmani saqlashda xatolik yuz berdi.",
        "orders.ruxsat_berilmagan": "Ruxsat berilmagan",
        "orders.pm_yaratish_taqiq_desc": "Yangi buyurtma (TZ) yaratish faqat sohaviy boshqarma vakillariga ruxsat etilgan. Loyiha menejeri (PM) buyurtma yarata olmaydi.",
        "orders.tahrirlash_taqiqlangan": "Buyurtmani tahrirlash taqiqlangan",
        "orders.tahrirlash_taqiq_desc": "Tizim qoidalariga muvofiq, buyurtmalarni tahrirlash imkoniyati mavjud emas.",
        "orders.buyurtmani_tahrirlash": "Buyurtmani tahrirlash",
        "orders.yangi_buyurtma_tz": "Yangi buyurtma (TZ)",
        "orders.tizim_nomi_placeholder": "Masalan: TeamFlow, ERP, Billing, CRM...",
        "orders.tegishli_loyiha_label": "Tegishli loyiha (mavjud axborot tizimi)",
        "orders.loyiha_tanlang_placeholder": "-- Loyihani tanlang (ixtiyoriy) --",
        "orders.loyiha_izoh_label": "Loyiha haqida izoh",
        "orders.loyiha_izoh_placeholder": "Loyiha haqida qisqacha izoh yoki qo'shimcha ma'lumot...",
        "orders.bolinma_placeholder": "Bo'linmani tanlang yoki yozing...",
        "orders.kerakli_muddat_label": "Kerakli muddat",
        "orders.requested_change_placeholder": "Kiritilishi kerak bo'lgan o'zgartirish yoki yangi funksiya haqida batafsil ma'lumot...",
        "orders.current_state_placeholder": "Hozirgi vaqtda tizimda qanday ishlayapti yoki nima mavjud emas...",
        "orders.reason_placeholder": "O'zgartirish kiritish asosi yoki maqsadi...",
        "orders.affected_modules_placeholder": "Masalan: Hisobotlar, Avtorizatsiya, API...",
        "orders.dep_systems_placeholder": "Tashqi integratsiyalar, ma'lumotlar bazasi yoki boshqa tizimlar...",
        "orders.additional_materials_placeholder": "Hujjatlar, hisob-kitoblar yoki namunalar haqida qo'shimcha ma'lumot...",
        "orders.biriktirilgan_fayllar_label": "Biriktirilgan hujjatlar va fayllar (TZ, texnik topshiriq)",
        "orders.koplab_fayl_yuklash": "Ko'p fayl yuklash mumkin",
        "orders.dropzone_prompt": "Fayllarni tanlash yoki bu yerga bosing",
        "orders.dropzone_hint": "PDF, Word (.doc, .docx), Excel (.xls, .xlsx), ZIP, rasmlar (har biri 50MB gacha)",
        "orders.files_to_upload": "Yuklanadigan fayllar",
        "orders.existing_files": "Mavjud biriktirilgan fayllar",
        "orders.confirm_delete_attachment": "Ushbu biriktirilgan faylni o'chirishni tasdiqlaysizmi?",
        "orders.delete_attachment_error": "Faylni o'chirishda xatolik.",
        "orders.yaratilgan_vaqti_label": "Yaratilgan vaqti:",
        "orders.sana_vaqt_label": "Sana va vaqt:"
    }
    for k, v in new_keys.items():
        data[k] = {"value": v, "note": "pages/OrderForm.tsx"}
    
    sorted_data = {k: data[k] for k in sorted(data.keys())}
    
    with open('D:/Task/backend/apps/uitexts/defaults.json', 'w', encoding='utf-8') as f:
        json.dump(sorted_data, f, indent=1, ensure_ascii=False)


# 2. Update OrderForm.tsx
def update_order_form():
    with open('D:/Task/frontend/src/pages/OrderForm.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex Replacements
    replacements = [
        # Errors & Messages
        (r'setError\(e instanceof ApiError \? e\.message : "Buyurtmani yuklab bo\'lmadi\."\);', 
         r'setError(e instanceof ApiError ? e.message : tx("orders.buyurtmani_yuklab_bolmadi"));'),
        
        (r'setErrors\(\(p\) => \(\{ \.\.\.p, due_date: "Muddat bugungi kundan oldingi sana bo\'lishi mumkin emas\." \}\)\);', 
         r'setErrors((p) => ({ ...p, due_date: tx("orders.muddat_otgan_xatolik") }));'),
        
        (r'setError\("Muddat bugungi kundan oldingi sana bo\'lishi mumkin emas\."\);', 
         r'setError(tx("orders.muddat_otgan_xatolik"));'),
         
        (r'setError\(err instanceof Error \? err\.message : "Buyurtmani saqlashda xatolik yuz berdi\."\);', 
         r'setError(err instanceof Error ? err.message : tx("orders.saqlashda_xatolik"));'),

        # PM Restriction Block
        (r'<h2 style=\{\{ fontSize: 18, fontWeight: 700, marginBottom: 10 \}\}>Ruxsat berilmagan</h2>',
         r'<h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{tx("orders.ruxsat_berilmagan")}</h2>'),
         
        (r'Yangi buyurtma \(TZ\) yaratish faqat sohaviy boshqarma vakillariga ruxsat etilgan\. Loyiha menejeri \(PM\) buyurtma yarata olmaydi\.',
         r'{tx("orders.pm_yaratish_taqiq_desc")}'),
         
        (r'Buyurtmalar ro\'yxatiga qaytish\s*</button>',
         r'{tx("orders.buyurtmalarga_qaytish")}\n          </button>'),

        # Locked Submitted Block
        (r'«\{existingItem\?\.request_no\}» raqamli buyurtma rasman yuborilgan\. Yuborilgan buyurtmani tahrirlab yoki o\'chirib bo\'lmaydi\.',
         r'«{existingItem?.request_no}» {tx("orders.locked_after_send_desc")}'),

        # Edit Restricted Block
        (r'<h3 style=\{\{ margin: "0 0 10px 0" \}\}>Buyurtmani tahrirlash taqiqlangan</h3>',
         r'<h3 style={{ margin: "0 0 10px 0" }}>{tx("orders.tahrirlash_taqiqlangan")}</h3>'),
         
        (r'Tizim qoidalariga muvofiq, buyurtmalarni tahrirlash imkoniyati mavjud emas\.',
         r'{tx("orders.tahrirlash_taqiq_desc")}'),

        # Form Header
        (r'<strong>\{editing \? "Buyurtmani tahrirlash" : "Yangi buyurtma \(TZ\)"\}</strong>',
         r'<strong>{editing ? tx("orders.buyurtmani_tahrirlash") : tx("orders.yangi_buyurtma_tz")}</strong>'),

        # Placeholders and Labels
        (r'placeholder="Masalan: TeamFlow, ERP, Billing, CRM\.\.\."',
         r'placeholder={tx("orders.tizim_nomi_placeholder")}'),
         
        (r'<label htmlFor=\{\`\$\{fid\}-proj\`\}>Tegishli loyiha \(mavjud axborot tizimi\)</label>',
         r'<label htmlFor={`${fid}-proj`}>{tx("orders.tegishli_loyiha_label")}</label>'),
         
        (r'<option value="">-- Loyihani tanlang \(ixtiyoriy\) --</option>',
         r'<option value="">{tx("orders.loyiha_tanlang_placeholder")}</option>'),
         
        (r'<label htmlFor=\{\`\$\{fid\}-mod\`\}>Loyiha haqida izoh</label>',
         r'<label htmlFor={`${fid}-mod`}>{tx("orders.loyiha_izoh_label")}</label>'),
         
        (r'placeholder="Loyiha haqida qisqacha izoh yoki qo\'shimcha ma\'lumot\.\.\."',
         r'placeholder={tx("orders.loyiha_izoh_placeholder")}'),
         
        (r'placeholder="Bo\'linmani tanlang yoki yozing\.\.\."',
         r'placeholder={tx("orders.bolinma_placeholder")}'),
         
        (r'<label htmlFor=\{\`\$\{fid\}-due\`\}>Kerakli muddat</label>',
         r'<label htmlFor={`${fid}-due`}>{tx("orders.kerakli_muddat_label")}</label>'),
         
        (r'placeholder="Kiritilishi kerak bo\'lgan o\'zgartirish yoki yangi funksiya haqida batafsil ma\'lumot\.\.\."',
         r'placeholder={tx("orders.requested_change_placeholder")}'),
         
        (r'placeholder="Hozirgi vaqtda tizimda qanday ishlayapti yoki nima mavjud emas\.\.\."',
         r'placeholder={tx("orders.current_state_placeholder")}'),
         
        (r'placeholder="O\'zgartirish kiritish asosi yoki maqsadi\.\.\."',
         r'placeholder={tx("orders.reason_placeholder")}'),
         
        (r'placeholder="Masalan: Hisobotlar, Avtorizatsiya, API\.\.\."',
         r'placeholder={tx("orders.affected_modules_placeholder")}'),
         
        (r'placeholder="Tashqi integratsiyalar, ma\'lumotlar bazasi yoki boshqa tizimlar\.\.\."',
         r'placeholder={tx("orders.dep_systems_placeholder")}'),
         
        (r'placeholder="Hujjatlar, hisob-kitoblar yoki namunalar haqida qo\'shimcha ma\'lumot\.\.\."',
         r'placeholder={tx("orders.additional_materials_placeholder")}'),
         
        (r'<span>Biriktirilgan hujjatlar va fayllar \(TZ, texnik topshiriq\)</span>',
         r'<span>{tx("orders.biriktirilgan_fayllar_label")}</span>'),
         
        (r'<span className="muted" style=\{\{ fontSize: 11\.5, fontWeight: 400 \}\}>Ko\'p fayl yuklash mumkin</span>',
         r'<span className="muted" style={{ fontSize: 11.5, fontWeight: 400 }}>{tx("orders.koplab_fayl_yuklash")}</span>'),
         
        (r'Fayllarni tanlash yoki bu yerga bosing',
         r'{tx("orders.dropzone_prompt")}'),
         
        (r'PDF, Word \(\.doc, \.docx\), Excel \(\.xls, \.xlsx\), ZIP, rasmlar \(har biri 50MB gacha\)',
         r'{tx("orders.dropzone_hint")}'),
         
        (r'Yuklanadigan fayllar \(\{files\.length\}\):',
         r'{tx("orders.files_to_upload")} ({files.length}):'),
         
        (r'Mavjud biriktirilgan fayllar \(\{existingAttachments\.length\}\):',
         r'{tx("orders.existing_files")} ({existingAttachments.length}):'),
         
        (r'title="O\'chirish"',
         r'title={tx("common.ochirish")}'),
         
        (r'if \(window\.confirm\("Ushbu biriktirilgan faylni o\'chirishni tasdiqlaysizmi\?"\)\) \{',
         r'if (window.confirm(tx("orders.confirm_delete_attachment"))) {'),
         
        (r'setError\(err instanceof Error \? err\.message : "Faylni o\'chirishda xatolik\."\);',
         r'setError(err instanceof Error ? err.message : tx("orders.delete_attachment_error"));'),
         
        (r'title="Faylni o\'chirish"',
         r'title={tx("orders.faylni_ochirish")}'),
         
        (r'\{editing \? "Yaratilgan vaqti:" : "Sana va vaqt:"\}',
         r'{editing ? tx("orders.yaratilgan_vaqti_label") : tx("orders.sana_vaqt_label")}'),

        # Hardcoded array removals
        (r'meta\?\.order_type \|\| meta\?\.project_type \|\| \[\s*\{ value: "NEW", label: "Yangi loyiha" \},\s*\{ value: "CONTINUATION", label: "Davom ettiriladigan" \},\s*\{ value: "NEEDS_CLASSIFICATION", label: "Turlash kerak bo\'lgan" \},\s*\{ value: "MODERNIZATION", label: "Modernizatsiya" \},\s*\{ value: "MAINTENANCE", label: "Texnik xizmat" \},\s*\]',
         r'meta?.order_type || meta?.project_type || []'),
         
        (r'meta\?\.order_priority \|\| \[\s*\{ value: "URGENT", label: "Shoshilinch / O\'ta muhim" \},\s*\{ value: "HIGH", label: "Yuqori" \},\s*\{ value: "MEDIUM", label: "O\'rta" \},\s*\{ value: "LOW", label: "Past" \},\s*\]',
         r'meta?.order_priority || []'),
         
        (r'meta\?\.change_nature \|\| \[\s*\{ value: "BOTH", label: "Ikkalasi ham \(To\'liq tizim bo\'ylab\)" \},\s*\{ value: "USER_FACING", label: "Foydalanuvchiga ko\'rinadigan \(Frontend/UI\)" \},\s*\{ value: "BACKEND", label: "Ichki o\'zgarish \(Backend / Baza / API\)" \},\s*\]',
         r'meta?.change_nature || []')
    ]

    for pattern, repl in replacements:
        content = re.sub(pattern, repl, content, flags=re.MULTILINE)
        
    # Remove `|| "fallback"` and `, undefined, "fallback"` from tx()
    # Corrected regex to handle strings containing single/double quotes properly
    content = re.sub(r'(tx\("[^"]+"\))\s*\|\|\s*(?:"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\')', r'\1', content)
    content = re.sub(r'(tx\("[^"]+"\s*,\s*undefined)\s*,\s*(?:"(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\')(\))', r'\1\2', content)

    with open('D:/Task/frontend/src/pages/OrderForm.tsx', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == "__main__":
    update_defaults()
    update_order_form()
    print("Done")
