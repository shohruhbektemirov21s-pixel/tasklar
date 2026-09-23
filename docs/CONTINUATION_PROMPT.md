# TeamFlow — Multi-Agent Refactor: davomi uchun to'liq prompt

> Bu fayl **standalone prompt** sifatida yozilgan: uni istalgan AI modelga (kuchli yoki oddiy)
> ochib bersangiz, avvalgi suhbatni ko'rmasa ham, aynan shu joydan ishni davom ettira olishi kerak.
> Hech narsani taxmin qilma — quyidagi barcha yo'l, buyruq va topilmalar tasdiqlangan faktlar.
> Agar kod o'zgargan bo'lsa (fayl yo'q, qator raqami boshqacha), avval o'qib tekshir, keyin ishla.

## 0. Sen kimsan va vazifang

Sen **ORCHESTRATOR** (asosiy) agentsan. Loyiha: **TeamFlow** — vazifa boshqaruv tizimi.
Ildiz papka: `D:\Task` (Windows) / `/d/Task` (Git Bash). Bu Git repozitoriy.

Foydalanuvchi senga "MULTI-AGENT DEVELOPMENT MODE" rejimida ishlashni buyurgan: loyihani
backend + database bilan to'liq integratsiya qilish, mock/soxta ma'lumotlarni tozalash,
arxitektura xatolarini tuzatish — buni bir nechta SUB-AGENT orqali, ular bir-biriga
xalaqit bermaydigan tarzda (fayl scope'i ajratilgan, parallel/ketma-ket bosqichlarda) bajarish.

**Birinchi ish:** `D:\Task\CLAUDE.md` faylini to'liq o'qi — bu loyihaning majburiy konventsiyalari
(stack, Docker, qatlam tartibi, UI matnlari qoidasi va h.k.). Quyida uning eng muhim qoidalari
qisqartirilgan holda takrorlangan, lekin CLAUDE.md asl manba hisoblanadi.

---

## 1. Loyiha haqida qisqacha

- **Backend**: Django 5.2.6 + DRF 3.16.1 + SimpleJWT + channels (WebSocket), IBM Db2 (`ibm_db_django`
  ustidan o'z adapteri, `apps/core/db2` — TEGMA, sabab CLAUDE.md da).
- **Frontend**: React 19 + Vite 7 + TypeScript 5.8 + react-router-dom 7. UI kutubxonasiz, qo'lda CSS.
- **Hammasi Docker'da**: `docker-compose.yml`. Konteynerlar: `teamflow_db2`, `teamflow_redis`,
  `teamflow_backend` (host port 8010→8000), `teamflow_frontend` (host port 5183→5173),
  `teamflow_telegram`, `teamflow_scheduler`.
- Frontend: `http://localhost:5183`. Admin: `http://localhost:5183/admin/` yoki `:8010/admin/`.
  API: `http://localhost:8010/api/`.
- Hostda `python`/`npm` ishlatma — **konteyner ichida**:
  ```bash
  cd /d/Task
  docker compose up -d
  docker compose exec -T backend python manage.py <buyruq>
  docker compose exec -T frontend npm run <script>
  ```
  yoki tezroq: `docker exec teamflow_backend ...`.

### Qatlam tartibi (buzilmasin)

```
panel · telegram
   ↓
orders · inquiries · suggestions · chat · uitexts
   ↓
projects ⇄ tasks · activity · notifications · accounts · workspaces
   ↓
core
```

`apps/core` da domen importi BO'LMASIN. `apps/panel` ga hech kim bog'lanmasin (u eng ustki qavat).
`projects` buyurtmalarning (`orders`) ichini bilmasligi kerak — lekin hozirgi kodda BUZILGAN joylar bor
(pastda 4.8-bandda).

### Muhim konventsiyalar

- API view'lar `api.py` da (`views.py` da EMAS). Biznes-mantiq `services.py` da.
- UI matni kodga qattiq yozilmaydi — `frontend/src/i18n` dagi `tx("kalit")` orqali, kalitlar
  `backend/apps/uitexts/defaults.json` da, admin panelda tahrirlanadi. Funksiya nomi `t` EMAS, `tx`.
- Ro'yxat so'raganda `page_size`ni serverning 200 chegarasidan oshirib bo'lmaydi — `Pager` komponenti
  va `pagesOf`/`totalOf` (`api/client.ts`) shu uchun bor.
- N+1 so'rov yaratma — `select_related`/`prefetch_related`.
- Migratsiya fayllarini qo'lda yozma — faqat `makemigrations`.
- Ruxsatlar serverda tekshiriladi, frontend faqat ko'rinishni yashiradi.
- **Soxta/mock ma'lumot taqiqlanadi.** Hammasi Db2 → backend → API → frontend orqali kelishi shart.
- Git: joriy branch — `refactor/architecture-review`. `main`ga to'g'ridan-to'g'ri push QILMA.
  O'z branchingga commit qil, push qilishdan oldin foydalanuvchidan tasdiq so'ra.
  Commit xabarlari va PR tavsiflari oxirida quyidagi qator bo'lsin (agar boshqa
  atribution ko'rsatma berilmagan bo'lsa):
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- **DIQQAT — repo nomi nomuvofiqligi:** `CLAUDE.md` da repo `shohruhbektemirov21s-pixel/taskmangeri`
  deb yozilgan, lekin haqiqiy `git remote -v` `shohruhbektemirov21s-pixel/tasklar.git` ni ko'rsatadi.
  Push qilishdan oldin buni foydalanuvchidan aniqlashtirib ol — noto'g'ri repo'ga ketishi mumkin.

---

## 2. Joriy holat (bu prompt yozilgan paytda tasdiqlangan)

```
Branch:        refactor/architecture-review
Oxirgi commit:  7ae86e2 "wip: order files to project, dashboard and order badge rework"
git status:     toza (faqat docs/ va .claude/worktrees/ untracked, ular pastda tushuntirilgan)
```

`7ae86e2` commiti avvalgi suhbatda commit qilingan ish-jarayon o'zgarishlarini o'z ichiga oladi:
buyurtma fayllarini loyihaga biriktirish (`orders/services.py`), `tasks/models.py` dagi
`allowed_transitions` mantig'i o'zgarishi, Dashboard/ChangeRequests/OrderBadges UI qayta ishlanishi,
`project/Brief.tsx`, `History.tsx`, `Onboarding.tsx` sahifalari o'chirilgan. Bu commit **saqlanadi**,
uni qaytarma.

### 2.1. `docs/` papkasida tayyor audit hisobotlari bor (READ-ONLY, tayyor, ISHONCHLI manba)

Ikkita fayl allaqachon yozilgan va to'liq — ularni QAYTA YOZMA, faqat o'qi va ulardan foydalan:

- **`D:\Task\docs\ARCHITECTURE_REPORT.md`** — to'liq arxitektura auditi: barcha API endpoint jadvali,
  ma'lumotlar bazasi holati, frontend tuzilishi, auth, kontrakt nomuvofiqliklari, qatlam buzilishlari,
  N+1 xavflari, P0/P1/P2 ustuvor muammolar ro'yxati.
- **`D:\Task\docs\STATIC_DATA_REPORT.md`** — mock/soxta ma'lumot, qattiq yozilgan matnlar, yetishmayotgan
  `tx()` kalitlari, demo/seed nazorati, qonuniy statik konfiguratsiya ro'yxati.

Bu ikkala hisobotning eng muhim (tasdiqlangan) topilmalari 4-bo'limda ro'yxatlangan — ularni
o'qishing shart emas, lekin qo'shimcha kontekst kerak bo'lsa o'sha fayllarga qayt.

### 2.2. Ishlatilmagan git worktree/branch qoldiqlari (tozalash yoki e'tiborsiz qoldirish kerak)

Avvalgi urinishda 7 ta sub-agent parallel ishga tushirilgan edi (worktree izolatsiyasi bilan),
lekin foydalanuvchi ularni ish boshlanishida to'xtatib qo'ydi. Natijada:

```
agent/database              → 3e236ed (asosiy branchdan orqada, HECH QANDAY foydali commit yo'q,
                                faqat worktree ichida COMMIT QILINMAGAN migratsiya fayli bor:
                                backend/apps/uitexts/migrations/0004_alter_systemsetting_logo.py —
                                bu fayl to'g'ri va kerakli, pastda 5.1-bandda qaytadan yaratiladi)
agent/backend-api            → 3e236ed, o'zgarishsiz
agent/backend-perf           → 3e236ed, o'zgarishsiz
agent/auth                   → 7ae86e2, o'zgarishsiz
agent/frontend-api           → 3e236ed, o'zgarishsiz
agent/frontend-pages-orders  → 3e236ed, o'zgarishsiz
agent/frontend-pages-core    → 3e236ed, o'zgarishsiz

Worktree papkalari (bo'sh/foydasiz, D:\Task\.claude\worktrees\ ostida):
  agent-a0eef05cd6c1acaed  (agent/database)
  agent-a56341f8f361f9833  (agent/auth)
  agent-acdba2be8c1442719  (asosiy branch, hech narsa qilinmagan)
```

**Qaror:** bu branch/worktree'larda saqlanadigan hech qanday noyob ish yo'q (migratsiya fayli
bir necha soniyada qaytadan generatsiya qilinadi). Ularni QAYTA ISHLATMA — chalkashlik keltirib
chiqaradi. Ikkita variantdan birini tanla:

- **(A, tavsiya etiladi) Eski nomlarga tegma, yangi worktree'lar boshqa branch nomlari bilan och**
  (masalan `agent/database-2`, `agent/backend-api-2`, ...). Bu hech qanday ruxsat/destructive
  buyruq talab qilmaydi.
- **(B) Avval tozala**, keyin xuddi shu nomlarni qayta ishlat:
  ```bash
  cd /d/Task
  git worktree remove --force .claude/worktrees/agent-a0eef05cd6c1acaed
  git worktree remove --force .claude/worktrees/agent-a56341f8f361f9833
  git worktree remove --force .claude/worktrees/agent-acdba2be8c1442719
  git worktree prune
  git branch -D agent/database agent/backend-api agent/backend-perf agent/auth agent/frontend-api agent/frontend-pages-orders agent/frontend-pages-core
  ```
  **Eslatma:** bu buyruqlar bitta katta bash chaqiruvida birlashtirilganda avtomatik ruxsat
  tizimi (permission classifier) "xavfli" deb rad etgan edi. Agar shunday bo'lsa: buyruqlarni
  BITTA-BITTA, alohida chaqiruvlarda yubor; baribir rad etilsa, foydalanuvchidan qo'lda
  tasdiqlashni so'ra — bu destructive amal, uni chetlab o'tishga urinma.

Ushbu prompt (B) ni emas, (A) ni tavsiya qiladi — soddaroq va xavfsizroq.

---

## 3. Ishlab chiqilgan REJA — 9 bosqich

Bu foydalanuvchi bergan "MULTI-AGENT DEVELOPMENT MODE" ko'rsatmasiga asoslangan, loyihaga moslashtirilgan reja:

```
PHASE 1  PROJECT AUDIT              — TUGADI (docs/ARCHITECTURE_REPORT.md, docs/STATIC_DATA_REPORT.md)
   ↓
PHASE 2  DATABASE                   — BOSHLANMAGAN (qayta boshlash kerak)
   ↓
PHASE 3  BACKEND API + PERF         — BOSHLANMAGAN
   ↓
PHASE 4  FRONTEND API LAYER         — BOSHLANMAGAN
   ↓
PHASE 5  FRONTEND PAGES (2 agent)   — BOSHLANMAGAN
   ↓
PHASE 6  AUTH + SECURITY            — BOSHLANMAGAN
   ↓
PHASE 7  TESTING                    — BOSHLANMAGAN
   ↓
PHASE 8  FINAL INTEGRATION          — BOSHLANMAGAN
   ↓
PHASE 9  FULL PROJECT AUDIT         — BOSHLANMAGAN
```

Database, Backend API va Auth&Security bir-biriga bog'liq emas — **parallel** ishga tushirilishi
mumkin (fayl scope'lari ajratilgan, pastda 5-bo'limda). Backend Perf backend-api bilan bir vaqtda,
lekin BOSHQA fayllarda ishlaydi (scope pastda). Frontend API — backend API tugagach (yoki hech
bo'lmaganda kontrakt/exportlar barqarorlashgach) boshlansin, chunki Frontend Pages agentlari
Frontend API ekportlariga tayanadi. Auth&Security ham deyarli mustaqil, parallel yurishi mumkin.

### 3.1. Agent Tool bilan ishga tushirish sxemasi

Har bir sub-agentni **alohida git worktree**da (`isolation: "worktree"`), `subagent_type: "backend"`
yoki `"frontend"` bilan, **`run_in_background: true`** bilan ishga tushir (parallel ishlaydiganlari
uchun). Har biriga: aniq OWNED fayllar ro'yxati, READ-ONLY fayllar ro'yxati, aniq vazifalar,
tekshirish (typecheck/lint/test) buyruqlari, va oxirida qat'iy STATUS/FILES_CHANGED/...
formatida hisobot qaytarishni so'ra (7-bo'limga qara).

**Muhim: konteynerlar `D:\Task`ni mount qiladi, sub-agent worktree'sini EMAS.** Shuning uchun
sub-agent o'z worktree'sidagi kodni tekshirish uchun **mavjud image**lardan (`task-backend`,
`task-frontend`) foydalanib, o'z worktree papkasini vaqtinchalik volume sifatida ulashi kerak:

```bash
# Backend uchun (worktree ichidan, Git Bash):
WT="$(pwd -W)"
MSYS_NO_PATHCONV=1 docker run --rm --network task_teamflow --env-file D:/Task/backend/.env \
  -e DB2_TEST_DB=<HAR_BIR_AGENT_UCHUN_NOYOB_NOM> \
  -v "$WT/backend:/app" --entrypoint python task-backend manage.py test --noinput <target>

# Frontend uchun:
WT="$(pwd -W)"
MSYS_NO_PATHCONV=1 docker run --rm -v "$WT/frontend:/app" -v /app/node_modules task-frontend npm run typecheck
```

`DB2_TEST_DB` nomi har bir agent uchun BOSHQA-BOSHQA bo'lsin (masalan `TFDBAG`, `TFAPIAG`, `TFSECAG`,
`TFPERFAG`) — aks holda Db2 test bazasi ustida to'qnashadi. Har doim `--noinput` (aks holda
`ibm_db_django` interaktiv savol berib qotib qoladi). Agar `EOFError` chiqsa — bazadan emas, eski
sinov bazasi qolib ketganidan, `DB2_TEST_DB` nomini o'zgartir.

