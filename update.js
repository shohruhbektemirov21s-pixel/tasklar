const fs = require('fs');
const filepath = 'D:/Task/frontend/src/pages/OrderDetail.tsx';
let content = fs.readFileSync(filepath, 'utf8');

function replaceStr(str, replacement) {
    if (content.includes(str)) {
        content = content.replace(str, replacement);
        console.log('Replaced:', str.slice(0, 30) + '...');
    } else {
        console.log('NOT FOUND:', str.slice(0, 30) + '...');
    }
}

function replaceAllStr(str, replacement) {
    let count = 0;
    while(content.includes(str)) {
        content = content.replace(str, replacement);
        count++;
    }
    if (count > 0) {
        console.log('Replaced', count, 'times:', str.slice(0, 30) + '...');
    } else {
        console.log('NOT FOUND:', str.slice(0, 30) + '...');
    }
}

function replaceRegex(regex, replacement) {
    let match = content.match(regex);
    if (match) {
        content = content.replace(regex, replacement);
        console.log('Replaced regex:', regex.toString().slice(0, 30) + '...');
    } else {
        console.log('NOT FOUND regex:', regex.toString().slice(0, 30) + '...');
    }
}

if (!content.includes('import { tx } from "@/i18n";') && !content.includes("import { tx } from '@/i18n';")) {
    content = content.replace('import React', 'import { tx } from "@/i18n";\nimport React');
}

replaceStr(`"Buyurtma ma'lumotlarini yuklab bo'lmadi."`, 'tx("orders.buyurtma_yuklab_bolmadi")');
replaceStr(`"Buyurtmani yuborishda xatolik yuz berdi."`, 'tx("orders.yuborishda_xatolik")');
replaceStr(`title="Buyurtmani o'chirish"`, 'title={tx("orders.buyurtmani_ochirish")}');
replaceStr(`"Ushbu amalni ortga qaytarib bo'lmaydi."`, 'tx("orders.amalni_ortga_qaytarib_bolmaydi")');
replaceAllStr(`"O'chirish"`, 'tx("common.ochirish")');
replaceStr(`"O'chirishda xatolik yuz berdi."`, 'tx("orders.ochirishda_xatolik")');
replaceStr(`"Buyurtma muvaffaqiyatli qabul qilindi."`, 'tx("orders.buyurtma_qabul_qilindi")');
replaceStr(`"Qabul qilishda xatolik yuz berdi."`, 'tx("orders.qabul_qilishda_xatolik")');
replaceStr(`"PM qarori va muddatlar muvaffaqiyatli saqlandi."`, 'tx("orders.pm_qarori_saqlandi")');
replaceStr(`"Qarorni saqlashda xatolik yuz berdi."`, 'tx("orders.qarorni_saqlashda_xatolik")');
replaceStr(`title="Buyurtmani tasdiqlash"`, 'title={tx("orders.buyurtmani_tasdiqlash")}');
replaceStr(`"Ish to'liq yakunlangan deb hisoblanadi va buyurtma yopiladi."`, 'tx("orders.ish_yakunlanadi_va_yopiladi")');
replaceAllStr(`"Tasdiqlash"`, 'tx("common.tasdiqlash")');
replaceStr(`"Buyurtma muvaffaqiyatli tasdiqlandi va yakunlandi."`, 'tx("orders.tasdiqlandi_va_yakunlandi")');
replaceStr(`"Tasdiqlashda xatolik yuz berdi."`, 'tx("orders.tasdiqlashda_xatolik")');
replaceStr(`"Kamchilik izohini yozing yoki yangilangan TZ/kamchilik faylini biriktiring."`, 'tx("orders.kamchilik_izohini_yozing")');
replaceStr(`"Buyurtma kamchiliklar ko'rsatilib, qayta ishlash uchun qaytarildi."`, 'tx("orders.qayta_ishlash_uchun_qaytarildi")');
replaceStr(`"Qaytarishda xatolik yuz berdi."`, 'tx("orders.qaytarishda_xatolik")');
replaceStr(`"Tugatilgan ish haqidagi hujjatni..."`, 'tx("orders.tugatilgan_ish_hujjati")');
replaceStr(`"Bajarilgan ish boshqarma tasdig'iga muvaffaqiyatli topshirildi."`, 'tx("orders.ish_topshirildi")');
replaceStr(`"Hisobotni topshirishda xatolik yuz berdi."`, 'tx("orders.hisobot_topshirishda_xatolik")');
replaceStr(`"Yuklashda xatolik yuz berdi."`, 'tx("orders.yuklashda_xatolik")');
replaceStr(`"Dastlabki TZ holati tasdiqlanmaguncha yoki rad etilmaguncha, yangi versiya yuklay olmaysiz."`, 'tx("orders.dastlabki_tz_tasdiqlanmaguncha")');
replaceStr(`"Avvalgi TZ versiyasi hali tasdiqlanmagan."`, 'tx("orders.avvalgi_tz_tasdiqlanmagan")');
replaceStr(`"Yangi TZ versiyasi tasdiqlanmaguncha yoki rad etilmaguncha, boshqa versiya yuklay olmaysiz."`, 'tx("orders.yangi_tz_tasdiqlanmaguncha")');
replaceStr(`"Versiya muvaffaqiyatli tasdiqlandi."`, 'tx("orders.version_approved_success")');
replaceStr(`"Versiyani tasdiqlashda xatolik yuz berdi."`, 'tx("orders.versiyani_tasdiqlashda_xatolik")');
replaceStr(`"Versiya muvaffaqiyatli rad etildi."`, 'tx("orders.version_rejected_success")');
replaceStr(`"Versiyani rad etishda xatolik yuz berdi."`, 'tx("orders.versiyani_rad_etishda_xatolik")');
replaceStr(`"Vazifa muvaffaqiyatli yaratildi va buyurtmaga biriktirildi!"`, 'tx("orders.vazifa_yaratildi")');
replaceStr(`"Vazifa yaratishda xatolik yuz berdi."`, 'tx("orders.vazifa_yaratishda_xatolik")');

