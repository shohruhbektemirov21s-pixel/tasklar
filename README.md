# TeamFlow — Enterprise Task & Project Management System

**TeamFlow** — jamoa, loyihalar va vazifalarni boshqarishga mo'ljallangan yirik korporativ boshqaruv platformasi. Tizimda ClickUp va Jira uslubidagi moslashuvchan vazifa boshqaruvi, GitHub uslubidagi ish maydonlari (workspaces) hamda korporativ xiyerarxik boshqaruv (Boshliq, Loyiha menejerlari, Dasturchilar, Sohaviy boshqarmalar) uyg'unlashtirilgan.

Loyiha to'liq zamonaviy mikroxizmatlar va konteynerlashgan arxitektura asosida qurilgan bo'lib, yuqori xavfsizlik, real-vaqt ma'lumot almashinuvi (WebSocket) va IBM Db2 enterprise ma'lumotlar bazasi bilan ishlashga moslashtirilgan.

---

## 🛠 Texnologik Stack

| Qism | Texnologiyalar | Tavsif |
|---|---|---|
| **Backend** | Python 3.12 · Django 5.2 · DRF 3.16 · SimpleJWT | RESTful API, murakkab ORM so'rovlari, qatlamli xavfsizlik va ruxsatlar |
| **Frontend** | React 19 · TypeScript 5.8 · Vite 7 · React Router 7 | Toza arxitektura, qo'lda yozilgan CSS dizayn tizimi, dinamik modullar |
| **Ma'lumotlar bazasi** | IBM Db2 Enterprise 12.1 | Maxsus UTC adapteri, tranzaksiya jurnali va yuqori yuklama uchun sozlangan |
| **Real-time & Kesh** | Django Channels 4.2 · Redis 7 · WebSocket | Jonli chatlar, bildirishnomalar va metrikalarning bir zumda yangilanishi |
| **Xabarnomalar** | Telegram Bot API · Async Tasks | Muhim voqealar, eslatmalar va ogohlantirishlarni xodimlarga yetkazish |
| **Infratuzilma** | Docker Compose (5 ta konteyner) | To'liq izolyatsiyalangan, ishlab chiqish va ishlab chiqarishga tayyor muhit |

---

## 🌐 Konteynerlar va Portlar xaritasi

Tizimning barcha qismlari Docker konteynerlarida ishlaydi:

| Servis | Konteyner nomi | Tashqi port (Host) | Ichki port | Tavsif |
|---|---|---|---|---|
| **frontend** | `teamflow_frontend` | **5183** | 5173 | React veb-interfeysi (Vite dev server) |
| **backend** | `teamflow_backend` | **8010** | 8000 | Django REST API va ASGI/WS serveri |
| **db2** | `teamflow_db2` | **50000** | 50000 | IBM Db2 ma'lumotlar bazasi |
| **redis** | `teamflow_redis` | — | 6379 | Kesh va WebSocket kanal qatlami |
| **telegram** | `teamflow_telegram` | — | 8000 | Telegram bot servisi |

* Brauzer orqali kirish: `http://localhost:5183`
* Backend API: `http://localhost:8010/api/`
* Django ma'muriy boshqaruvi: `http://localhost:8010/django-admin/`

---

## 🚀 Tezkor ishga tushirish (Quick Start)

### 1. Muhit parametrlarini sozlash
Loyiha ildizida va `backend/` papkasida namunaviy muhit fayllarini yarating:
```bash
# Windows PowerShell yoki Linux terminalida
cp .env.example .env
cp backend/.env.example backend/.env
```

### 2. Konteynerlarni yig'ish va ishga tushirish
```bash
docker compose up -d --build
```
> **Izoh:** IBM Db2 og'ir korporativ baza bo'lgani sababli birinchi marta ishga tushishida to'liq sozlangan holda ochilishi uchun 2–4 daqiqa vaqt talab qilinishi mumkin.

### 3. Ma'lumotlar bazasi migratsiyalari va matnlarni urug'lantirish
```bash
# Migratsiyalarni amalga oshirish
docker exec teamflow_backend python manage.py migrate

# Tizim interfeys matnlarini bazaga yuklash
docker exec teamflow_backend python manage.py seed_ui_texts

# Boshliq va administrator hisoblarini yaratish
docker exec teamflow_backend python manage.py bootstrap_boss
```

### 4. Standart kirish hisoblari:
* **Tizim administratori:** `admin@teamflow.uz` / `admin12345`
* **Boshliq hisobi:** `boshliq@teamflow.uz` / `boshliq12345`

---

## 🏛 Tizim arxitekturasi va Modullar

TeamFlow qat'iy me'moriy qatlamlar asosida qurilgan:
```text
panel  →  projects · tasks · activity · accounts · workspaces · orders · inquiries  →  core
```