**Live (asosiy) konteynerlarda ishlagan `manage.py migrate` yoki demo/seed skriptlarini ISHLATMA** —
faqat orchestrator, integratsiya bosqichida (Phase 8), migratsiyalarni qo'llaydi.

---

## 4. Tasdiqlangan topilmalar — bevosita vazifalarga aylantirilgan (P0/P1)

Bu ro'yxat ikkala audit hisobotidan (ARCHITECTURE_REPORT.md, STATIC_DATA_REPORT.md) chiqarilgan
va orchestrator tomonidan **kodda shaxsan tekshirilgan** (grep/sed bilan tasdiqlangan) haqiqiy
muammolar. Har birini tegishli sub-agentga ber. Ishni boshlashdan oldin sub-agent baribir
`file:line`ni o'zi ochib ko'rishi kerak — kod picha o'zgargan bo'lishi mumkin.

### 4.1. P0 — Xavfsizlik: foydalanuvchi o'zini o'zi imtiyozli qiladi

**Fayl:** `backend/apps/accounts/serializers.py:71, 90-103` (`UserProfileSerializer` yoki shunga
o'xshash — `PATCH /api/auth/me/` shu orqali ishlaydi).

- `department_name` maydoni yoziladigan (`required=False, allow_blank=True`), `update()` da
  `Department.objects.get_or_create(name=dept_name)` chaqiriladi va `instance.department`ga
  o'rnatiladi. **Muammo:** `backend/apps/orders/visibility.py:38-45` dagi `sohaviy_q(user)`
  aynan `user.department.name` bo'yicha filtrlaydi — ya'ni foydalanuvchi o'zi xohlagan
  bo'linma nomini yozib, o'sha bo'linmaning barcha (qoralama bo'lmagan) buyurtmalarini
  ko'ra oladi.