replaceStr(`title="Buyurtma tanlanmagan"`, 'title={tx("orders.buyurtma_tanlanmagan")}');
replaceStr(`text="Buyurtmalar ro'yxatidan biror buyurtmani tanlang."`, 'text={tx("orders.biror_buyurtmani_tanlang")}');
replaceAllStr(`>Buyurtmalar ro'yxatiga qaytish<`, '>{tx("orders.buyurtmalarga_qaytish")}<');
replaceAllStr(`>← Buyurtmalar ro'yxatiga qaytish<`, '>{tx("orders.buyurtmalarga_qaytish")}<');
replaceStr(`"← Buyurtmalar ro'yxatiga qaytish"`, 'tx("orders.buyurtmalarga_qaytish")');
replaceAllStr(`"Yuborilmoqda..."`, 'tx("common.yuborilmoqda")');
replaceAllStr(`>Yuborilmoqda...<`, '>{tx("common.yuborilmoqda")}<');
replaceStr(`>Yuklangan:<`, '>{tx("orders.yuklangan")}:<');
replaceAllStr(`"Yuklangan:"`, 'tx("orders.yuklangan") + ":"');
replaceStr(`title="Yangi TZ faylini ko'rish"`, 'title={tx("orders.yangi_tz_korish")}');
replaceAllStr(`"O'zgarishlar tavsifi (sababi):"`, 'tx("orders.ozgarishlar_tavsifi") + ":"');
replaceStr(`>O'zgarishlar tavsifi (sababi):<`, '>{tx("orders.ozgarishlar_tavsifi")}:<');

replaceAllStr('`${totalFilesCount} ta`', '`${totalFilesCount} ${tx("common.ta")}`');
replaceStr('{totalFilesCount} ta', '{totalFilesCount} {tx("common.ta")}');

replaceAllStr(`title="Veb-saytda ochish"`, 'title={tx("orders.veb_saytda_ochish")}');
replaceAllStr(`title="Hisobot faylini ko'rish"`, 'title={tx("orders.hisobot_korish")}');
replaceStr(`title="Rasmiy Word (.docx) blankini ko'rish / yuklab olish"`, 'title={tx("orders.rasmiy_word_blankini_korish")}');
replaceStr(`>Word (.docx) blanki<`, '>{tx("orders.word_blanki")}<');

replaceAllStr('`${olderVersions.length} ta`', '`${olderVersions.length} ${tx("common.ta")}`');
replaceStr('{olderVersions.length} ta', '{olderVersions.length} {tx("common.ta")}');

replaceStr(`"Avvalgi versiyalar tarixi mavjud emas"`, 'tx("orders.avvalgi_versiyalar_mavjud_emas")');
replaceStr(`>Avvalgi versiyalar tarixi mavjud emas<`, '>{tx("orders.avvalgi_versiyalar_mavjud_emas")}<');

