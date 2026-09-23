# TeamFlow — statik ma'lumot auditi (Agent 8)

Sana: 2026-09-23 · Branch: `refactor/architecture-review` (commit qilinmagan o'zgarishlar bilan, ishchi daraxt shu holicha tekshirildi).
Qamrov: `frontend/src`, `backend/apps`, `backend/config`, `backend/scripts`, `backend/seed_demo_data.py`, `backend/docker`, `docker/`, ildizdagi skriptlar.
Tashqarida qoldi: `node_modules`, `dist`, `migrations`, `.git`, `__pycache__`.
Usul: Grep va `node` bilan faqat o'qiydigan tahlil skriptlari (`tx()` chaqiruvlarini `defaults.json` bilan solishtirish, izoh va `tx(...)` ichidagi matnni olib tashlab qolgan satr/JSX matnini sanash). Kod o'zgartirilmadi.

Xavf darajalari: **P0** — xavfsizlik yoki produksiyaga zarar · **P1** — foydalanuvchi ko'radigan xato yoki loyiha qoidasining aniq buzilishi · **P2** — sifat, qarz, keyin tuzatish mumkin.

---

## 1. Xulosa

| Ko'rsatkich | Son |
| --- | --- |
| Frontenddagi `tx()` chaqiruvlari (testlarsiz) | 2 607 |
| Koddagi noyob kalitlar / `defaults.json` dagi kalitlar | 1 835 / 2 121 |
| **Kodda bor, `defaults.json` da YO'Q kalitlar** | **73** (14 tasi fallbacksiz — ekranda kalit nomidan yasalgan matn chiqadi) |
| `defaults.json` da bor, kodda ishlatilmaydigan kalitlar | **352** (57 tasi o'chirilgan `Brief/History/Onboarding` sahifalariniki) |
| `tx(kalit, vars, "fallback")` — 3-argumentda qattiq matn | 374 ta chaqiruv (54 tasida fallback bazadagi matndan farq qiladi) |
| `tx("…") \|\| "…"` — ishlamaydigan fallback | 19 |
| **`tx()` siz qattiq yozilgan ko'rinadigan matn** | **≈ 260** ta satr, 40 faylda (≈ 80% i 6 faylda: `OrderDetail`, `Admin`, `api/orders.ts`, `inquiry`, `TaskDetail`, `ChangeRequests`) |
| Frontenddagi mock / soxta yozuvlar massivi | **0** (faqat `Landing.tsx` dagi illyustratsiya bloki, pastda) |
| Backendda ma'lum parol bilan hisob yaratadigan / parolni tiklaydigan buyruq (himoyasiz) | **1** — `setup_roles` (**P0**) |
| Demo seed nazorati (`entrypoint` + `seed_demo`) | ✅ to'g'ri: `SEED_DEMO=1` VA `DEBUG=1`; buyruqning o'zi `DEBUG=0` da rad etadi |
| Demo seed'ni nazoratni chetlab chaqiradigan yo'llar | 2 ta (`scripts/clean_database.py`, `python seed_demo_data.py`) — **P1** |

**Asosiy xulosa.** Ro'yxat va statistikalar haqiqatan ham backenddan keladi: frontendda soxta yozuvlar massivi, `Math.random`, qo'lda yozilgan statistika yoki soxta sanalar yo'q (`Landing` dagi raqamlar `/public/stats/` dan olinadi). Muammolar uch joyda to'plangan:
1. **Buyurtmalar moduli** (`OrderDetail.tsx`, `ChangeRequests.tsx`, `api/orders.ts`, `OrderBadges.tsx`) va **Admin/Inquiries** sahifalarida `tx()` qoidasi deyarli qo'llanmagan.
2. **`tx()` ning 3-argumenti (fallback)** qattiq matnni qonuniy ko'rinishga keltiradi: 60 ta kalit `defaults.json` da yo'q, shuning uchun ular admin tahrirlay olmaydigan qattiq matn bo'lib ishlaydi.
3. **`setup_roles` buyrug'i** — DEBUG tekshiruvisiz `admin@teamflow.uz` parolini `admin123` ga qaytaradi va ma'lum parolli hisoblar yaratadi.

---

## 2. Mock / soxta ma'lumot

| Fayl:qator | Turi | Topilgan narsa | Xavf | Tavsiya |
| --- | --- | --- | --- | --- |
| `frontend/src/pages/Landing.tsx:192-228` | Illyustratsiya bloki | «Loyiha tarixi» namunasi: Jahongir/Admin/Sardor/Malika, `PAY-14`, «2 daqiqa oldin», «3.5 soat»… Hammasi `tx()` orqali, lekin bu **ro'yxatga o'xshab ko'rinadigan uydirma faoliyat** | P2 | Bu maqsadli marketing illyustratsiyasi bo'lsa — ko'rinadigan «namuna» belgisi qo'yib qoldiring va Egasidan tasdiq oling. Aks holda o'chiring yoki `is_listed` loyihalarning haqiqiy ochiq faoliyati bilan almashtiring |
| `frontend/src/pages/OrderForm.tsx:169` | Bazaga yoziladigan soxta qiymat | `payload.system_name = "Qoralama buyurtma"` — nom bo'sh bo'lsa DB ga shu matn yoziladi | P2 | Qoralamada nomni bo'sh qoldirib, ko'rsatishda `tx("orders.status_draft")` ishlating yoki default'ni backendda bering |
| `frontend/src/pages/Admin.tsx:447,453` + `defaults.json` `admin.abdraxmanov_toxir_toxtasinovich`, `admin.abdraxmanov` | Placeholder sifatida real odam ismi | «Abdraxmanov Toxir Toxtasinovich» F.I.Sh./login maydoni namunasi | P2 | Bazadagi matnni umumiy namunaga almashtiring (masalan «Familiya Ism Otasining ismi»), kalit nomini ham neytral qiling |
| `frontend/src/pages/Login.tsx:99`, `Register.tsx:156` | Placeholder e-pochta | `siz@example.com` | P2 | `tx("login.email_namuna")` |
| `frontend/src/**/*.test.ts(x)` | Test mock'lari | `vi.mock`, `mockUser`, `dev(1,"Ali Valiyev")` | — | **Qoldirish** — vitest ichida, ilovaga tushmaydi |

Qidirilgan va **topilmagan**: `mock/fake/dummy/sample/lorem/faker` ilova kodida, `Math.random`, `= [{…}]` yozuvlar massivlari, lokal JSON ma'lumot fayllari, qattiq statistikalar, `2025-…/2026-…` soxta sanalar (faqat izohlarda misol sifatida bor).

---

## 3. Qattiq yozilgan matnlar (`tx()` siz)

### 3.1. Fayllar bo'yicha taqsimot (izohlar, `tx(...)` va CSS satrlari chiqarib tashlangan)

| Fayl | ≈ son | Nima |
| --- | --- | --- |
| `pages/OrderDetail.tsx` | 63 | alert/xato matnlari, `Loading text=`, `placeholder=`, bo'sh holat, ustuvorlik `<option>` lari, modal sarlavhalari |
| `pages/Admin.tsx` | 59 | mutaxassislik bo'limi to'liq, buyurtma jadvali sarlavhalari, `confirm()`, `Empty`, filtr `<option>` lari |
| `api/orders.ts` | 23 | `ORDER_STATUS_CONFIG` / `ORDER_TYPE_CONFIG` `label`/`desc` (**o'lik kod**, pastda) |
| `components/inquiry.tsx` + `InquiryDrawer.tsx` + `pages/Inquiries.tsx` | 29 | so'rov formasi, anonimlik matnlari, boshliq qarori, xabarlar |
| `pages/TaskDetail.tsx` | 15 | sana validatsiyasi xatolari, `placeholder`, `title="Veb-saytda ochish"` |
| `pages/ChangeRequests.tsx` | 15 | `alert()` lar, «Fayl tanlash/tanlanmagan», `title=` |
| `components/DistributeTasksModal.tsx` | 14 | jadval sarlavhalari, bo'sh holat, validatsiya |
| `pages/Profile.tsx` | 13 | buyurtma jadvali sarlavhalari, badge fallback'lari, qaytarish modali |
| `pages/TaskForm.tsx` | 12 | sana validatsiyasi, «Qoralama tiklandi» |
| `pages/Register.tsx`, `People.tsx`, `ProjectForm.tsx`, `NotificationModal.tsx`, boshqalar | ≈ 45 | xato/muvaffaqiyat xabarlari, `aria-label`, `title` |
| `components/dates.tsx:208-212` | 19 | `UZ_MONTHS`, `UZ_WEEKDAYS` (sana tanlagichda ko'rinadi) |
| `pages/Calendar.tsx:26` | 7 | `WEEKDAYS` (taqvim sarlavhasi) |

### 3.2. Eng muhim topilmalar

| Fayl:qator | Turi | Topilgan narsa | Xavf | Tavsiya |
| --- | --- | --- | --- | --- |
| `pages/ChangeRequests.tsx:343,347,351,377,391` | `alert()` | «Boshlanish sanasi bugungi kundan oldin…», «Buyurtma orqaga qaytarildi…» | P1 | tx kaliti (`orders.sana_otmishda` va h.k.) |
| `pages/OrderDetail.tsx:441-526` | `setActionError` | Xuddi shu 3 ta sana xatosi ikki marta takrorlangan + qaytarish xabarlari | P1 | tx kaliti; validatsiyani bitta yordamchiga chiqarish |
| `pages/OrderDetail.tsx:870,880,909,922,838` | Yuklanish / bo'sh holat | «Buyurtma ma'lumotlari yuklanmoqda…», «Buyurtma topilmadi», «← Buyurtmalar ro'yxatiga qaytish» | P1 | tx kaliti (bo'sh holat qoidasi) |
| `pages/OrderDetail.tsx:2981-2984` | `<option>` | Past / O'rtacha / Yuqori / Shoshilinch | P1 | `meta.task_priority` dan oling (`/api/meta/` allaqachon beradi) |
| `pages/OrderDetail.tsx:499-501, 1274-1275, 2135, 2554, 2598-2609, 2716, 3159-3221` | Modal matnlari, `placeholder` | Qaytarish modali, PM topshirish, TZ versiyasi yuklash/rad etish | P1 | tx kalitlari |
| `pages/Admin.tsx:201-275, 360-364, 565, 586` | Muvaffaqiyat/xato xabarlari | «…mutaxassisligi muvaffaqiyatli qo'shildi», «Buyurtmani topshirib bo'lmadi» | P1 | tx kaliti + `{nom}` o'rin egasi |
| `pages/Admin.tsx:218,231` | `confirm()` | ««X» loyihasini qayta tiklashni tasdiqlaysizmi?» | P1 | `useConfirm` + tx |
| `pages/Admin.tsx:428-430` | `tx(...) \|\| "…"` | «Barcha hisoblar», «Faol hisoblar», «Tasdiqlash kutilmoqda (Nofaol)» | P2 | `\|\| "…"` ni olib tashlang — `tx` hech qachon bo'sh qaytarmaydi |
| `pages/Admin.tsx:618-716, 865-936, 981, 1037, 1044-1047, 1174-1264` | Butun bo'limlar | Mutaxassisliklar, buyurtmalar (PM tayinlash), axlat qutisi jadvallari: sarlavha, `Empty`, `th`, `placeholder` | P1 | tx kalitlari |
| `components/inquiry.tsx:85-296`, `InquiryDrawer.tsx:47-114`, `Inquiries.tsx:217-323` | Forma va xabarlar | «Yangi so'rov yuborish», «🔒 Yopiq (faqat boshliq va sizga)», «🎭 Anonim yuborish…», «So'rov saqlandi» | P1 | tx kalitlari (maxfiylik va'dasi matnlari — admin tahrirlay olishi kerak) |
| `pages/TaskForm.tsx:269-275, 813-837`; `TaskDetail.tsx:417,643,649`; `ProjectForm.tsx:322` | Validatsiya | «Tugash muddati boshlanish sanasidan oldin…» — 12 joyda takror | P1 | Bitta tx kaliti + umumiy yordamchi (`dates.tsx`) |
| `pages/Register.tsx:69,75,110,113,116,165` | `tx(...) \|\| "…"` | Fallback hech qachon ishlamaydi, faqat qattiq matnni saqlaydi | P2 | `\|\| "…"` ni o'chirish |
| `components/DistributeTasksModal.tsx:94,134,376,390,415-421,492` | Jadval, bo'sh holat | «Vazifa nomi / Ijrochilar / Holat…», `Loyiha #${id}` | P1 | tx kalitlari |
| `pages/Profile.tsx:45-49, 225, 633-637, 683, 905, 917` | Badge va jadval | «Testda», «Rad etilgan», «Yangi», «Tizim / Modul…» | P1 | `status_display` + tx |
| `components/NotificationModal.tsx:133,156,161` | Matn + mantiq | «Rad etish sababi», «Berilgan izoh»; rad etishni `title.includes("rad etildi")` bilan aniqlaydi — matn o'zgarsa mantiq buziladi | P1 | Belgini `meta.status`/`kind` dan oling; yorliqlarni tx ga |
| `pages/Calendar.tsx:310-311` | `title=` | `Nazoratda ${n} · Jarayonda ${n} · Bajarildi ${n}` | P2 | `tx("calendar.kun_izohi", {…})` |
| `pages/Login.tsx:131` | Tugma matni | `Qayta urinish: ${s}s` | P2 | `tx("login.qayta_urinish", {s})` |
| `components/Layout.tsx:433` | `tx(...) \|\| "Admin panel"` | o'lik fallback | P2 | o'chirish |
| `components/dates.tsx:208-212`, `pages/Calendar.tsx:26` | Oy/hafta kunlari | `UZ_MONTHS`, `UZ_WEEKDAYS`, `WEEKDAYS` — `defaults.json` da `calendar.yanvar…` allaqachon bor | P2 | Mavjud `calendar.*` kalitlarini ishlating (Calendar.tsx:28 da `MONTHS` shunday qilingan) |
| `pages/TaskDetail.tsx:1020-1054`, `project/Files.tsx:262,352` | `title=` | «Veb-saytda ochish» | P2 | tx kaliti |
| `pages/People.tsx:498,930,1188` | `aria-label` | «Hammasini tanlash», «Yopish» | P2 | `tx("common.yopish")` (mavjud) |
| `components/ui.tsx:413` | Mantiqda matn | `r.toLowerCase() === "dasturchi"` — lavozim matni bilan solishtirish | P2 | `specialty` kodi bilan solishtiring |
| `frontend/src/main.tsx:28-33` | Qattiq matn | «Server bilan aloqa yo'q…» | — | **Qoldirish** — CLAUDE.md dagi yagona ruxsat etilgan istisno |
| `components/ErrorBoundary.tsx:42`, `pages/Suggestions.tsx:395`, `i18n/index.ts:69` | `console.*` | Dasturchi uchun konsol matni | — | Qoldirish (foydalanuvchi ko'rmaydi) |

### 3.3. `tx()` fallback (3-argument) muammosi

`tx(key, vars, fallback)` imzosi (`i18n/index.ts:61`) kalit bazada bo'lmasa fallback'ni ko'rsatadi. Natijada:
- **374 ta chaqiruvda** qattiq matn kodda qolgan; kalit bazada bo'lsa bu o'lik nusxa, bo'lmasa — admin tahrirlay olmaydigan qattiq matn.
- **54 tasida** fallback bazadagi matndan farq qiladi, ya'ni «qaysi biri to'g'ri» noaniq. Eng xavflisi:
  - `pages/WorkDone.tsx:351` — `tx("work_done.tab_bajariladiganlar", …, "Bajarilganlar")`: bazada **«Bajariladiganlar»**, ya'ni *bajarilgan* ishlar tabi **teskari ma'noda** ko'rinadi. To'g'ri kalit `work_done.tab_bajarilgan` («Bajarilganlar») bazada bor, lekin ishlatilmaydi. **P1**
  - `pages/MyWork.tsx:205` — baza «Mening ishim», fallback «Vazifalarim».
  - `pages/TaskDetail.tsx:717` `task_detail.jamoa_bosh` — baza uzun paragraf, fallback «Jamoa biriktirilmagan».
- Tavsiya (P2): fallback argumentini bosqichma-bosqich olib tashlash; ESLint qoidasi (`no-restricted-syntax`: `CallExpression[callee.name='tx'][arguments.length=3]`) bilan yangilarini to'xtatish.

---

## 4. Yetishmayotgan `tx` kalitlari

### 4.1. Fallbacksiz — ekranda kalitdan yasalgan matn chiqadi (P1)

`tx()` topilmagan kalitni `humanizeKey` bilan ko'rsatadi (masalan `orders.status_yangi_tz` → «Status yangi tz»).

| Fayl:qator | Kalit | Xavf | Tavsiya |
| --- | --- | --- | --- |
| `pages/orders/OrderBadges.tsx:63,72,81,90,99,108,117,126,135` | `orders.status_qoralama`, `…_yangi_tz`, `…_pm_qabul_qildi`, `…_dasturchiga_berildi`, `…_ish_jarayonida`, `…_test_tekshiruvda`, `…_tasdiq_kutilmoqda`, `…_yakunlangan`, `…_rad_etilgan` | P1 | `defaults.json` ga qo'shish (yoki mavjud `orders.status_*` kalitlariga ulash) |
| `pages/orders/OrderBadges.tsx:190` | `orders.yangi_versiya_kutilmoqda` | P1 | `defaults.json` ga qo'shish |
| `pages/OrderDetail.tsx:1408` | `common.fayl` | P1 | qo'shish |
| `pages/OrderDetail.tsx:3125` | `common.tasdiqlanmoqda` | P1 | qo'shish |
| `i18n/index.ts:48` | `task.left` | — | Noto'g'ri signal: JSDoc izohidagi misol |
| `pages/Suggestions.tsx:463` | `"suggestions.holat_" + s` (dinamik) | — | OK: `holat_pending/approved/rejected` bazada bor |

### 4.2. Fallback bilan — qattiq matn sifatida ishlaydi (P2, 60 ta chaqiruv / 55 kalit)

`defaults.json` ga qo'shilishi kerak (qiymat = hozirgi fallback, keyin fallback'ni olib tashlash):

- `nav/history.ts:41-73` — 22 kalit (`projects.loyihalar`, `projects.loyiha`, `projects.ochiq_loyiha`, `workspace_form.yangi_loyiha`, `project_detail.loyiha_tahrirlash`, `project_detail.vazifa_yaratish`, `project_detail.dasturchi_hisoboti`, `task_detail.vazifani_tahrirlash`, `task_detail.vazifa`, `profile.xodim_profili`, `workspace_detail.chat`, `workspaces.ish_maydoni`, `review.tekshiruv_navbati`, `notifications.bildirishnomalar`, `suggestions.takliflar`, `inquiries.sorovlar`, `change_requests.buyurtmalar`, `change_requests.buyurtma`, `search.sarlavha`, `admin.boshqaruv_paneli`, `common.sahifa`).
- `pages/WorkDone.tsx:172-1070` — 17 kalit (`common.tizim`, `role.boshliq`, `role.loyiha_menejeri`, `role.administrator`, `role.xodim`, `work_done.verb_done|comment|worklog|created|rejected|updated`, `work_done.yozuv`, `common.yangilash`, `common.faol_filtrlar`, `work_done.bosh_holat_matn`, `work_done.barcha_filtrlarni_tozalash`, `work_done.korish`).
- `pages/People.tsx:1074-1098` — `common.tavsif`, `priority.low|medium|high|urgent` (ustuvorlik — `meta.task_priority` dan olish afzal).
- `pages/OrderDetail.tsx:287,1643,1725,1895,2329`, `ChangeRequests.tsx:1624,1959` — `orders.buyurtma_topshirildi`, `orders.fayl_va_izohlar`, `orders.boshlanish_sanasi`, `orders.fayllar_yoq`, `orders.tarix`.
- Qolganlari: `ui.vaqt` (`dates.tsx:515`), `project_form.kamida_bitta_vazifa` (`DistributeTasksModal.tsx:79`), `admin.yangi_parolni_kiriting` (`Admin.tsx:315`), `developer_report.loyiha_sahifasi` (`DeveloperReport.tsx:47`), `common.tiklash`, `common.ochirilgan` (`TaskDetail.tsx:558,602`).

### 4.3. Ishlatilmaydigan kalitlar (ikkinchi darajali, P2)

352 kalit `frontend/src` da hech qayerda uchramaydi (barcha `tx()` chaqiruvlari literal kalit bilan — dinamik faqat `suggestions.holat_*`, u hisobdan chiqarilgan). Prefiks bo'yicha:

| Prefiks | Son | Izoh |
| --- | --- | --- |
| `orders.*` | 123 | eski buyurtma UI dan qolgan (`claim_1week`, `bolim1_nomi`, `approve_version_confirm`…) |
| `project_onboarding.*` / `project_history.*` / `project_brief.*` | 26 / 16 / 15 | `pages/project/{Onboarding,History,Brief}.tsx` o'chirilgan (git status: `D`) |
| `dashboard.*` | 32 | buyurtma kartalari (`dashboard.barcha_buyurtmalar`, `…_izoh`) |
| `work_done.*` | 23 | `stat_*`, `tab_bajarilgan` (**bu ishlatilishi kerak edi — 3.3 ga qarang**) |
| `suggestions.*` | 19 | |
| `layout.*` / `notifications.*` | 11 / 11 | qadamlar tarixi (`layout.qadam_orqaga`…) |
| boshqalar | 76 | |

Tavsiya: ro'yxatni ko'rib chiqib, `seed_ui_texts --prune` bilan tozalash (admin tahrirlagan matnlar ham ketadi — avval zaxira). O'chirishdan oldin `work_done.tab_bajarilgan` kabi «noto'g'ri kalit ishlatilgan» holatlarni tuzating.

### 4.4. `defaults.json` qiymatlari sifati (P2)

- **105 qiymatda tutuq belgisi yo'qolgan**: `common.ochirish_2="Ochirish"`, `common.amalni_bajarib_bolmadi="Amalni bajarib bolmadi"`, `developer_report.ochiq_vazifa_yoq="Ochiq vazifa yoq"`, `landing.royxatdan_otish="Royxatdan otish"`…
- **3 qiymat avtomatik ajratishda buzilgan**: `join_project.qoshilish="Qoshilish /"`, `profile.profil="profil /"`, `landing.teamflow_2="teamflow /"`.
- 18 qiymatda `\r\n` va manba chekinishi saqlanib qolgan (`task_detail.ish_bitta_odamga_otadi_oldingi`, `task_form.vazifa_yaratish_va_tahrirlash_faqat`…).
- Tavsiya: `defaults.json` ni tuzatib `seed_ui_texts --force` (faqat admin tahrir qilmagan bo'lsa) yoki admin paneldan qo'lda.

### 4.5. Himoya yo'q

Kodda ishlatilgan kalit `defaults.json` da borligini tekshiradigan test yo'q (`backend/tests/test_ui_texts.py` faqat endpointni, `i18n/index.test.ts` faqat `tx` ni tekshiradi). Tavsiya: vitest — `src/**/*.tsx` dagi `tx("…")` literallarini yig'ib, `backend/apps/uitexts/defaults.json` bilan solishtirsin (bu auditdagi skript ~40 qator).

---

## 5. Backenddagi qattiq ma'lumot

| Fayl:qator | Turi | Topilgan narsa | Xavf | Tavsiya |
| --- | --- | --- | --- | --- |
| `backend/apps/accounts/management/commands/setup_roles.py:61-101` | Standart parollar, himoyasiz | `admin@teamflow.uz` parolini **`admin123` ga qayta o'rnatadi**; `menejer@teamflow.uz / menejer123`, `operator@teamflow.uz / operator123` yaratadi; parollarni stdout ga chiqaradi; barcha `ADMIN` larga `is_superuser=True` beradi. `settings.DEBUG` tekshiruvi YO'Q | **P0** | Guruh sozlashni qoldirib, hisob yaratish/parol tiklash qismini o'chirish yoki `seed_demo` kabi `DEBUG` bilan qulflash |
| `backend/apps/accounts/management/commands/bootstrap_admin.py:33`, `bootstrap_boss.py:60` | Dev standart parol | `admin12345`, `boss12345` — faqat `DEBUG=1` va env bo'sh bo'lsa; `DEBUG=0` da `ImproperlyConfigured` | — | **Qoldirish** (to'g'ri himoyalangan) |
| `backend/apps/accounts/management/commands/bootstrap_boss.py:37` | Standart ism | `BOSS_NAME` default «Akmal Boshliqov» | P2 | Neytral default («Boshliq») |
| `backend/.env:23` (git'da emas) | Kuchsiz parol | `BOSS_PASSWORD=password123` (demo parol bilan bir xil) | P2 | Lokal dev fayl; produksiya `.env` da kuchli parol ekanini tekshiring |
| `backend/apps/accounts/backends.py:18` | Qattiq domen | Login `@` siz bo'lsa `@teamflow.uz` qo'shiladi | P2 | `settings.LOGIN_DEFAULT_DOMAIN` (env) |
| `backend/apps/panel/api.py:937-941` | View ichida qattiq yorliqlar | `/api/meta/` → `order_filter_status`: «Yangi», «Qabul qilindi», «Rad etildi» | P2 | `ChangeRequestStatus(...).label` dan olish |
| `backend/apps/accounts/specialties.py:13-82` vs `models.SpecialtyItem` | Ikki manba | Mutaxassislik ham `TextChoices` + `SPECIALTY_PROFILE` (kodda), ham `SpecialtyItem` (bazada, admin qo'shadi) | P1 | Bitta manba (`SpecialtyItem`) ga o'tish; hozircha quyidagi ikki joyni tuzatish |
| `backend/apps/accounts/api.py:448-457` (`specialty_stats`) | Statik yorliq | Yorliq `dict(Specialty.choices)` dan — bazaga qo'shilgan mutaxassislik xom kod (`DEVOPS`) bo'lib chiqadi | P1 | `specialty_catalog()` dan yorliq olish |
| `backend/apps/accounts/api.py:496` (`role` PATCH) | Statik validatsiya | `specialty in Specialty.values` — admin qo'shgan mutaxassislikni jimgina rad etadi | P1 | `SpecialtyItem` kodlarini ham qabul qilish |
| `backend/apps/*/models.py` `TextChoices` yorliqlari, `activity.VERB_META`, `telegram/commands.py` `HELP_TEXT`…, `notifications`/`suggestions`/`inquiries` `_TITLES`, serializer xato matnlari | Server matnlari | O'zbekcha, Python'da qattiq | P2 (ma'lumot uchun) | Hozirgi konvensiyaga zid emas (UiText faqat frontend uchun). Kelajakda `/api/meta/` yorliqlarini UiText ga ulash mumkin |
| `backend/config/settings.py:190`, `docker-compose.yml:23` | Standart DB paroli | `DB2_PASSWORD` default `teamflow` | P2 | Produksiyada env majburiy bo'lsin (`SECRET_KEY` kabi tekshiruv) |
| `README.md:69-70` | Hujjatdagi parollar | `admin12345`, `boshliq12345` (ikkinchisi koddagi hech narsaga mos emas — eskirgan) | P2 | Faqat «`.env` dan» deb yozing |
| `backend/scripts/docs/create_passwords_docx.py:52-56`, `generate_access_guide.py:148-151` | Qattiq parollar | Demo hisoblar `password123` jadvali | P2 | README bunga «faqat demo» deydi — qoldirish mumkin, lekin parolni `DEMO_PASSWORD` env dan o'qisin |
| `TeamFlow_Akkauntlar.docx`, `backend/TeamFlow_Akkauntlar.docx` | Diskda parolli hujjat | `.gitignore` da (`*.docx`), git'ga tushmagan | P2 | Ish bitgach diskdan o'chirish |
| `backend/scripts/benchmarks/{load_test_50k,recreate_and_benchmark,test_db_scale,test_stress}.py` | Soxta yozuvlar | Bazaga o'n minglab `Task`/`Activity` yozadi, `DEBUG` tekshiruvi yo'q | P1 | Boshida `if not settings.DEBUG: sys.exit(...)` |

---

## 6. Demo / seed nazorati

| Yo'l | Holat | Xavf | Izoh |
| --- | --- | --- | --- |
| `backend/docker/entrypoint.sh:36-38` | ✅ | — | `SEED_DEMO=1` **va** `DEBUG ∈ {1,true}` bo'lsagina `seed_demo` |
| `backend/apps/accounts/management/commands/seed_demo.py:12-13` | ✅ | — | `settings.DEBUG` yolg'on bo'lsa `CommandError` |
| `.env.example` (`DEBUG=0`, `SEED_DEMO=0`), `backend/.env.example` (`SEED_DEMO=0`) | ✅ | — | Standart o'chiq; hozirgi `backend/.env` da `SEED_DEMO` yo'q |
| `backend/seed_demo_data.py:18, 314-315` | ⚠️ | P1 | `run_seed()` ning o'zida DEBUG tekshiruvi yo'q; `python seed_demo_data.py` (`__main__`) nazoratni chetlab o'tadi. `DEMO_PASSWORD` default `password123` |
| `backend/scripts/clean_database.py:26-42` | ⚠️ | **P1** | DEBUG tekshiruvisiz **barcha vazifalarni o'chiradi** va `seed_demo_data.run_seed()` ni chaqiradi. README «faqat dev» deydi, kod esa to'xtatmaydi |
| `backend/apps/accounts/management/commands/setup_roles.py` | ❌ | **P0** | 5-bo'limga qarang — demo'ga o'xshash hisoblar, nazoratsiz |

Tavsiya: tekshiruvni `run_seed()` ning ichiga ko'chiring (`if not settings.DEBUG: raise RuntimeError`) — shunda buyruq, skript va `__main__` uchchalasi bitta qulf ostida bo'ladi.

---

## 7. Qonuniy statik ma'lumot (tegilmasin)

| Fayl:qator | Nima | Nega OK | Backend API bormi? |
| --- | --- | --- | --- |
| `frontend/src/pages/Dashboard.tsx:43-170` (`LABELS`, `COLUMNS`, `DEADLINE_CARDS`, `DEADLINE_METRIC`, `DUE_OPTIONS`) | Ustun/davr konfiguratsiyasi, yorliqlar `tx()` | Kalitlar serverdagi `PERIODS`/`DUE_RANGES` (`apps/core/periods.py`) bilan mos; qiymatlar API dan | Kalitlar — yo'q (kerak ham emas) |
| `frontend/src/components/ui.tsx:825-838` (`DUE_PERIODS`, `STATUS_DOT`) | Muddat tanlovi, holat → rang | UI konfiguratsiyasi | Yorliqlar `meta.task_status` da bor; ranglar faqat frontendda |
| `frontend/src/pages/MyWork.tsx:25-43` (`COLUMNS`, `TERMS`) | Ustunlar, muddat tanlovi, `tx()` | Server `due_span` kalitlari | — |
| `frontend/src/pages/ProjectDetail.tsx:31-39` (`TABS`) | Marshrut tablari | Marshrut jadvali | — |
| `frontend/src/pages/Landing.tsx:13-44` (`FEATURES`, `FLOW`) | Marketing matni, `tx()` | Kontent bazada, tuzilma kodda | — |
| `frontend/src/pages/Calendar.tsx:28` (`MONTHS`) | Oy nomlari, `tx()` | To'g'ri namuna (`dates.tsx` ham shunday bo'lsin) | — |
| `frontend/src/pages/Suggestions.tsx:36` (`STATUSES`) | Enum qiymatlari (yorliqsiz) | Serverdagi `SuggestionStatus` bilan mos; yorliq `tx("suggestions.holat_*")` | Yo'q (`/meta/` da `suggestion_status` yo'q) |
| `frontend/src/pages/ReviewQueue.tsx:16` (`REJECT_HINTS`) | Enum qiymatlari | Mantiq uchun | — |
| `frontend/src/pages/project/TaskList.tsx:22` (`FILTER_KEYS`) | URL parametr kalitlari | Identifikator | — |
| `frontend/src/pages/TaskDetail.tsx:20` (`FILE_ICON`), `components/NotificationBell.tsx:11` (`TONE`), `components/inquiry.tsx:19`, `components/suggestion.tsx:34` (`STATUS_TONE`), `pages/Admin.tsx:37` (`ROLE_TONE`) | Kengaytma/tur → belgi yoki CSS klassi | Faqat ko'rinish | — |
| `frontend/src/pages/orders/OrderBadges.tsx` rang/ikonka qismi | Holat → rang | Ko'rinish | Yorliq `status_display` da keladi |
| `frontend/src/pages/orders/OrderProgressStepper.tsx:34` (`steps`) | Bosqich sarlavhalari `tx()` | Ko'rinish | `stage_index` serverdan |
| `frontend/src/api/branding.ts:10` (`DEFAULT_BRANDING`) | «TeamFlow» | `/system/settings/` kelguncha zaxira | ✅ bor |
| `frontend/src/components/*` / `pages/*` `EMPTY_FORM`, `NO_FILTERS`, `RESET_FILTERS` | Bo'sh forma holati | Ma'lumot emas | — |
| `backend/apps/*/models.py` `TextChoices`, `tasks.BOARD_COLUMNS`, `orders.workflow.TRANSITIONS`, `core/periods.py`, `core/uploads.py` (bloklangan kengaytmalar), `projects/models.py` `PROJECT_COLORS`, `accounts/models.py` `AVATAR_COLORS` | Domen qoidalari va palitra | Biznes-qoidalar kodda turishi kerak | `/api/meta/` orqali eksport qilinadi |
| `backend/apps/uitexts/defaults.json` | UI matnlarining repodagi nusxasi | Qoida bo'yicha shu yerda | `GET /api/ui-texts/` |
| `frontend/src/main.tsx:28-33` | «Server bilan aloqa yo'q» | CLAUDE.md dagi yagona istisno | — |

### Backend API orqali olinishi mumkin bo'lgan takroriy ro'yxatlar (nomzodlar)

| Fayl:qator | Takrorlangan ro'yxat | Backend manbasi | Xavf | Tavsiya |
| --- | --- | --- | --- | --- |
| `frontend/src/api/orders.ts:8-148` | `ORDER_TYPE_CONFIG`, `ORDER_STATUS_CONFIG` (qattiq `label`/`desc`) | `/api/meta/` → `order_type`, `order_status`; har yozuvda `status_display` | P2 | **O'chirish** — hech qayerda import qilinmaydi (o'lik kod); ishlatiladigan nusxa `pages/orders/OrderBadges.tsx` da |
| `frontend/src/pages/orders/OrderBadges.tsx:58-142` | `ORDER_STATUS_CONFIG` kalitlari `IN_DEVELOPMENT`, `WAITING_CLIENT` — backendda **yo'q**; `IN_PROGRESS`, `READY_FOR_REVIEW`, `CANCELLED` esa **yo'q** → `NEW` rangiga tushadi, `OrderProgressStepper` (`:32`) `stage_index` bo'lmasa noto'g'ri qadam oladi | `ChangeRequestStatus` (`apps/orders/models.py:20-30`) | **P1** | Kalitlarni backend enum'iga moslash; yorliq doim `status_display` / `meta.order_status` dan |
| `frontend/src/pages/ChangeRequests.tsx:1011-1014`, `Dashboard.tsx:1125-1128` | Buyurtma holati filtri `<option>` (NEW/ACCEPTED/REJECTED) | `/api/meta/` → `order_filter_status` | P2 | `meta.order_filter_status.map(...)` |
| `frontend/src/pages/OrderDetail.tsx:2981-2984`, `People.tsx:1095-1098` | Ustuvorlik 1-4 | `/api/meta/` → `task_priority` | P1/P2 | `meta.task_priority.map(...)` (`DistributeTasksModal.tsx:315` allaqachon shunday) |
| `frontend/src/pages/Profile.tsx:24-50` (`getOrderStatusBadge`) | Holat → matn fallback'lari | `status_display` | P2 | Fallback'larni olib tashlash |
| `frontend/src/pages/WorkDone.tsx:171-178` (`getRoleBadge`) | Rol yorliqlari | `/api/meta/` → `global_role` | P2 | `meta.global_role` |

---

## 8. Ustuvor ish rejasi (taklif)

1. **P0** — `setup_roles.py` dan hisob yaratish/parol tiklashni olib tashlash yoki DEBUG bilan qulflash.
2. **P1** — `run_seed()` ichiga DEBUG qulfi; `clean_database.py` va benchmark skriptlariga DEBUG qulfi.
3. **P1** — `OrderBadges.tsx` holat kalitlarini backend enum'iga moslash + 10 ta yetishmayotgan kalitni `defaults.json` ga qo'shish; `WorkDone.tsx:351` kalitini `work_done.tab_bajarilgan` ga almashtirish.
4. **P1** — Buyurtma va Admin/So'rovlar sahifalaridagi ≈ 200 qattiq matnni `tx()` ga ko'chirish (sana validatsiyasi xabarlarini bitta yordamchiga yig'ish).
5. **P1** — Mutaxassislik: `specialty_stats` va `role` PATCH ni `SpecialtyItem` bilan ishlaydigan qilish.
6. **P2** — `tx` fallback argumentini bosqichma-bosqich olib tashlash, ESLint qoidasi; `tx()||"…"` ni tozalash; kalit qamrovi testi; `defaults.json` qiymatlarini tuzatish; 352 ta ortiqcha kalitni ko'rib chiqib `--prune`.