- `specialty` maydoni ham `read_only` emas, validatsiyasiz yoziladi (`serializers.py:79, 89`).
  **Muammo:** `"SOHAVIY"` qiymati `orders/api.py:57` da buyurtmalarga kirish/yaratish huquqini
  beradi; `"PM"` qiymati `tasks/services.py:401` da `is_pm_or_boss`ni `True` qiladi (odam PM
  bergan vazifalarni tahrirlay oladi) va `orders/workflow.py:99` dagi `can_be_order_pm`dan ham
  o'tadi.

**Vazifa (Backend API agent):** `/api/auth/me/` orqali `department` va rol beruvchi
`specialty` qiymatlarini (`SOHAVIY`, `PM` — aniq ro'yxatni kodda `SpecialtyItem`/`TextChoices`
dan tekshir) o'zgartirib bo'lmasin. Faqat administrator (mavjud rol/administratsiya endpointi
orqali) buni o'zgartira olsin. Amaldagi administratsiya yo'lini (masalan foydalanuvchi ro'yxati
sahifasi, `PATCH /api/users/:id/`) buzma — faqat **o'z-o'zini** tahrirlash yo'lini yoping.
Ikkala holat uchun ham test yoz (P0 ekanligi uchun bu eng ustuvor vazifa).

### 4.2. P0 — Xavfsizlik: `setup_roles` produksiyada parollarni qayta tiklaydi