### 1. Bosh panel (Dashboard — `/panel`)
* **Uch davr kesimi:** Yil boshidan, Oy boshidan va Hafta boshidan ochilgan, bajarilgan va muddati o'tgan vazifalar statistikasi.
* **Muddat tahlili:** Muddati buzib bajarilgan, muddati o'tgan va kutilayotgan ishlar hisob-kitobi.
* **Interaktiv vazifalar ro'yxati:** Har bir statistika katagi bosilganda ostida vazifalar ro'yxati ochiladi:
  * 15 tadan qat'iy sahifalash (`1..15`, `16..30`);
  * Aniq sana bo'yicha qidiruv (`DateField`);
  * Standart 1 haftaliklar ko'rinishi (`due="week"`);
  * Oy yarmi (1-davr: 1—15 kunlar `[1]` va 2-davr: 16—30 kunlar `[2]`) bo'yicha filtrlash;
  * Qidiruv, ijrochi, loyiha va holat bo'yicha dinamik filtrlar;
  * O'ng chetdan chiquvchi vazifa ko'rish paneli (`TaskDrawer`).

### 2. Loyihalar boshqaruvi (Projects — `/loyihalar`)
* Ish maydonlari bo'yicha guruhlangan loyihalar portfeli.
* Nomdan avtomatik unikal kalit (`key`) va rang palitrasini tanlash.
* Loyiha darajasidagi hujjatlar va fayllar boshqaruvi (versiyalash, birlamchi hujjat sanasi).
* Loyiha brifi (Onboarding, maqsadlar, talablar).
* Taqvim ko'rinishi (Calendar), vazifalar taxtasi (Kanban) va muddatlar bashorati (Forecast).

### 3. Vazifalar boshqaruvi (Tasks)
* Har bir vazifaga ustuvorlik (Muhimlik: Past, O'rta, Yuqori, Shoshilinch), holat (Nazoratda, Jarayonda, Tekshiruvda, Bajarildi, To'xtatilgan) va muddatlar biriktirish.
* Bir nechta ijrochilarni jalb qilish va har bir xodim uchun soatlarni rejalashtirish.
* Ichki topshiriqlar (Subtasks), izohlar (Comments) va fayllar (Attachments).
* Ish vaqti jurnali (WorkLogs) — sarflangan vaqt va bajarilgan ish tavsifi.
* Tekshiruv navbati (Review Queue) — mas'ul tekshiruvchilar tomonidan vazifa natijasini tasdiqlash yoki qayta ishlashga yuborish.

### 4. Qilingan ishlar va Umumiy tarix (Feed & WorkDone)
* **Umumiy tarix (`/tarix`):** Loyihalar kesimida butun tizim faoliyatini 15 tadan sahifalab ko'rish, har bir loyiha va harakatning sanasiga qarab 1-davr (`[1]`) yoki 2-davr (`[2]`) nishonlari bilan saralash.
* **Qilingan ishlar (`/qilingan-ishlar`):** Boshliq uchun barcha loyihalar bo'yicha tasdiqlangan, topshirilgan ishlar, izohlar va hisobotlarning jonli tasmasi.
* **Mening ishim (`/mening-ishim`):** Har bir xodim uchun shaxsiy interaktiv vazifalar taxtasi.

### 5. Buyurtmalar va Talabnomalar (Orders TZ — `/buyurtmalar`)
* Tashqi sohaviy boshqarmalar va buyurtmachilar uchun yangi tizimlar yoki o'zgartirishlar bo'yicha talabnoma (TZ) topshirish.
* Loyiha menejeri (PM) biriktirish, smeta/muddat takliflari va avtomatik qoralamalarni saqlash.
* Mijoz tomonidan tasdiqlanish yoki izoh bilan qaytarilish jarayoni.

### 6. Takliflar tizimi (Suggestions — `/takliflar`)
* Jamoa a'zolari tomonidan yangi tashabbuslar va takliflarni bildirish.
* Ochiq va to'liq anonim taklif berish imkoniyati (anonim takliflarda hatto boshliq va admin ham muallifni ko'ra olmaydi).
* Ovoz berish tizimi va faqat Boshliq tomonidan qaror qabul qilish (Qabul qilish / Rad etish / Izoh).

### 7. Xodimlar va Jamoa yuklamasi (People & Tasks)
* 11 ta mutaxassislik yo'nalishi (Backend, Frontend, Fullstack, Mobile, DevOps, QA, UI/UX, Data/ML, Biznes tahlil, Xavfsizlik, PM).
* Xodimlar profilini ko'rish, rezyume, tajriba va yuklama balansi.
* Vazifalarni mutaxassislikka qarab tavsiya qilish.

### 8. Real-time aloqa va Xabarlar (Chat & Notifications)
* Loyiha guruh chatlari va shaxsiy xabarlar almashinuvi (WebSocket).
* Tizim ichidagi audio qo'ng'iroq bildirishnomalari.
* Telegram boti orqali shoshilinch topshiriqlar va eslatmalarni jo'natish.

---

## 🔒 Rollar va Xavfsizlik modeli