replaceAllStr(`>Rad etilgan<`, '>{tx("orders.rad_etilgan")}<');
replaceStr(`"Rad etilgan"`, 'tx("orders.rad_etilgan")');
replaceStr(`"Dastlabki TZ (Eski versiya)"`, 'tx("orders.dastlabki_tz_eski")');
replaceStr(`"Eski versiya (Bekor qilingan)"`, 'tx("orders.eski_versiya_bekor_qilingan")');
replaceAllStr(`"• Yuklagan: "`, '`• ${tx("orders.yuklagan")}: `');
replaceStr(`• Yuklagan:`, '• {tx("orders.yuklagan")}:');

replaceStr(`"O'zgarish izohi: "`, '`${tx("orders.ozgarish_izohi")}: `');
replaceStr(`>O'zgarish izohi: <`, '>{tx("orders.ozgarish_izohi")}: <');

replaceStr(`"PM qarori: "`, '`${tx("orders.pm_qarori")}: `');
replaceStr(`>PM qarori: <`, '>{tx("orders.pm_qarori")}: <');

replaceAllStr(`"Dasturchi: "`, '`${tx("orders.dasturchi")}: `');
replaceStr(`>Dasturchi: <`, '>{tx("orders.dasturchi")}: <');

replaceStr(`"Topshiriq biriktirilmagan"`, 'tx("orders.topshiriq_biriktirilmagan")');
replaceStr(`>Topshiriq biriktirilmagan<`, '>{tx("orders.topshiriq_biriktirilmagan")}<');

replaceAllStr(`label="Yangi holat"`, 'label={tx("orders.yangi_holat")}');
replaceAllStr(`label="PM yakuniy muddati"`, 'label={tx("orders.pm_yakuniy_muddati")}');
replaceAllStr(`placeholder="Qisqa ko'rsatma..."`, 'placeholder={tx("orders.qisqa_korsatma")}');
replaceAllStr(`>Bekor qilish<`, '>{tx("common.bekor_qilish")}<');
replaceAllStr(`"Bekor qilish"`, 'tx("common.bekor_qilish")');
replaceAllStr(`>Saqlanmoqda...<`, '>{tx("common.saqlanmoqda")}<');
replaceAllStr(`"Saqlanmoqda..."`, 'tx("common.saqlanmoqda")');
replaceAllStr(`>Saqlash<`, '>{tx("common.saqlash")}<');
replaceAllStr(`"Saqlash"`, 'tx("common.saqlash")');

replaceAllStr(`>Yuklanmoqda...<`, '>{tx("common.yuklanmoqda")}<');
replaceAllStr(`"Yuklanmoqda..."`, 'tx("common.yuklanmoqda")');
replaceAllStr(`>Yuborish<`, '>{tx("common.yuborish")}<');
replaceAllStr(`"Yuborish"`, 'tx("common.yuborish")');

replaceAllStr(`>Tugatilgan ish haqidagi hujjatni...<`, '>{tx("orders.tugatilgan_ish_hujjati_modal")}<');
replaceAllStr(`>Topshirilmoqda...<`, '>{tx("common.topshirilmoqda")}<');
replaceAllStr(`"Topshirilmoqda..."`, 'tx("common.topshirilmoqda")');
replaceAllStr(`>Topshirish<`, '>{tx("common.topshirish")}<');
replaceAllStr(`"Topshirish"`, 'tx("common.topshirish")');

replaceAllStr(`>Tanlanmagan<`, '>{tx("common.tanlanmagan")}<');
replaceAllStr(`"Tanlanmagan"`, 'tx("common.tanlanmagan")');

replaceAllStr(`>Yaratilmoqda...<`, '>{tx("common.yaratilmoqda")}<');
replaceAllStr(`"Yaratilmoqda..."`, 'tx("common.yaratilmoqda")');

replaceAllStr(`>PM yakuniy muddati<`, '>{tx("orders.pm_yakuniy_muddati")}<');
replaceAllStr(`>Qanchada tugashi (baho)<`, '>{tx("orders.qanchada_tugashi")}<');

replaceAllStr(`>PM xulosasi va ko'rsatmasi<`, '>{tx("orders.pm_xulosasi_va_korsatmasi")}<');
replaceAllStr(`>Tasdiqlanmoqda...<`, '>{tx("common.tasdiqlanmoqda")}<');
replaceAllStr(`"Tasdiqlanmoqda..."`, 'tx("common.tasdiqlanmoqda")');