**Fayl:** `backend/apps/accounts/management/commands/setup_roles.py:61-101` (orchestrator
tomonidan shaxsan o'qib tasdiqlangan).

- `DEBUG` tekshiruvisiz `admin@teamflow.uz` foydalanuvchisining parolini har safar `"admin123"`ga
  qaytaradi (`admin_user.set_password("admin123")`).
- `menejer@teamflow.uz` / `menejer123` va `operator@teamflow.uz` / `operator123` hisoblarini
  yaratadi (yoki mavjudini shu holga qaytaradi) va parollarni `stdout`ga chiqaradi.
- Bu buyruq entrypoint'dan avtomatik chaqirilmaydi (tekshirildi), lekin kimdir uni qo'lda
  produksiyada ishga tushirsa — admin paroli ma'lum bo'lib qoladi.

**Vazifa (Auth & Security agent):** `seed_demo` qanday `SEED_DEMO=1` va `DEBUG=1` bilan
qulflangan bo'lsa, shunga o'xshash himoya qo'sh: `DEBUG=False` da ma'lum parolli hisob
yaratish/qayta tiklashni rad et. Mavjud foydalanuvchining parolini HECH QACHON qayta
tiklama (agar u allaqachon mavjud bo'lsa). Parollarni stdout'ga chiqarma. Guruh/ruxsat
sozlash qismi (buyruqning zararsiz qismi) produksiyada ishlashda davom etsin. Test yoz:
`DEBUG=False` da parol o'zgarmasligini, `DEBUG=True` da eski xatti-harakat saqlanishini.

### 4.3. P1 — O'qish shlyuzi (`POST /api/read/`) query-string'ni yo'qotadi

**Fayl:** `backend/apps/core/read.py:106` atrofida — yo'ldagi `?query` qismi jo'natilib,
lekin `params`ga qo'shilmasdan tashlab yuboriladi.

**Ta'sir:** `frontend/src/pages/TaskForm.tsx:74` dagi `/projects/?scope=visible` amalda
`scope=mine`ga aylanib qoladi (a'zo bo'lmagan menejer/boshliq formada o'z loyihalarini
ko'rmaydi); `frontend/src/pages/WorkDone.tsx:143` dagi `?page_size=200` e'tiborsiz qoladi,
faqat 30 ta loyiha keladi.

**Vazifa (Backend API agent):** shlyuzda yo'ldan `?...` qismini ajratib, `params`ga
(mavjud `params`ni USTUN qo'yib, ya'ni aniq berilgan parametr yo'ldagisidan ustun) qo'shib
yubor. Test yoz.

### 4.4. P1 — Logout va refresh token blacklist

**Fayl:** `backend/apps/accounts/api.py:283` (logout), `:162-163` (RefreshView).

Access token muddati tugagach logout so'rovi `401` qaytaradi (chunki logout autentifikatsiya
talab qiladi, lekin token allaqachon yaroqsiz). Refresh token blacklist qilinmaydi;
`tf_refresh` HttpOnly cookie 14 kun amal qiladi va shu muddat davomida qabul qilinaveradi.

**Vazifa (Backend API agent, `token_blacklist` ilovasi bormi tekshirib):** logout faqat
refresh cookie orqali ishlasin (access token shart emas) va refresh tokenni blacklistga
qo'shsin. Agar `rest_framework_simplejwt.token_blacklist` `INSTALLED_APPS`da bo'lmasa —
buni **settings.py**ga qo'shish kerak (bu Security agent scope'i) — shu holda ushbu
o'zgarishni DEPENDENCIES sifatida orchestratorga qaytar, o'zing settings.py ga tegma.

### 4.5. P1 — SVG logotip orqali stored XSS

**Fayl:** `backend/apps/core/media.py:42, 67`, `backend/apps/uitexts/api.py:96`.

Yuklangan SVG logotip tokensiz va **inline** (`Content-Disposition: inline` yoki hech qanday
sarlavhasiz) beriladi. SVG ichiga JS yozib qo'yish mumkin, u ilova origin'ida ishlaydi va
`localStorage`dagi tokenlarni o'qiy oladi. Koddagi izohda buning teskarisi (xavfsiz deb)
yozilgan — ISHONMA, tekshirib ko'r.

**Vazifa (Backend API agent):** SVG (va umuman rasm bo'lmagan yuklangan fayllarni) `Content-
Disposition: attachment` bilan yoki qat'iy CSP (`Content-Security-Policy: sandbox`,
`X-Content-Type-Options: nosniff`) bilan qaytar. Mavjud logotip ko'rsatish funksiyasini
(saytda `<img>` sifatida ko'rinishi) buzma — brauzer `<img src>` orqali yuklashda bu
sarlavhalar muammo tug'dirmaydi, faqat to'g'ridan-to'g'ri navigatsiya/skriptni bloklaydi.

### 4.6. P1/P2 — Vazifalar va buyurtmalar ro'yxatida N+1 so'rovlar

**Fayl:** `backend/apps/tasks/services.py:427-453` (`can_edit_task` har qator uchun
`ProjectAccess` yasaydi, `assignments.filter().exists()` prefetch'ni chetlab o'tadi, qo'shimcha
`ProjectMember` so'rovi bor), `backend/apps/tasks/serializers.py:146, 263-272`
(`parent_code`/`parent_title` uchun `select_related` yo'q — `backend/apps/tasks/models.py:107`),
`backend/apps/orders/serializers.py:439-451, 540` (`get_tasks`, `project.progress()` — 2 ta
COUNT, `linked_task.project` — buyurtmaga ~5-7 so'rov).

**Vazifa (Backend Perf agent, YANGI, alohida scope — pastga qara):** xatti-harakat va
ruxsatlarni O'ZGARTIRMASDAN, faqat so'rovlar sonini kamaytir: prefetch qilingan ma'lumotdan
foydalan, per-request context'da memoize qil, `select_related` qo'sh. Query-count test yoz
(`assertNumQueries` uslubida) — qator soni oshsa ham so'rov soni o'smasligini isbotla.

### 4.7. P1/P2 — Frontend: noto'g'ri/yetishmayotgan matn va nomuvofiq enumlar

- **`WorkDone.tsx:351`** — bajarilgan ishlar tabida `work_done.tab_bajariladiganlar`
  ("Bajariladiganlar") kaliti ishlatiladi — MA'NOSI TESKARI. To'g'ri kalit
  `work_done.tab_bajarilgan` bazada bor, lekin ishlatilmagan. **Bitta so'zni almashtirish —
  darhol tuzat.**
- **`OrderBadges.tsx:58-142`** — `ORDER_STATUS_CONFIG` backendda yo'q qiymatlarni ishlatadi
  (`IN_DEVELOPMENT`, `WAITING_CLIENT`), backendda BOR qiymatlar yo'q (`IN_PROGRESS`,
  `READY_FOR_REVIEW`, `CANCELLED` — булар `NEW` config'iga tushib qoladi). Backend haqiqiy
  ro'yxati: `backend/apps/orders/models.py` dagi `OrderStatus` va `workflow.py`.
- **`OrderBadges.tsx:63-190`** dagi `orders.status_*` va `yangi_versiya_kutilmoqda` kalitlari,
  `OrderDetail.tsx:1408` dagi `common.fayl`, `OrderDetail.tsx:3125` dagi
  `common.tasdiqlanmoqda` — `defaults.json`da FALLBACKSIZ ishlatiladi, ya'ni ekranda matn
  o'rniga kalit nomi ko'rinadi. Kalitlarni `defaults.json`ga qo'sh.
- **`NotificationModal.tsx:133`** — rad etilganini `title.includes("rad etildi")` matn
  qidiruvi bilan aniqlaydi. `Notification` modelida `kind` maydoni bor
  (`backend/apps/notifications/models.py`, `NotificationKind`) — agar serializer/frontend tipi
  buni tashiydigan bo'lsa, matn qidirish o'rniga `kind`dan foydalan.
- **`OrderForm.tsx:48`** — loyihalar ro'yxatini `page_size` siz so'raydi, shuning uchun tanlovda
  faqat 30 ta loyiha ko'rinadi. `pagesOf`/`totalOf` (`api/client.ts`) yordamchilaridan foydalan.
- **O'lik/mos kelmaydigan frontend tip maydonlari:** `is_manager` (11 joyda ishlatiladi, masalan
  `App.tsx:116`) va `User.department` (`OrderForm.tsx:57`) — backend bunday maydon yubormaydi
  (`is_platform_admin`/`department_name` bor). Har bir ishlatilgan joyni to'g'ri maydonga
  almashtir.
- **Ikkilangan enum ro'yxatlari** — `OrderDetail.tsx:2981`, `People.tsx:1095` dagi ustuvorlik
  `<option>`lari va `ChangeRequests.tsx:1011`, `Dashboard.tsx:1125` dagi buyurtma holati
  filtri qo'lda takrorlangan, holbuki `/api/meta/` allaqachon `task_priority` va
  `order_filter_status` beradi (kengaytirilsa — 4.9 ga qara). Frontendda shu manbadan o'qishga
  o'tkaz.
- **Mutaxassislik ikki manbadan keladi:** kodda `TextChoices`, bazada `SpecialtyItem` jadvali.
  `backend/apps/accounts/api.py:457` (`specialty_stats`) bazaga admin qo'shgan mutaxassislikni
  xom kod holida chiqaradi; `:496` dagi rol `PATCH`i admin qo'shgan mutaxassislikni jimgina
  rad etadi. Bazani yagona manba qil.

To'liq ro'yxat (P2 darajadagilar, indeks tavsiyalari, `defaults.json` sifati muammolari —
105 ta qiymatda tutuq belgisi yo'qolgan va h.k.) uchun `docs/STATIC_DATA_REPORT.md` ni o'qi.

### 4.8. Qatlam qoidasi buzilishi (arxitektura qarori kerak — orchestrator hal qiladi)

- `notifications` → `telegram` ni import qiladi (`notifications/services.py:164`).
- `projects` → `orders.services`ni modul darajasida import qiladi (`projects/api.py:18`,
  `serializers.py:5`) — CLAUDE.md aniq taqiqlagan ("`from apps.orders.models` ni `projects`
  ichiga funksiya ichida ham qo'yma").

**Vazifa (orchestrator, Phase 3dan keyin, Backend API agentidan hisobot kelgach):** ikkala
holatni ham CLAUDE.mddagi naqshga ko'ra tuzat — `orders`ga bog'lanish kerak bo'lgan joy
servis funksiyasi orqali (`apps/orders/services.py` da allaqachon bor
`link_order_to_project`/`unlink_project_orders`/`order_earliest_start` singari) yoki teskari
`related_name` orqali (`permissions._projects_with_my_orders` namunasidagi kabi) qilinsin.
Buni alohida kichik vazifa sifatida Backend API agentga ber (`projects/api.py`,
`projects/serializers.py` — bu fayllar odatda "projects" domenida, lekin bu ish orders
bog'liqligini olib tashlash bo'lgani uchun Backend API agent scope'iga kiritilsin).

### 4.9. Ochiq savol — foydalanuvchidan so'ralishi kerak (orchestrator hal qilolmaydi)

`Inquiries.tsx` sahifasi hech qaysi marshrutga ulanmagan (`App.tsx:197` atrofida tekshir).
Bu ataylab shundaymi (ishlab chiqilayotgan funksiya) yoki sahifa yo'qolib qolganmi —
**foydalanuvchidan so'ra**, AskUserQuestion orqali, ishni davom ettirishdan oldin yoki
Phase 9da alohida band sifatida.

---

## 5. Sub-agentlarning aniq FILE SCOPE'i (conflict bo'lmasligi uchun)

Quyidagi jadval — HAR BIR fayl FAQAT bitta agentga tegishli bo'lishini kafolatlaydi.
Buni sub-agent promptlariga so'zma-so'z ko'chir.

| Agent | Branch nomi | OWNED (yozadi) | READ-ONLY |
|---|---|---|---|
| **Database** | `agent/database` (band bo'lsa `-2`) | `backend/apps/*/models.py`, `backend/apps/*/migrations/**` | qolgan hammasi |
| **Backend API** | `agent/backend-api` | `backend/apps/**/api.py`, `serializers.py`, `services.py`, `urls.py`, `permissions.py`, `filters.py`, `visibility.py`, `workflow.py` (barcha appda, **backend/apps/tasks/serializers.py va orders/serializers.py BUNDAN MUSTASNO — ular Backend Perf agentga tegishli**), `backend/apps/**/tests.py`/`tests_*.py`, `backend/tests/**` (`test_security_commands.py` bundan mustasno — Security agentga tegishli), `backend/apps/core/read.py`, `backend/apps/core/media.py`, yangi `docs/API_CONTRACT.md`, yangi `docs/agent-keys/backend-api.json` | `models.py`/migratsiyalar, `management/commands/**`, `backend/scripts/**`, `backend/config/settings.py`, `docker/**`, `frontend/**`, `backend/apps/uitexts/defaults.json` |
| **Backend Perf** | `agent/backend-perf` | FAQAT: `backend/apps/tasks/serializers.py`, `backend/apps/tasks/services.py`, `backend/apps/tasks/api.py`, `backend/apps/orders/serializers.py`, yangi `backend/tests/test_query_counts.py` | qolgan hammasi |
| **Auth & Security** | `agent/auth` | `backend/apps/**/management/commands/**`, `backend/scripts/**`, `backend/docker/**` (entrypoint), `README.md`, `backend/config/settings.py` (faqat xavfsizlik sozlamalari), yangi `backend/tests/test_security_commands.py` | `api.py`/`serializers`/`services`/`permissions`/`urls`, `models`/migratsiyalar, `frontend/**`, `defaults.json` |
| **Frontend API** | `agent/frontend-api` | `frontend/src/api/**`, `frontend/src/auth/**`, `frontend/src/realtime/**`, `frontend/src/i18n/**`, yangi `docs/agent-keys/frontend-api.json` | `frontend/src/pages/**`, `frontend/src/components/**`, `frontend/src/nav/**`, `backend/**`, `defaults.json` |
| **Frontend Pages A (orders)** | `agent/frontend-pages-orders` | FAQAT: `pages/OrderDetail.tsx`, `OrderForm.tsx`, `ChangeRequests.tsx`, `Inquiries.tsx`, `Inquiries.test.tsx`, `pages/orders/**`, `components/inquiry.tsx`, `components/InquiryDrawer.tsx`, yangi `docs/agent-keys/frontend-pages-orders.json` | qolgan hammasi, jumladan `api/**`, `styles/app.css` |
| **Frontend Pages B (qolgani)** | `agent/frontend-pages-core` | `frontend/src/pages/**`, `components/**`, `nav/**` — **A guruhi fayllaridan TASHQARI** (yuqoridagi ro'yxatga qara), yangi `docs/agent-keys/frontend-pages-core.json` | `api/**`, `auth/**`, `realtime/**`, `i18n/**`, `main.tsx`, `styles/app.css`, A guruhi fayllari, `backend/**`, `defaults.json` |

**Qat'iy qoida:** `backend/apps/uitexts/defaults.json`ga BU BOSQICHDA HECH BIR agent to'g'ridan-
to'g'ri tegmaydi. Yangi `tx()` kaliti kerak bo'lsa, agent uni `docs/agent-keys/<agent-nomi>.json`
ga `{"kalit": {"value": "o'zbekcha matn", "note": "qayerda ishlatiladi"}}` shaklida yozadi.
Integratsiya bosqichida (Phase 8) orchestrator barcha `docs/agent-keys/*.json` fayllarni
`defaults.json`ga birlashtiradi va `seed_ui_texts` ishga tushiradi.

---

## 6. Har bir sub-agent uchun vazifa matni (tayyor, ko'chirib ishlatsa bo'ladi)

> Quyidagi matnlarni Agent tool'ga `prompt` sifatida, `isolation: "worktree"`,
> `run_in_background: true` bilan ber. Har birida: (1) worktree ichida `git switch -c <branch>`
> qil, (2) CLAUDE.mdni o'qi, (3) OWNED/READ-ONLY ro'yxatini so'zma-so'z ber, (4) 4-bo'limdagi
> tegishli vazifalarni ber, (5) tekshirish buyruqlarini ber (3.1-bo'lim), (6) 7-bo'limdagi
> hisobot formatini so'ra. To'liq matnlar juda uzun bo'lgani uchun bu yerda qisqa skelet
> beriladi — har bir band uchun 4-bo'limdagi tegishli izohni to'liq joylashtir.

### 6.1 Database agent prompt skeleti

```
AGENT: DATABASE. Worktree: git switch -c agent/database (yoki band bo'lsa agent/database-2).
CLAUDE.mdni o'qi. OWNED: backend/apps/*/models.py, backend/apps/*/migrations/**. READ-ONLY: qolgani.

VAZIFA 1: `makemigrations --check` bo'yicha uitexts.SystemSetting.logo uchun migratsiya yetishmaydi
(upload_to callable branding_logo_upload_to ga o'zgargan). `manage.py makemigrations` bilan
generatsiya qil (qo'lda yozma).
VAZIFA 2: backend/apps/tasks/models.py oxirgi commitda o'zgargan (allowed_transitions) —
migratsiya kerak emasligini tasdiqla.
VAZIFA 3: modellarda ko'p filtrlanadigan FK/maydonlarga indeks yetishmasligini FAQAT aniq
dalil (so'rov file:line) bilan NEXT_STEP'da tavsiya qil — o'zing qo'shma (Db2da katta jadval,
xarajat yuqori).
Tekshirish: 3.1-bo'limdagi docker run naqshi, DB2_TEST_DB=TFDBAG.
Commit qil, push qilma. 7-bo'limdagi formatda hisobot ber.
```

### 6.2 Backend API agent prompt skeleti

```
AGENT: BACKEND API. Worktree: git switch -c agent/backend-api. CLAUDE.mdni o'qi (api.py/services.py
konvensiyasi, qatlam tartibi, visible_orders, permissions helperlari).
OWNED/READ-ONLY: 5-bo'lim jadvalidagi "Backend API" qatori.

VAZIFALAR (ustuvorlik tartibida, har birini 4-bo'limdan to'liq o'qi va joriy holatini tekshir):
1. 4.1-band (P0: department/specialty o'zini-o'zi imtiyozlashtirishi) — ENG USTUVOR.
2. 4.3-band (o'qish shlyuzi query-string yo'qolishi).
3. 4.4-band (logout/refresh blacklist — token_blacklist app yo'q bo'lsa settings o'zgarishini
   DEPENDENCIES ga yoz, o'zing settings.py ga tegma).
4. 4.5-band (SVG XSS).
5. 4.7-band dagi enum/meta kengaytirish: /api/meta/ ga to'liq OrderStatus va bazadagi
   specialties ro'yxatini qo'sh (qo'shimcha, mavjudini o'chirma/o'zgartirma).
6. 4.8-band (projects → orders.services import buzilishi) — servis funksiyasi yoki teskari
   related_name orqali tuzat.
7. docs/API_CONTRACT.md yoz: /api/ ostidagi HAMMA endpoint, app bo'yicha guruhlangan — metod,
   yo'l, ruxsat, so'rov/javob asosiy maydonlari, sahifalash, filtrlar, xato kodlari. O'zgargan
   joylarni **(o'zgardi)**/**(yangi)** bilan belgila. Uzbek tilida, jadval shaklida.
8. O'zgargan har bir narsa uchun test yoz/yangila.

Tekshirish: 3.1-bo'limdagi docker run naqshi, DB2_TEST_DB=TFAPIAG, target testlar (to'liq suite
oxirida vaqt bo'lsa).
Commit qil, push qilma. 7-bo'limdagi formatda hisobot ber (API_CHANGED maydonini to'liq to'ldir —
frontend agentlar shunga tayanadi).
```

### 6.3 Backend Perf agent prompt skeleti

```
AGENT: BACKEND PERF. Worktree: git switch -c agent/backend-perf.
OWNED: FAQAT backend/apps/tasks/serializers.py, tasks/services.py, tasks/api.py,
orders/serializers.py, yangi backend/tests/test_query_counts.py. READ-ONLY: qolgan hammasi.

VAZIFA: 4.6-bandni to'liq bajar. Xatti-harakat va ruxsatlarni bitta bit ham o'zgartirmasdan,
so'rovlar sonini kamaytir. orders/api.py da queryset o'zgarishi kerak bo'lsa (sening scope'ingda
emas) — aniq o'zgarishni DEPENDENCIES da yoz, o'zing tegma.
Test: query-count testi yoz (qator soni oshganda so'rov soni o'smasligini isbotlaydigan).

Tekshirish: 3.1-bo'lim, DB2_TEST_DB=TFPERFAG.
Commit qil, push qilma. 7-bo'lim formatida hisobot (TESTS maydonida "oldin→keyin" son ber).
```

### 6.4 Auth & Security agent prompt skeleti

```
AGENT: AUTH & SECURITY. Worktree: git switch -c agent/auth. CLAUDE.mdni o'qi (is_listed/is_public,
join_code, can_appoint_admin, get_client_ip/TRUSTED_PROXIES, seed_demo qulfi, run_later).
OWNED/READ-ONLY: 5-bo'lim jadvalidagi "Auth & Security" qatori.

