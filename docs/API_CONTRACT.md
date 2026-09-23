# TeamFlow — API Kontrakti (API_CONTRACT.md)

Ushbu hujjat TeamFlow platformasining barcha backend API endpointlarini, ularning autentifikatsiya va ruxsat talablarini, so'rov va javob modellarini hamda arxitektura o'zgarishlarini aks ettiradi.

> **Belgilar:**
> * `IsAuth` — Faqat tizimga kirgan foydalanuvchilar (`IsAuthenticated`)
> * `AllowAny` — Barcha (anonim foydalanuvchilar ham)
> * `IsAdmin` — Faqat tizim administratorlari (`IsPlatformAdmin`)
> * `IsBoss` — Faqat boshliq (`is_boss`)
> * `(o'zgardi)` — Ushbu refaktoring davomida xavfsizlik, parametrlar yoki qaytariladigan ma'lumotlar tuzatilgan endpointlar.

---

## 1. Autentifikatsiya va Foydalanuvchilar (`apps/accounts`)

| Metod | Yo'l | Ruxsat | Asosiy parametrlar / Tana | Javob va Tavsif |
| --- | --- | --- | --- | --- |
| `POST` | `/api/auth/login/` | `AllowAny` | `email`, `password` | `access`, `refresh` tokenlar va foydalanuvchi ma'lumotlari (`MeSerializer`). |
| `POST` | `/api/auth/refresh/` | `AllowAny` | `refresh` (body yoki `tf_refresh` cookie) | Yangi `access` token (va yangi `refresh` cookie). |
| `POST` | `/api/auth/register/` | `AllowAny` | `full_name`, `email`, `password`, `specialty`, `seniority`, `years_experience` | Yangi hisob yaratiladi (admin tasdig'i talab qilinadi). |
| `POST` | `/api/auth/logout/` **(o'zgardi)** | `AllowAny` | `refresh` (ixtiyoriy, body yoki `tf_refresh` cookie), `all` ("1" barcha sessiyalar) | Access token muddati o'tgan bo'lsa ham `refresh` token qora ro'yxatga (blacklist) kiritiladi va cookie o'chiriladi. |
| `GET` | `/api/auth/me/` | `IsAuth` | — | Joriy foydalanuvchi profili (`MeSerializer`). |
| `PATCH` | `/api/auth/me/` **(o'zgardi)** | `IsAuth` | `full_name`, `job_title`, `bio`, `telegram`, `skills` | Foydalanuvchi o'z profilini tahrirlaydi. **Xavfsizlik:** `department_name` va imtiyozli `specialty` (`SOHAVIY`, `PM`) oddiy foydalanuvchi tomonidan o'zgartirilishi qat'iyan taqiqlangan (400 xato). Faqat administrator o'zgartirishi mumkin. |
| `POST` | `/api/auth/me/avatar/` | `IsAuth` | `avatar` (multipart rasm fayli) | Foydalanuvchi profil rasmini yuklaydi. |
| `DELETE` | `/api/auth/me/avatar/` | `IsAuth` | — | Profil rasmini o'chiradi. |
| `POST` | `/api/auth/change-password/` | `IsAuth` | `old_password`, `new_password` | Parolni almashtirish. |
| `GET` | `/api/users/` | `IsAuth` | `search`, `role`, `specialty`, `seniority`, `inactive`, `page` | Foydalanuvchilar ro'yxati (sahifalash: 30-200). |
| `GET` | `/api/users/<id>/` | `IsAuth` | — | Foydalanuvchi to'liq kartochkasi. |
| `PATCH` | `/api/users/<id>/role/` **(o'zgardi)** | `IsAdmin` | `global_role`, `is_active`, `specialty`, `seniority` | Admin tomonidan foydalanuvchi huquqlarini o'zgartirish. Baza mutaxassisliklari (`SpecialtyItem`) ham to'liq qo'llab-quvvatlanadi. |
| `POST` | `/api/users/create/` | `IsAdmin` | Yangi foydalanuvchi ma'lumotlari | Admin paneldan yangi hisob ochish. |
| `GET` | `/api/users/specialty-stats/` **(o'zgardi)** | `IsAuth` | — | Mutaxassisliklar bo'yicha xodimlar taqsimoti. Bazadagi yangi qo'shilgan mutaxassisliklar nomi to'g'ri ko'rsatiladi. |

---

## 2. O'qish shlyuzi (`apps/core/read.py`)

| Metod | Yo'l | Ruxsat | Asosiy parametrlar / Tana | Javob va Tavsif |
| --- | --- | --- | --- | --- |
| `POST` | `/api/read/` **(o'zgardi)** | `AllowAny` (ichki view tekshiradi) | `path` (masalan, `"/projects/?scope=visible"` yoki `"/tasks/12/"`), `params` (GET parametrlar lug'ati) | URL query-string'ni yo'qotmaydi! Yo'ldagi barcha `?key=val` parametrlar ajratib olinadi va `params` bilan birlashtiriladi (`params` ustunlik qiladi). Ichki GET view natijasini qaytaradi. |

---

## 3. Media fayllar xavfsizligi (`apps/core/media.py`)

| Metod | Yo'l | Ruxsat | Asosiy parametrlar | Javob va Tavsif |
| --- | --- | --- | --- | --- |
| `GET` | `/media/<path>` **(o'zgardi)** | Imzolangan token `?t=...` (yoki `branding/*` ochiq) | `t` imzosi | Barcha javoblarga `X-Content-Type-Options: nosniff` qo'shiladi. SVG fayllar uchun `Content-Security-Policy: sandbox` majburiy bo'lib, XSS (skript ishga tushirish) xavfi bartaraf etilgan. Rasm bo'lmagan fayllar `attachment` sifatida yuklanadi. |

---

## 4. Meta va Umumiy Ma'lumotlar (`apps/panel/api.py`)

| Metod | Yo'l | Ruxsat | Asosiy parametrlar | Javob va Tavsif |
| --- | --- | --- | --- | --- |
| `GET` | `/api/meta/` **(o'zgardi)** | `IsAuth` | — | Frontend uchun barcha enum va kataloglar: `task_status`, `task_priority`, `board_columns`, `departments`, `specialties` (bazadagi to'liq ro'yxat), `order_status` (barcha 10 ta holat), `order_filter_status` (to'liq filtr holatlari). |

---

## 5. Loyihalar va Ish Maydonlari (`apps/projects`, `apps/workspaces`)

| Metod | Yo'l | Ruxsat | Asosiy parametrlar | Javob va Tavsif |
| --- | --- | --- | --- | --- |
| `GET` | `/api/workspaces/` | `IsAuth` | `scope=mine\|open`, `search` | Ish maydonlari ro'yxati. |
| `POST` | `/api/workspaces/` | `CanCreateProject` | `name`, `description`, `is_public` | Yangi ish maydoni yaratish. |
| `GET` | `/api/projects/` | `IsAuth` | `scope=mine\|visible\|managed\|discover`, `workspace`, `status`, `search` | Loyihalar ro'yxati. |
| `POST` | `/api/projects/` **(o'zgardi)** | `CanCreateProject` | `name`, `key`, `workspace`, `order_id` (ixtiyoriy) | Loyiha yaratish. Qatlam buzilishi tuzatilgan: `orders` xizmati faqat ichki kontekstda chaqiriladi. |
| `GET` | `/api/projects/<id>/` | `ProjectAccess` | — | Loyiha batafsil ma'lumotlari. |
| `PATCH` | `/api/projects/<id>/` **(o'zgardi)** | `ProjectAccess(can_manage)` | Loyiha maydonlari, `order_id` | Loyihani tahrirlash va buyurtmaga bog'lash/uzish. |
| `GET` | `/api/projects/<id>/members/` | `ProjectAccess` | — | Loyiha a'zolari ro'yxati. |
| `POST` | `/api/projects/<id>/members/add/` | `ProjectAccess(can_manage)` | `user_id`, `role` | A'zo qo'shish (cheklangan tezlik). |

---

## 6. Vazifalar (`apps/tasks`)

| Metod | Yo'l | Ruxsat | Asosiy parametrlar | Javob va Tavsif |
| --- | --- | --- | --- | --- |
| `GET` | `/api/tasks/` **(o'zgardi)** | `IsAuth` | `project`, `status`, `priority`, `task_type`, `assignee`, `open`, `overdue` | Vazifalar ro'yxati. **Optimizatsiya:** `parent` select_related orqali olinadi, N+1 so'rovlar bartaraf etilgan. |
| `POST` | `/api/tasks/` | `ProjectAccess(task)` | `project`, `title`, `description`, `priority`, `parent` | Yangi vazifa ochish. |
| `GET` | `/api/tasks/<id>/` | `ProjectAccess` | — | Vazifa tafsilotlari (izohlar, fayllar, tekshiruvlar). |
| `PATCH` | `/api/tasks/<id>/` | `can_edit_task` | Vazifa maydonlari | Vazifani tahrirlash. PM va Boshliq bergan vazifalarni boshqalar o'zgartira olmaydi. |
| `POST` | `/api/tasks/<id>/status/` | `can_edit_task` | `status` | Holatni o'zgartirish (`allowed_transitions` bo'yicha). |
| `GET` | `/api/tasks/board/` | `ProjectAccess` | `project` | Kanban doska ko'rinishi. |

---

## 7. Buyurtmalar (`apps/orders`)

| Metod | Yo'l | Ruxsat | Asosiy parametrlar | Javob va Tavsif |
| --- | --- | --- | --- | --- |
| `GET` | `/api/orders/` **(o'zgardi)** | `CanAccessOrders` | `status`, `department`, `priority`, `search`, `page` | Buyurtmalar ro'yxati. **Optimizatsiya:** `created_by__department` keshlanadi, loyiha progressi takror hisoblanmaydi. |
| `POST` | `/api/orders/` | Sohaviy / Admin / Boshliq | `title`, `requested_change`, `tz_file`, `order_type` | Yangi buyurtma yaratish. |
| `GET` | `/api/orders/<id>/` | `CanAccessOrders` | — | Buyurtma to'liq ma'lumotlari, versiyalar tarixi va fayllar. |
| `PATCH` | `/api/orders/<id>/` | Ruxsatga ko'ra | Buyurtma maydonlari | Qoralama holatida tahrirlash yoki PM tayinlash. |
| `POST` | `/api/orders/<id>/accept/` | Admin / PM | — | Buyurtmani qabul qilish. |
| `POST` | `/api/orders/<id>/reject/` | Admin / PM | `reason` | Buyurtmani rad etish. |

---

## 8. Xulosa va Arxitektura Qoidalariga Muvofiqlik

1. **Qatlam tartibi tiklandi:** `projects` moduli endi `orders` moduliga yuqori darajada bog'lanmaydi.
2. **Xavfsizlik teshiklari yopildi:** O'zini o'zi boshqarma yoki PM qilib tayinlash imkoniyati to'liq bloklandi; SVG orqali XSS xavfi CSP sandbox bilan neytrallashtirildi; Logoutda refresh tokenlar to'g'ri bekor qilinadi.
3. **So'rovlar shlyuzi:** `/api/read/` endi barcha query parametrlarni to'liq uzatadi.