Tizimda qat'iy **RBAC (Role-Based Access Control)** tatbiq etilgan:

| Rol | Ruxsat doirasi va vakolatlari |
|---|---|
| **Boshliq (`BOSS`)** | Barcha loyihalarni ko'rish, takliflar bo'yicha yakuniy qaror qabul qilish, «Qilingan ishlar» hisobotlarini to'liq kuzatish. |
| **Platforma Admini (`ADMIN`)** | Tizim ma'muriyati, foydalanuvchilar, rollar, ish maydonlarini boshqarish. |
| **Global Menejer (`MANAGER`)** | Barcha loyihalarda loyiha menejeri huquqiga ega: vazifa berish, o'chirish, tasdiqlash. |
| **Loyiha Menejeri / Admini** | O'z loyihasida to'liq boshqaruv: a'zolik, vazifalar taqsimoti, sozlamalar. *(Loyiha menejeri boshqalar tomonidan chiqarib yuborilmaydi).* |
| **Dasturchi / QA / Mutaxassis** | Biriktirilgan vazifalarni bajarish, muddat so'rash, hisobot topshirish, fayllar va izohlar qo'shish. |
| **Sohaviy Boshqarma** | Faqat buyurtmalar (TZ) topshirish, o'z talabnomalari holatini kuzatish va kelishish. |

---

## 🌐 Sayt tili va Interfeys matnlari (i18n)

* Tizim tili: **O'zbek tili** (`LANGUAGE_CODE = "uz"`, `TIME_ZONE = "Asia/Tashkent"`).
* Interfeys matnlari kodga qattiq yozilmaydi — barcha yozuvlar `apps.uitexts.UiText` jadvalida turadi va frontendda `tx("kalit")` orqali dinamik olinadi.
* Matnlarni qayta tiklash yoki yangilash:
  ```bash
  docker exec teamflow_backend python manage.py seed_ui_texts
  ```

---

## 🧪 Avtomatlashtirilgan testlar va Sifat nazorati

Loyihada **670 ga yaqin avtomatlashtirilgan testlar** mavjud:

```bash
# Backend testlarini ishga tushirish (--noinput shart)
docker exec teamflow_backend python manage.py test --noinput

# Frontend TypeScript tiplarini tekshirish
docker exec teamflow_frontend npm run typecheck

# Frontend ESLint sifat nazorati
docker exec teamflow_frontend npm run lint

# Frontend Vitest testlari (59 ta test)
docker exec teamflow_frontend npm test

# Frontend ishlab chiqarish (production) yig'ilmasi
docker exec teamflow_frontend npm run build
```

---

## 📦 Loyiha jildlari tuzilishi

```text
TeamFlow/
├── backend/                  # Django backend loyihasi
│   ├── apps/
│   │   ├── accounts/         # Foydalanuvchilar, profillar va rollar
│   │   ├── activity/         # Faoliyat tarixi va lentalar
│   │   ├── chat/             # Real-time WebSocket chat
│   │   ├── core/             # Db2 adapteri, vaqt zonalari, cheklovlar
│   │   ├── inquiries/        # Ichki so'rovlar
│   │   ├── notifications/    # Bildirishnomalar va ogohlantirishlar
│   │   ├── orders/           # Buyurtmalar va talabnomalar (TZ)
│   │   ├── panel/            # Bosh panel, Mening ishim, qidiruv
│   │   ├── projects/         # Loyihalar, ruxsatlar, fayllar
│   │   ├── suggestions/      # Takliflar va ovoz berish
│   │   ├── tasks/            # Vazifalar, subtasklar, ish jurnallari
│   │   ├── telegram/         # Telegram bot xizmatlari
│   │   ├── uitexts/          # Interfeys matnlari lug'ati (i18n)
│   │   └── workspaces/       # Ish maydonlari
│   ├── config/               # ASGI, WSGI va settings sozlamalari
│   └── manage.py
├── frontend/                 # React + TypeScript veb ilovasi
│   ├── src/
│   │   ├── api/              # API mijozlari va turlari (TypeScript interfaces)
│   │   ├── auth/             # Autentifikatsiya konteksti
│   │   ├── components/       # UI komponentlar, sanalar, diff, tortmalar
│   │   ├── i18n/             # Mahalliylashtirish yordamchilari
│   │   ├── nav/              # Marshrutlash va navigatsiya
│   │   ├── pages/            # Bosh panel, Loyihalar, Vazifalar, Tarix va b.
│   │   ├── realtime/         # WebSocket mijozlari va jonli yangilanish
│   │   └── styles/           # Yagona CSS dizayn tizimi
│   ├── package.json
│   └── vite.config.ts
├── docker/                   # Maxsus Dockerfile va tuning skriptlari
├── docker-compose.yml        # Barcha konteynerlar orkestratsiyasi
└── README.md
```

---

## 📄 Litsenziya

Ushbu loyiha korporativ foydalanish uchun ishlab chiqilgan. Barcha huquqlar himoyalangan.