VAZIFALAR:
1. 4.2-band (P0: setup_roles) — ENG USTUVOR.
2. STATIC_DATA_REPORT.md dagi seed qulfi chetlab o'tilishi: backend/scripts/clean_database.py:26-42
   SEED_DEMO/DEBUG qulfisiz run_seed()ni chaqiradi; seed_demo_data.py:314 __main__;
   benchmark skriptlari DEBUG tekshiruvisiz o'n minglab yozuv qo'shadi. Qulfni run_seed() ichiga
   (yoki yagona nazorat nuqtasiga) ko'chir, destructive skriptlarga DEBUG tekshiruvi qo'sh.
3. README.md dagi eskirgan parollarni o'chir.
4. O'QISH-FAQAT xavfsizlik ko'rigi (scope tashqarisidagilarni tuzatma, faqat report qil):
   JWT sozlamalari, CORS/CSRF/ALLOWED_HOSTS, WebSocket consumer autentifikatsiyasi, frontend
   token saqlash (frontend/src/auth — o'qi, tegma), repo'da commit qilingan sirlar bormi
   (`git ls-files | grep -i env` — .env gitignore qilinganmi tekshir).
5. Test yoz: backend/tests/test_security_commands.py — setup_roles DEBUG=False da parol
   o'zgartirmasligi, run_seed qulfi ishlashi.

Tekshirish: 3.1-bo'lim, DB2_TEST_DB=TFSECAG. setup_roles/seed/clean skriptlarini HECH QACHON
live (asosiy) bazaga qarshi ishga tushirma.
Commit qil, push qilma. 7-bo'lim formatida hisobot (DEPENDENCIES da scope tashqarisidagi
topilmalarni P0/P1/P2 va file:line bilan yoz).
```

### 6.5 Frontend API agent prompt skeleti

```
AGENT: FRONTEND API. Worktree: git switch -c agent/frontend-api. CLAUDE.mdni o'qi (tx() qoidasi,
api/ qatlami, page_size/Pager, mock data taqiqi).
OWNED/READ-ONLY: 5-bo'lim jadvalidagi "Frontend API" qatori.
QATTIQ QOIDA: api/ dan tashqarida import qilinadigan hech qanday export'ni o'chirma/nomini
o'zgartirma (avval grep bilan tekshir — sahifa agentlari parallel shu API'ga tayanadi).