replaceAllStr(`>Rad etilmoqda...<`, '>{tx("common.rad_etilmoqda")}<');
replaceAllStr(`"Rad etilmoqda..."`, 'tx("common.rad_etilmoqda")');
replaceAllStr(`>Rad etish<`, '>{tx("common.rad_etish")}<');
replaceAllStr(`"Rad etish"`, 'tx("common.rad_etish")');

// Replace PM status array L2140-2146 (fallback):
replaceRegex(/\|\|\s*\[\s*\{\s*value:\s*'new',\s*label:\s*'Yangi'\s*\},\s*\{\s*value:\s*'in_progress',\s*label:\s*'Jarayonda'\s*\},\s*\{\s*value:\s*'done',\s*label:\s*'Bajarildi'\s*\},\s*\{\s*value:\s*'cancelled',\s*label:\s*'Bekor qilingan'\s*\}\s*\]/, "|| meta?.order_status || []");

// Hardcoded || fallbacks:
replaceStr(`|| "Tavsif kiritilmagan"`, `|| tx("common.tavsif_kiritilmagan")`);
replaceStr(`|| "Buyurtmachi"`, `|| tx("orders.buyurtmachi")`);
replaceStr(`|| "TZ ijrosi"`, `|| tx("orders.tz_ijrosi")`);
replaceStr(`|| "Yangi_TZ.docx"`, `|| tx("orders.yangi_tz_fayli")`);
replaceStr(`|| "Yangi TZ fayli"`, `|| tx("orders.yangi_tz_fayli")`);
replaceStr(`|| "Hisobot_hujjati"`, `|| tx("orders.hisobot_hujjati")`);
replaceStr(`|| "Tuzatish_hujjati"`, `|| tx("orders.tuzatish_hujjati")`);
replaceStr(`|| "Fayl"`, `|| tx("common.fayl")`);
replaceStr(`|| "TZ_fayli.docx"`, `|| "TZ_fayli"`);
replaceStr(`|| "Hisobot_hujjati.docx"`, `|| "Hisobot_hujjati"`);
replaceStr(`|| "Dasturchi"`, `|| tx("orders.dasturchi")`);
replaceAllStr(`|| "yangi"`, `|| tx("orders.yangi")`);

// A quick helper to replace some missing bits:
replaceStr(`"Mas'ul dasturchi:"`, 'tx("orders.masul_dasturchi") + ":"');
replaceStr(`>Mas'ul dasturchi:<`, '>{tx("orders.masul_dasturchi")}:<');
replaceStr(`"Muhimlik darajasi:"`, 'tx("orders.muhimlik_label") + ":"');
replaceStr(`>Muhimlik darajasi:<`, '>{tx("orders.muhimlik_label")}:<');
replaceStr(`"Mas'ul shaxs:"`, 'tx("orders.masul_shaxs_label") + ":"');
replaceStr(`>Mas'ul shaxs:<`, '>{tx("orders.masul_shaxs_label")}:<');

fs.writeFileSync(filepath, content);
console.log("Done updating frontend.");

const jsonPath = 'D:/Task/backend/apps/uitexts/defaults.json';
let jsonContent = fs.readFileSync(jsonPath, 'utf8');
let defaults = JSON.parse(jsonContent);

