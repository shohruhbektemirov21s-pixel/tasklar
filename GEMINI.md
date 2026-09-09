# TeamFlow — Antigravity Developer Guide (GEMINI.md)

Vazifa boshqaruv tizimi. Loyiha papkasi: `D:\Task`.
Ushbu qoidalar Antigravity CLI (`agy`) va dasturchi agenti uchun majburiy hisoblanadi.

---

## 1. Muloqot va til

- Foydalanuvchi bilan **doim o'zbek tilida** muloqot qil.
- **UI matnlari to'liq o'zbekcha bo'lishi shart.** Kod identifikatorlari, funksiya va o'zgaruvchilar nomlari, commit xabarlari va testlar inglizcha yoziladi.
- **UI matnini kodga qattiq yozma** — barcha interfeys matnlari `tx("kalit")` orqali `backend/apps/uitexts/defaults.json` dan olinadi.
- `LANGUAGE_CODE = "uz"`, `TIME_ZONE = "Asia/Tashkent"`.

---

## 2. Docker va muhit — hamma narsa konteynerda ishlaydi

| Servis | Konteyner | Port (host → ichki) |
| --- | --- | --- |
| db2 | `teamflow_db2` | 50000 → 50000 |
| redis | `teamflow_redis` | 6379 |
| backend | `teamflow_backend` | **8010** → 8000 |
| frontend | `teamflow_frontend` | **5183** → 5173 |

Hostda (Windowsda) `python` yoki `npm` ni to'g'ridan-to'g'ri ishlatma — konteyner ichida tez va to'g'ri ishlaydi:
- **Backend buyruqlari:** `docker exec teamflow_backend python manage.py <buyruq>`
- **Frontend buyruqlari:** `docker exec teamflow_frontend npm run <skript>`

### Tezkor buyruqlar:
```bash
# Backend testlari (--noinput SHART, aks holda ibm_db_django interaktiv savol berib to'xtab qoladi)
docker exec teamflow_backend python manage.py test --noinput

# Migratsiyalar
docker exec teamflow_backend python manage.py makemigrations
docker exec teamflow_backend python manage.py migrate

# Bazani ORM orqali tekshirish
docker exec teamflow_backend python manage.py shell -c "from apps.tasks.models import Task; print(Task.objects.count())"

# Frontend tekshiruvlari
docker exec teamflow_frontend npm run build          # tsc -b && vite build
docker exec teamflow_frontend npm test               # vitest
```

---

## 3. Backend arxitekturasi va qoidalari

`backend/apps/` ichida: `accounts`, `activity`, `chat`, `core`, `notifications`, `panel`, `projects`, `suggestions`, `tasks`, `telegram`, `uitexts`, `workspaces`, `orders`, `inquiries`.

### Qatlam tartibi:
```text
panel  →  projects · tasks · activity · accounts · workspaces · orders  →  core
```
- **`apps/core` da domen importi bo'lmasin** — u eng quyi qatlam: Db2 adapteri, `JSONTextField`, yumshoq o'chirish, tezlik cheklovlari (`throttles.py`), `periods.py`.
- **`apps/panel` ga hech kim bog'lanmasin** — u eng ustki qatlam: bosh panel, «Mening ishim», umumiy ko'rinishlar.
- **Db2 adapteri (`backend/apps/core/db2/`) ga tegilmaydi** — u `ibm_db_django` ustidagi vaqt mintaqasi (UTC) to'g'rilash qatlami.
- **API view'lar `api.py` da yoziladi**, `views.py` da emas. Biznes-mantiq `services.py` ga chiqariladi.

---

## 4. Frontend arxitekturasi

`frontend/src/` ichida: `api/`, `auth/`, `components/`, `i18n/`, `nav/`, `pages/`, `realtime/`, `styles/`.

- **Marshrutlash:** `react-router-dom` v7.
- **Umumiy komponentlar:** `components/ui.tsx` (avatar, card, badge, pager, loading), `components/dates.tsx` (sanalar, formatlar), `components/diff.tsx`.
- **Sahifalash (Pagination):** Server chegarasi 200 (`config/pagination.py`). Jami sonni `totalOf(data)` yoki `data.count` dan ol, ekrandagi massiv uzunligidan emas.
- **Dinamik importlar:** `App.tsx` sahifalarni dinamik (`lazy`) yuklaydi. Boshqa sahifalardan lazy komponentlarni to'g'ridan-to'g'ri statik import qilma (alohida chunklar buzilmasligi uchun).

---

## 5. Qat'iy talablar va taqiqlar

1. **Soxta / Mock ma'lumot qo'shma:** Hamma ma'lumot backend va Db2 bazasidan olinishi shart.
2. **UI matnlari kodga qattiq yozilmasin:** Doim `tx("kalit")` ishlat, yangi kalitlarni `defaults.json` ga kirit.
3. **Avtomatik test va sifat nazorati:** O'zgarish kiritilgach, backend va frontend build xatosiz o'tishi shart.
4. **N+1 so'rovlardan qoch:** ORM so'rovlarida `select_related` va `prefetch_related` dan foydalan.
5. **Xavfsizlik va ruxsatlar:** Barcha huquqlar serverda (`has_permission`, `get_queryset`) tekshiriladi.