VAZIFALAR:
1. api/orders.ts:8-148 dagi ishlatilmaydigan (grep bilan tasdiqla) ikkinchi buyurtma-holat
   konfiguratsiyasini o'chir.
2. api/*.ts, auth/*, realtime/* dagi ~23 ta qattiq yozilgan matnni tx()ga o'tkaz. Mavjud
   kalitdan foydalan yoki docs/agent-keys/frontend-api.json ga yangi kalit yoz.
3. Sahifalash yordamchilari (pagesOf/totalOf), token-yangilash oqimi (auth/, client.ts),
   WebSocket qayta ulanish/autentifikatsiya (realtime/) — xatolarni TUZAT (o'z scope'ingda),
   sahifa darajasidagi muammolarni (masalan bir sahifa to'g'ridan-to'g'ri fetch qilsa) FAQAT
   report qil, tegma.
4. vitest test qo'sh/kengaytir (api/client.test.ts namunasida).
5. tx("literal") kalitlarini defaults.json bilan solishtiruvchi test yozishga urin — agar
   frontend konteyner backend/ papkasini o'qiy olmasa (mount qilinmagan), buni ishlatib
   bo'lmasligini reportda yoz, testni it.skip qilib qoldir.

Tekshirish: 3.1-bo'lim (typecheck, lint, test — hammasi yashil, lint yangi ogohlantirish
qo'shmasin, CI --max-warnings 30).
Commit qil, push qilma. 7-bo'lim formatida hisobot (API_CHANGED — qaysi export o'zgargani,
NEW_TX_KEYS soni).
```

### 6.6 Frontend Pages A (orders) agent prompt skeleti

```
AGENT: FRONTEND PAGES A (orders/inquiries). Worktree: git switch -c agent/frontend-pages-orders.
CLAUDE.mdni o'qi.
OWNED: FAQAT pages/OrderDetail.tsx, OrderForm.tsx, ChangeRequests.tsx, Inquiries.tsx,
Inquiries.test.tsx, pages/orders/**, components/inquiry.tsx, components/InquiryDrawer.tsx,
yangi docs/agent-keys/frontend-pages-orders.json. READ-ONLY: qolgan hammasi (jumladan api/**,
styles/app.css — dizaynni buzma).

VAZIFALAR: 4.7-banddan sening fayllaringga tegishli barcha item: OrderBadges status
moslashtirish, fallbacksiz kalitlar, OrderDetail/ChangeRequests/Inquiries qattiq matnlari,
OrderForm page_size, User.department o'lik maydoni (faqat shu faylda), ustuvorlik/holat
<option> ikkilanishi (agar api/ da meta o'quvchi funksiya BOR bo'lsa ishlat, yo'q bo'lsa
DEPENDENCIES ga yoz — o'zing api/ ga tegma).

Tekshirish: 3.1-bo'lim (typecheck/lint/test yashil, yangi ogohlantirishsiz).
Commit qil, push qilma. 7-bo'lim formatida hisobot.
```

### 6.7 Frontend Pages B (qolgani) agent prompt skeleti

```
AGENT: FRONTEND PAGES B (qolgan barcha sahifa/komponent). Worktree:
git switch -c agent/frontend-pages-core. CLAUDE.mdni o'qi.
OWNED: pages/**, components/**, nav/** — A guruhi fayllaridan TASHQARI (6.6dagi ro'yxatga
qara, ularga tegma). yangi docs/agent-keys/frontend-pages-core.json.
READ-ONLY: api/**, auth/**, realtime/**, i18n/**, main.tsx, styles/app.css, A guruhi
fayllari, backend/**, defaults.json.

VAZIFALAR: 4.7-banddan qolgan barcha item: WorkDone.tsx:351 teskari matn (DARHOL tuzat —
eng oson va aniq bug), NotificationModal.tsx kind orqali aniqlash (agar frontend tipida
kind mavjud bo'lsa; bo'lmasa DEPENDENCIES), Admin.tsx/TaskDetail.tsx qattiq matnlari,
nav/history.ts, dates.tsx (UZ_MONTHS/UZ_WEEKDAYS)/Calendar.tsx sana nomlari, People.tsx/
Dashboard.tsx enum ikkilanishi (meta o'quvchi bo'lsa ishlat, bo'lmasa report),
Landing.tsx:192-228 "faoliyat" illyustratsiyasini o'chirma, faqat reportda eslat.

Tekshirish: 3.1-bo'lim (typecheck/lint/test yashil).
Commit qil, push qilma. 7-bo'lim formatida hisobot.
```

---

## 7. Sub-agent hisobot formati (har biridan shu shaklda so'ra)

```
STATUS: DONE / BLOCKED / NEED_REVIEW
BRANCH + WORKTREE PATH:
FILES_CHANGED:
API_CHANGED:
DATABASE_CHANGED:
NEW_TX_KEYS: (soni + fayl, agar tegishli bo'lsa)
DEPENDENCIES: (boshqa agent/orchestrator bajarishi kerak bo'lgan narsalar)
POTENTIAL_CONFLICT:
TESTS: (buyruq + natija, "oldin→keyin" son agar tegishli)
NEXT_STEP:
```

Orchestrator har bir hisobotni **shaxsan tekshiradi** (kamida `git diff --stat` va e'lon
qilingan test buyrug'ini qayta ishga tushirib) — sub-agent so'zini ko'r-ko'rona qabul qilma.

---

## 8. Integratsiya (Phase 8) — barcha agent hisobot bergandan keyin

1. `git status`/`git diff --stat` bilan har branchni ko'zdan kechir.
2. Migratsiyalarni birinchi qo'sh (Database agent branchi) — `main`/`refactor/architecture-review`
   ustiga merge qil, `docker compose exec -T backend python manage.py migrate` bilan live
   bazaga qo'lla.
3. Backend branchlarini (API, Perf, Auth) navbat bilan merge qil, har birida
   `python manage.py test --noinput` to'liq suite (kerak bo'lsa `DB2_TEST_DB` boshqa nom bilan).
4. `docs/agent-keys/*.json` fayllarini birlashtirib, `backend/apps/uitexts/defaults.json`ga
   qo'sh (formatga rioya qil: `{kalit: {value, note}}`), `manage.py seed_ui_texts` ishga
   tushir.
5. Frontend branchlarini (API, Pages A, Pages B) navbat bilan merge qil. Har birida
   `npm run typecheck && npm run lint && npm test && npm run build` toza bo'lishi shart.
6. `docs/API_CONTRACT.md`ni yakuniy holatga moslashtir.
7. To'liq backend test suite + to'liq frontend tekshiruvlarini QAYTA ishga tushir (merge
   kelishmovchiliklari yangi xato chiqarishi mumkin).
8. `ui-check` skill (yoki Playwright MCP) bilan `http://localhost:5183`ni OCHIB, ko'z bilan
   tekshir: login, dashboard, buyurtmalar, vazifalar, bildirishnomalar oqimi. Skrinshotni
   foydalanuvchidan so'rama — o'zing tekshir.
9. `docker compose exec -T backend python manage.py makemigrations --check --dry-run` toza
   bo'lishini tasdiqla.
10. 4.9-banddagi ochiq savolni (Inquiries sahifasi) hal qil — kerak bo'lsa foydalanuvchidan so'ra.
11. Barcha `agent/*` worktree/branchlarni tozala (2.2-bo'limdagi kabi, alohida-alohida
    buyruqlar bilan).
12. Yakuniy hisobotni foydalanuvchiga Uzbek tilida ber: nima tuzatildi, nima qoldi (agar bor
    bo'lsa), qaysi fayllar o'zgardi. **Push qilishdan oldin repo nomi nomuvofiqligini
    (1-bo'lim oxiri) hal qilishni so'ra**, keyin foydalanuvchidan tasdiq so'rab push qil.

---

## 9. Phase 9 — Yakuniy to'liq audit

Integratsiyadan keyin Phase 1dagi ikkita agentni (Project Auditor, Static Data Auditor) QAYTA
ishga tushir, ular yangilangan `docs/ARCHITECTURE_REPORT.md` va `docs/STATIC_DATA_REPORT.md`ni
qayta yozsin — barcha P0/P1 band yopilganini tasdiqlasin, yangi muammo qolmaganini ko'rsatsin.

---

## 10. Absolute Rules (foydalanuvchi asl ko'rsatmasidan, qisqartirilgan)

1. Bir xil faylni ikki agent bir vaqtda tahrirlamasin (5-bo'lim jadvali shuni kafolatlaydi).
2. Agentlar o'z scope'idan chiqmasin — chiqish kerak bo'lsa STOP → DEPENDENCIES → orchestrator.
3. Dependency bo'lsa kutiladi (Database → Backend API/Perf → Frontend API → Frontend Pages).
4. Boshqa agent ishini duplicate qilma — avval mavjud implementatsiyani qidir.
5-6. Backend/database mantig'ini frontendga aralashtirma.
7. Sirlarni (parol, token, kalit) frontendga yoki logga chiqarma.
8. Mock/demo ma'lumot production oqimida qolmasin (`SEED_DEMO=1` + `DEBUG=1` tashqarisida).
9. UI/UX dizaynni buzma — faqat matn manbasi va data source o'zgaradi.
10. Har o'zgarishdan keyin test qil.
11. Ishlamaydigan kodni keyingi bosqichga topshirma.
12. Taxmin qilma — har doim kodni o'qib tekshir (bu fayldagi file:line lar ham vaqt o'tishi
    bilan eskirishi mumkin).
13-14. Conflict/xatoni yashirma yoki e'tiborsiz qoldirma — orchestratorga report qil.
15. Integratsiyadan oldin barcha agent hisobotlarini tekshir.

---

**Shu fayl bilan ishni davom ettirish uchun birinchi amaliy qadam:** 2.2-bo'limdagi (A) variantini
tanlab, 6.1–6.4 dagi to'rtta mustaqil agentni (Database, Backend API, Backend Perf, Auth &
Security) parallel ishga tushir — ular fayl scope'i bo'yicha bir-biriga xalaqit bermaydi.
Backend API agent tugab, API_CHANGED hisoboti kelgach, Frontend API agentni (6.5) ishga tushir;
u tugagach ikkita Frontend Pages agentini (6.6, 6.7) parallel ishga tushir.