const newKeys = {
    "orders.buyurtma_yuklab_bolmadi": { "value": "Buyurtma ma'lumotlarini yuklab bo'lmadi.", "note": "pages/OrderDetail.tsx" },
    "orders.yuborishda_xatolik": { "value": "Buyurtmani yuborishda xatolik yuz berdi.", "note": "pages/OrderDetail.tsx" },
    "orders.buyurtmani_ochirish": { "value": "Buyurtmani o'chirish", "note": "pages/OrderDetail.tsx" },
    "orders.amalni_ortga_qaytarib_bolmaydi": { "value": "Ushbu amalni ortga qaytarib bo'lmaydi.", "note": "pages/OrderDetail.tsx" },
    "orders.ochirishda_xatolik": { "value": "O'chirishda xatolik yuz berdi.", "note": "pages/OrderDetail.tsx" },
    "orders.buyurtma_qabul_qilindi": { "value": "Buyurtma muvaffaqiyatli qabul qilindi.", "note": "pages/OrderDetail.tsx" },
    "orders.qabul_qilishda_xatolik": { "value": "Qabul qilishda xatolik yuz berdi.", "note": "pages/OrderDetail.tsx" },
    "orders.pm_qarori_saqlandi": { "value": "PM qarori va muddatlar muvaffaqiyatli saqlandi.", "note": "pages/OrderDetail.tsx" },
    "orders.qarorni_saqlashda_xatolik": { "value": "Qarorni saqlashda xatolik yuz berdi.", "note": "pages/OrderDetail.tsx" },
    "orders.buyurtmani_tasdiqlash": { "value": "Buyurtmani tasdiqlash", "note": "pages/OrderDetail.tsx" },
    "orders.ish_yakunlanadi_va_yopiladi": { "value": "Ish to'liq yakunlangan deb hisoblanadi va buyurtma yopiladi.", "note": "pages/OrderDetail.tsx" },
    "orders.tasdiqlandi_va_yakunlandi": { "value": "Buyurtma muvaffaqiyatli tasdiqlandi va yakunlandi.", "note": "pages/OrderDetail.tsx" },
    "orders.tasdiqlashda_xatolik": { "value": "Tasdiqlashda xatolik yuz berdi.", "note": "pages/OrderDetail.tsx" },
    "orders.kamchilik_izohini_yozing": { "value": "Kamchilik izohini yozing yoki yangilangan TZ/kamchilik faylini biriktiring.", "note": "pages/OrderDetail.tsx" },
    "orders.qayta_ishlash_uchun_qaytarildi": { "value": "Buyurtma kamchiliklar ko'rsatilib, qayta ishlash uchun qaytarildi.", "note": "pages/OrderDetail.tsx" },
    "orders.qaytarishda_xatolik": { "value": "Qaytarishda xatolik yuz berdi.", "note": "pages/OrderDetail.tsx" },
    "orders.tugatilgan_ish_hujjati": { "value": "Tugatilgan ish haqidagi hujjatni...", "note": "pages/OrderDetail.tsx" },
    "orders.ish_topshirildi": { "value": "Bajarilgan ish boshqarma tasdig'iga muvaffaqiyatli topshirildi.", "note": "pages/OrderDetail.tsx" },
    "orders.hisobot_topshirishda_xatolik": { "value": "Hisobotni topshirishda xatolik yuz berdi.", "note": "pages/OrderDetail.tsx" },
    "orders.yuklashda_xatolik": { "value": "Yuklashda xatolik yuz berdi.", "note": "pages/OrderDetail.tsx" },
    "orders.dastlabki_tz_tasdiqlanmaguncha": { "value": "Dastlabki TZ holati tasdiqlanmaguncha yoki rad etilmaguncha, yangi versiya yuklay olmaysiz.", "note": "pages/OrderDetail.tsx" },
    "orders.avvalgi_tz_tasdiqlanmagan": { "value": "Avvalgi TZ versiyasi hali tasdiqlanmagan.", "note": "pages/OrderDetail.tsx" },
    "orders.yangi_tz_tasdiqlanmaguncha": { "value": "Yangi TZ versiyasi tasdiqlanmaguncha yoki rad etilmaguncha, boshqa versiya yuklay olmaysiz.", "note": "pages/OrderDetail.tsx" },
    "orders.versiyani_tasdiqlashda_xatolik": { "value": "Versiyani tasdiqlashda xatolik yuz berdi.", "note": "pages/OrderDetail.tsx" },
    "orders.versiyani_rad_etishda_xatolik": { "value": "Versiyani rad etishda xatolik yuz berdi.", "note": "pages/OrderDetail.tsx" },
    "orders.vazifa_yaratildi": { "value": "Vazifa muvaffaqiyatli yaratildi va buyurtmaga biriktirildi!", "note": "pages/OrderDetail.tsx" },
    "orders.vazifa_yaratishda_xatolik": { "value": "Vazifa yaratishda xatolik yuz berdi.", "note": "pages/OrderDetail.tsx" },
    "orders.buyurtma_tanlanmagan": { "value": "Buyurtma tanlanmagan", "note": "pages/OrderDetail.tsx" },
    "orders.biror_buyurtmani_tanlang": { "value": "Buyurtmalar ro'yxatidan biror buyurtmani tanlang.", "note": "pages/OrderDetail.tsx" },
    "common.yuborilmoqda": { "value": "Yuborilmoqda...", "note": "pages/OrderDetail.tsx" },
    "orders.yuklangan": { "value": "Yuklangan", "note": "pages/OrderDetail.tsx" },
    "orders.yangi_tz_korish": { "value": "Yangi TZ faylini ko'rish", "note": "pages/OrderDetail.tsx" },
    "orders.ozgarishlar_tavsifi": { "value": "O'zgarishlar tavsifi (sababi)", "note": "pages/OrderDetail.tsx" },
    "orders.veb_saytda_ochish": { "value": "Veb-saytda ochish", "note": "pages/OrderDetail.tsx" },
    "orders.hisobot_korish": { "value": "Hisobot faylini ko'rish", "note": "pages/OrderDetail.tsx" },
    "orders.rasmiy_word_blankini_korish": { "value": "Rasmiy Word (.docx) blankini ko'rish / yuklab olish", "note": "pages/OrderDetail.tsx" },
    "orders.word_blanki": { "value": "Word (.docx) blanki", "note": "pages/OrderDetail.tsx" },
    "orders.avvalgi_versiyalar_mavjud_emas": { "value": "Avvalgi versiyalar tarixi mavjud emas", "note": "pages/OrderDetail.tsx" },
    "orders.rad_etilgan": { "value": "Rad etilgan", "note": "pages/OrderDetail.tsx" },
    "orders.dastlabki_tz_eski": { "value": "Dastlabki TZ (Eski versiya)", "note": "pages/OrderDetail.tsx" },
    "orders.eski_versiya_bekor_qilingan": { "value": "Eski versiya (Bekor qilingan)", "note": "pages/OrderDetail.tsx" },
    "orders.ozgarish_izohi": { "value": "O'zgarish izohi", "note": "pages/OrderDetail.tsx" },
    "orders.pm_qarori": { "value": "PM qarori", "note": "pages/OrderDetail.tsx" },
    "orders.topshiriq_biriktirilmagan": { "value": "Topshiriq biriktirilmagan", "note": "pages/OrderDetail.tsx" },
    "orders.yangi_holat": { "value": "Yangi holat", "note": "pages/OrderDetail.tsx" },
    "orders.pm_yakuniy_muddati": { "value": "PM yakuniy muddati", "note": "pages/OrderDetail.tsx" },
    "orders.qisqa_korsatma": { "value": "Qisqa ko'rsatma...", "note": "pages/OrderDetail.tsx" },
    "orders.tugatilgan_ish_hujjati_modal": { "value": "Tugatilgan ish haqidagi hujjatni...", "note": "pages/OrderDetail.tsx" },
    "common.topshirilmoqda": { "value": "Topshirilmoqda...", "note": "pages/OrderDetail.tsx" },
    "common.topshirish": { "value": "Topshirish", "note": "pages/OrderDetail.tsx" },
    "common.tanlanmagan": { "value": "Tanlanmagan", "note": "pages/OrderDetail.tsx" },
    "orders.qanchada_tugashi": { "value": "Qanchada tugashi (baho)", "note": "pages/OrderDetail.tsx" },
    "orders.pm_xulosasi_va_korsatmasi": { "value": "PM xulosasi va ko'rsatmasi", "note": "pages/OrderDetail.tsx" },
    "common.rad_etilmoqda": { "value": "Rad etilmoqda...", "note": "pages/OrderDetail.tsx" },
    "common.rad_etish": { "value": "Rad etish", "note": "pages/OrderDetail.tsx" },
    "orders.buyurtmachi": { "value": "Buyurtmachi", "note": "pages/OrderDetail.tsx" },
    "orders.tz_ijrosi": { "value": "TZ ijrosi", "note": "pages/OrderDetail.tsx" },
    "orders.yangi_tz_fayli": { "value": "Yangi TZ fayli", "note": "pages/OrderDetail.tsx" },
    "orders.hisobot_hujjati": { "value": "Hisobot_hujjati", "note": "pages/OrderDetail.tsx" },
    "orders.tuzatish_hujjati": { "value": "Tuzatish_hujjati", "note": "pages/OrderDetail.tsx" },
    "orders.dasturchi": { "value": "Dasturchi", "note": "pages/OrderDetail.tsx" }
};

for (const [key, val] of Object.entries(newKeys)) {
    if (!defaults[key]) {
        defaults[key] = val;
    }
}

const sortedKeys = Object.keys(defaults).sort();
const sortedDefaults = {};
for (const k of sortedKeys) {
    sortedDefaults[k] = defaults[k];
}

fs.writeFileSync(jsonPath, JSON.stringify(sortedDefaults, null, 2) + '\n');
console.log("Done updating JSON.");
