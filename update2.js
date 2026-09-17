const fs = require('fs');
const filepath = 'D:/Task/frontend/src/pages/OrderDetail.tsx';
let content = fs.readFileSync(filepath, 'utf8');

function rep(from, to) {
    if (content.includes(from)) {
        content = content.replace(from, to);
        console.log("Replaced:", from.slice(0,30));
    } else {
        console.log("NOT FOUND:", from.slice(0,30));
    }
}

// L409
rep('title: `Buyurtma «${item.request_no}» qabul qilinsinmi?`,', 'title: tx("orders.buyurtma_qabul_qilinsinmi", { request_no: item.request_no }),');

// L472: "Tugatilgan ish haqidagi hujjatni (fayl/rasm) yoki hisobot izohini kiriting."
rep('"Tugatilgan ish haqidagi hujjatni (fayl/rasm) yoki hisobot izohini kiriting."', 'tx("orders.tugatilgan_ish_hujjati")');

// L526:
rep('"Dastlabki TZ holati tasdiqlanmaguncha yoki rad etilmaguncha, yangi versiya yuklay olmaysiz."', 'tx("orders.dastlabki_tz_tasdiqlanmaguncha")');
// let's check what it actually is L526: "Dastlabki TZ holati ..."

// Let's replace the whole backtick blocks if they have variables
rep('`${totalFilesCount} ta`', '`${totalFilesCount} ${tx("common.ta")}`');
rep('`${olderVersions.length} ta`', '`${olderVersions.length} ${tx("common.ta")}`');

rep('• Yuklagan: ', '• {tx("orders.yuklagan")}: ');
rep('>O\\'zgarish izohi: <', '>{tx("orders.ozgarish_izohi")}: <');
rep('O\\'zgarish izohi: ', 'tx("orders.ozgarish_izohi") + ": "');
rep('PM qarori: ', 'tx("orders.pm_qarori") + ": "');
rep('Dasturchi: ', 'tx("orders.dasturchi") + ": "');
rep('>Topshiriq biriktirilmagan<', '>{tx("orders.topshiriq_biriktirilmagan")}<');
rep('label="Yangi holat"', 'label={tx("orders.yangi_holat")}');
rep('label="PM yakuniy muddati"', 'label={tx("orders.pm_yakuniy_muddati")}');
rep('>Bekor qilish<', '>{tx("common.bekor_qilish")}<');
rep('>Saqlanmoqda...<', '>{tx("common.saqlanmoqda")}<');
rep('>Saqlash<', '>{tx("common.saqlash")}<');
rep('>Yuklanmoqda...<', '>{tx("common.yuklanmoqda")}<');
rep('>Yuborish<', '>{tx("common.yuborish")}<');

// Try with regex for >Yuborilmoqda...<
content = content.replace(/>Yuborilmoqda\.\.\.</g, '>{tx("common.yuborilmoqda")}<');
content = content.replace(/"Yuborilmoqda\.\.\."/g, 'tx("common.yuborilmoqda")');

// Yuklangan:
content = content.replace(/>Yuklangan:</g, '>{tx("orders.yuklangan")}:<');
content = content.replace(/"Yuklangan:"/g, 'tx("orders.yuklangan") + ":"');

content = content.replace(/>Rad etilgan</g, '>{tx("orders.rad_etilgan")}<');

content = content.replace(/"• Yuklagan: "/g, '`• ${tx("orders.yuklagan")}: `');
content = content.replace(/"O'zgarish izohi: "/g, 'tx("orders.ozgarish_izohi") + ": "');
content = content.replace(/"PM qarori: "/g, 'tx("orders.pm_qarori") + ": "');
content = content.replace(/"Dasturchi: "/g, 'tx("orders.dasturchi") + ": "');

content = content.replace(/"Mas'ul dasturchi:"/g, 'tx("orders.masul_dasturchi") + ":"');
content = content.replace(/>Mas'ul dasturchi:</g, '>{tx("orders.masul_dasturchi")}:<');
content = content.replace(/"Muhimlik darajasi:"/g, 'tx("orders.muhimlik_label") + ":"');
content = content.replace(/>Muhimlik darajasi:</g, '>{tx("orders.muhimlik_label")}:<');
content = content.replace(/"Mas'ul shaxs:"/g, 'tx("orders.masul_shaxs_label") + ":"');
content = content.replace(/>Mas'ul shaxs:</g, '>{tx("orders.masul_shaxs_label")}:<');

// Also update defaults.json for the new key "orders.buyurtma_qabul_qilinsinmi"
const jsonPath = 'D:/Task/backend/apps/uitexts/defaults.json';
let jsonContent = fs.readFileSync(jsonPath, 'utf8');
let defaults = JSON.parse(jsonContent);

defaults["orders.buyurtma_qabul_qilinsinmi"] = { "value": "Buyurtma «{request_no}» qabul qilinsinmi?", "note": "pages/OrderDetail.tsx" };
defaults["orders.tugatilgan_ish_hujjati"] = { "value": "Tugatilgan ish haqidagi hujjatni (fayl/rasm) yoki hisobot izohini kiriting.", "note": "pages/OrderDetail.tsx" };

const sortedKeys = Object.keys(defaults).sort();
const sortedDefaults = {};
for (const k of sortedKeys) {
    sortedDefaults[k] = defaults[k];
}

fs.writeFileSync(jsonPath, JSON.stringify(sortedDefaults, null, 2) + '\\n');
fs.writeFileSync(filepath, content);
console.log("Phase 2 update done.");
