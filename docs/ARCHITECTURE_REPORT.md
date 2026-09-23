# TeamFlow — Arxitektura audit hisoboti

> Agent 1 (Project Auditor), 2026-09-23. Faqat o'qish rejimi: manba koddan tahlil
> qilindi, Docker ishlatilmadi (`makemigrations --check`, testlar, lint yurgizilmadi).
> Branch: `refactor/architecture-review`, HEAD `7ae86e2`.

---

## 0. Ish daraxti holati

Topshiriqda aytilgan commit qilinmagan o'zgarishlar audit davomida **`7ae86e2` commitiga
tushdi** (`wip: order files to project, dashboard and order badge rework`). Hozir
`git status --short` bo'sh — commit qilinmagan fayl yo'q. O'sha commitdagi 19 ta fayl:

| Qism | Fayllar |
| --- | --- |
| Backend | `orders/api.py` (+8), `orders/services.py` (+214), `orders/tests.py`, `tasks/models.py` (10 qator), `uitexts/defaults.json`, `tests/test_board_review.py` |
| Frontend | `ChangeRequests.tsx`, `Dashboard.tsx`, `DeveloperReport.tsx`, `JoinProject.tsx`, `ProjectDetail.tsx`, `ProjectForm.tsx`, `TaskDetail.tsx`, `orders/OrderBadges.tsx`, `project/Overview.tsx`, `styles/app.css` |
| O'chirilgan | `pages/project/Brief.tsx`, `History.tsx`, `Onboarding.tsx` |

`tasks/models.py` dagi o'zgarish faqat `Task.allowed_transitions()` mantig'i (IN_REVIEW
holatida tekshiruvchiga DONE ochiladi) — **sxema o'zgarmagan, migratsiya kerak emas**.

---

## 1. Umumiy ko'rinish

| Qatlam | Holat |
| --- | --- |
| Backend | 14 ta app, ~22 000 qator. API `api.py` da (konvensiya saqlangan), `views.py` yo'q. |
| Ma'lumotlar bazasi | 12 ta app'da model, jami ~35 model. Migratsiyalar model maydonlari bilan mos (statik tekshiruv). |
| Frontend | React 19 + Vite, ~39 000 qator. Barcha o'qish `POST /api/read/` shlyuzi orqali. |
| Auth | SimpleJWT (access 30 daq, refresh 14 kun, rotatsiya + blacklist). Access va refresh `localStorage` da. |
| Real-time | channels: `ws/notifications/`, `ws/chat/<scope>/<id>/`, token `?token=` da. |

**Eng jiddiy topilmalar:** (1) foydalanuvchi o'z `specialty` va `department_name` ini
o'zi o'zgartira oladi va shu bilan buyurtmalar ko'rinishi / PM huquqlarini oladi (P0);
(2) o'qish shlyuzi yo'ldagi `?query` ni jimgina tashlaydi — ikki joyda filtr ishlamaydi (P1);
(3) vazifa va buyurtma ro'yxatlarida qator boshiga 3–6 ta qo'shimcha so'rov (P1).

---

## 2. Backend

### 2.1 App'lar

| App | Modellar | API | Asosiy modullar |
| --- | --- | --- | --- |
| `core` | — (modelsiz) | `read/` | `db2/` adapter, `fields.JSONTextField`, `softdelete`, `queries` (`related_count`, `int_param`), `media` (imzoli URL), `uploads`, `throttles`, `periods`, `background.run_later`, `middleware.RateLimitBlockMiddleware` |
| `accounts` | `Department`, `User`, `SpecialtyItem`, `SpecialtyAnalytics` (proxy) | `auth/*`, `users/*` | `backends.py` (email login), `specialties.py`, `middleware.LastSeenMiddleware` |
| `workspaces` | `Workspace` (soft-delete), `WorkspaceMember` | `workspaces/` | — |
| `projects` | `Project`, `ProjectSpecialty`, `ProjectMember`, `JoinRequest`, `ProjectBrief`, `ProjectFile` (soft), `ProjectFileVersion`, `ProjectDeadlineNotice` | `projects/`, `my-requests/` | `permissions.py`, `services.py`, `calendar_view.py`, `forecast.py`, `deadlines.py` |
| `tasks` | `Label`, `Task` (soft), `TaskAssignment`, `Comment`, `Review`, `Attachment` (soft), `WorkLog`, `Submission` (soft), `SubmissionEdit` | `tasks/`, `labels/` | `services.py` |
| `activity` | `Activity` | `activity/` | `services.log` |
| `notifications` | `Notification` | `notifications/` | `services.py`, `consumers.py` |
| `chat` | `ChatMessage` (soft) | `chat/messages/` | `services.py`, `consumers.py`, `signals.py` |
| `suggestions` | `Suggestion`, `SuggestionVote`, `SuggestionFile` | `suggestions/` | `services.py` |
| `inquiries` | `Inquiry`, `InquiryVote`, `InquiryFile` | `inquiries/` | `permissions.CanAccessInquiries`, `services.py` |
| `orders` | `ChangeRequest`, `ChangeRequestVersion`, `OrderAttachment` | `orders/` | `workflow.py`, `visibility.py`, `services.py`, `export.py` (docx) |
| `uitexts` | `UiText`, `SystemSetting` | `ui-texts/`, `system/settings/` | `defaults.json`, `seed_ui_texts` |
| `telegram` | `TelegramLink` | `telegram/link/` | `client.py`, `commands.py`, bot komandasi |
| `panel` | — | `dashboard/`, `my-work/`, `meta/`, `team/*`, `public/*`, `users/<id>/work/` | `people.py`, `public.py`, `team.py`, `middleware.DeadlineReminderMiddleware` |

### 2.2 Global sozlamalar (`backend/config/settings.py`)

- `DEFAULT_PERMISSION_CLASSES = IsAuthenticated` (242–247), autentifikatsiya: JWT + Session.
- `DEFAULT_PAGINATION_CLASS = StandardPagination` (`page_size=30`, `max_page_size=200`).
- Filtrlar: `DjangoFilterBackend`, `SearchFilter`, `OrderingFilter` — hamma viewset'da standart.
- Throttle: `ScopedRateThrottle` — `chat 90/min`, `invite 40/hour`, `auth 20/min`, `search 120/min`.
- Middleware: `RateLimitBlockMiddleware` (DEBUG da o'chiq), `LastSeenMiddleware`, `DeadlineReminderMiddleware`.

---

## 3. API endpointlar jadvali

Belgilar: **Auth** — `IsAuth` = `IsAuthenticated` (standart), `Any` = `AllowAny`.
**Sahifa** — `Ha` = `StandardPagination` (`count/next/previous/results`), `—` = massiv/obyekt.
Barcha GET'lar frontenddan `POST /api/read/ {path, params}` orqali keladi (§5.3).

### 3.1 Auth va foydalanuvchilar

| Metod | Yo'l | View | Auth | Sahifa / filtr |
| --- | --- | --- | --- | --- |
| GET/POST/DELETE | `/api/auth/specialties/[<id>/]` | `accounts.api.specialties` | `Any` (POST/DELETE ichida admin tekshiruvi) | — |
| POST | `/api/auth/login/` | `LoginView` | `Any`, throttle `auth` | — |
| POST | `/api/auth/refresh/` | `RefreshView` | ochiq (body yoki `tf_refresh` cookie) | — |
| POST | `/api/auth/verify/` | `TokenVerifyView` | ochiq | — |
| POST | `/api/auth/register/` | `RegisterView` | `Any`, throttle `auth` | — |
| POST | `/api/auth/logout/` | `LogoutView` | `IsAuth` | — |
| GET/PATCH | `/api/auth/me/` | `MeView` (`MeSerializer`) | `IsAuth` | — |
| POST/DELETE | `/api/auth/me/avatar/` | `AvatarView` | `IsAuth` | — |
| POST | `/api/auth/change-password/` | `ChangePasswordView` | `IsAuth` | — |
| GET | `/api/users/` | `UserViewSet.list` (`UserListSerializer`) | `IsAuth` | Ha; `search`, `ordering`, `inactive`, `role`, `specialty`, `seniority`, `workload`, `exclude_management` |
| GET | `/api/users/<id>/` | `UserViewSet.retrieve` (`UserAdminSerializer`) | `IsAuth` | — |
| GET | `/api/users/workload-summary/`, `/api/users/specialty-stats/` | `UserViewSet` actions | `IsAuth` | — |
| PATCH | `/api/users/<id>/role/` | `UserViewSet.role` | `IsPlatformAdmin` | — |
| POST | `/api/users/create/`, `/api/users/<id>/set-password/` | `UserViewSet` | `IsPlatformAdmin` | — |
| GET | `/api/users/<id>/work/` | `panel.people.user_work` | `IsAuth` | — |

### 3.2 Ish maydonlari, loyihalar

| Metod | Yo'l | View | Auth | Sahifa / filtr |
| --- | --- | --- | --- | --- |
| CRUD | `/api/workspaces/[<slug>/]` | `WorkspaceViewSet` (lookup `slug`) | `IsAuth`+`CanCreateProject` | Ha; `search`, `scope=mine\|open` |
| POST | `/api/workspaces/<slug>/join/`, `…/members/` | actions | `IsAuth` (+ichki tekshiruv) | — |
| CRUD | `/api/projects/[<id>/]` | `ProjectViewSet` | `IsAuth`+`CanCreateProject` | Ha; `scope=mine\|visible\|managed\|discover\|all`, `search`, `workspace`, `status`, `project_type`, `specialty`, `matching`, `ordering`; DELETE `?confirm=1` |
| POST | `/api/projects/<id>/complete/`, `reopen/`, `restore/`, `leave/`, `join/` | actions | `IsAuth` + `ProjectAccess` | — |
| GET/PATCH/PUT | `/api/projects/<id>/brief/` | `brief` | `ProjectAccess` | — |
| GET | `/api/projects/<id>/members/` | `members` | view | — (massiv + `load`) |
| POST | `/api/projects/<id>/members/add/` | `add_member` | `AddMemberThrottle` | — |
| POST | `/api/projects/<id>/members/<mid>/` | `member_action` (`role\|remove\|appoint_admin\|revoke_admin`) | `can_manage` / `can_appoint_admin` | — |
| GET | `/api/projects/calendar/` | `calendar` → `calendar_view.py` | `IsAuth` | `month` |
| GET/POST | `/api/projects/<id>/files/` | `files` | `ProjectAccess` | — |
| PATCH/DELETE | `/api/projects/<id>/files/<fid>/` | `file_detail` | `ProjectAccess` | — |
| GET | `/api/projects/<id>/forecast/` | `forecast` → `forecast.py` | view | — |
| GET | `/api/projects/<id>/requests/` | `requests` | `can_manage` | — |
| POST | `/api/projects/<id>/requests/<rid>/decide/` | `decide_request` | `can_manage` | — |
| GET | `/api/my-requests/[<id>/]` | `MyJoinRequestViewSet` | `IsAuth` | Ha (frontend ishlatmaydi) |

### 3.3 Vazifalar

| Metod | Yo'l | View | Auth | Sahifa / filtr |
| --- | --- | --- | --- | --- |
| CRUD | `/api/tasks/[<id>/]` | `TaskViewSet` | `IsAuth` + `check_access` / `can_edit_task` | Ha; `project`, `status` (vergul), `task_type`, `priority`, `assignee` (`me`\|id), `open`, `overdue`, `deleted_only`, `search`, `ordering` |
| POST | `/api/tasks/<id>/restore/`, `/api/tasks/bulk/` | actions | view | — |
| GET | `/api/tasks/board/` | `board` | view | — (`columns`) |
| POST | `/api/tasks/<id>/status/`, `due/`, `reassign/`, `review/`, `comments/`, `worklogs/`, `team-remove/`, `subtasks/`, `link-subtask/`, `unlink-subtask/` | actions | `check_access` | — |
| GET/POST | `/api/tasks/<id>/team/`, `submissions/`, `attachments/` | actions | `check_access` | — |
| PATCH/DELETE | `/api/tasks/<id>/submissions/<sid>/` | `submission_detail` | muallif | — |
| DELETE | `/api/tasks/<id>/attachments/<aid>/` | `delete_attachment` | view | — |
| GET | `/api/tasks/review-queue/` | `review_queue` | view | Ha (qo'lda `paginate_queryset`, `tasks/api.py:894`) |
| GET | `/api/tasks/suggest-assignees/`, `/api/tasks/<id>/history/`, `/api/tasks/<id>/available-subtasks/` | actions | view | — |
| CRUD | `/api/labels/[<id>/]` | `LabelViewSet` | `check_access(manage)` | Ha (frontend ishlatmaydi) |

### 3.4 Faoliyat, bildirishnoma, chat

| Metod | Yo'l | View | Auth | Sahifa / filtr |
| --- | --- | --- | --- | --- |
| GET | `/api/activity/[<id>/]` | `ActivityViewSet` | `IsAuth` | Ha; `project`, `actor`, `category`, `days`, `search` |
| GET | `/api/activity/stats/`, `by-project/`, `developer-report/`, `onboarding/` | actions | `IsAuth` | — (`onboarding/` endi frontendda ishlatilmaydi) |
| GET | `/api/notifications/` | `NotificationViewSet` | o'ziniki | Ha; `unread`, `kind` |
| DELETE | `/api/notifications/<id>/` | destroy | o'ziniki | — |
| GET | `/api/notifications/unread-count/` | action | o'ziniki | — |
| POST | `/api/notifications/<id>/read/`, `read-all/`, `clear/` | actions | o'ziniki | — |
| GET/POST | `/api/chat/messages/` | `ChatMessageViewSet` | `IsAuth`, throttle `chat` | Ha; `resolve_room` parametrlari |
| DELETE | `/api/chat/messages/<id>/` | destroy | muallif | — |
| GET | `/api/chat/messages/conversations/`, `people/` | actions | throttle `search` (people) | — |

### 3.5 Takliflar, so'rovlar, buyurtmalar

| Metod | Yo'l | View | Auth | Sahifa / filtr |
| --- | --- | --- | --- | --- |
| CRUD | `/api/suggestions/[<id>/]` | `SuggestionViewSet` | `IsAuth` (+`get_queryset` filtri) | Ha; `status`, `mine`, `scope` |
| POST | `/api/suggestions/<id>/vote/`, `decide/` | actions | decide — faqat boshliq | — |
| GET/POST, DELETE | `/api/suggestions/<id>/files/[<fid>/]` | actions | muallif | — |
| GET | `/api/suggestions/counts/` | action | `IsAuth` | — |
| CRUD | `/api/inquiries/[<id>/]` | `InquiryViewSet` | `IsAuth`+`CanAccessInquiries` | Ha |
| POST | `/api/inquiries/<id>/vote/`, `clear_vote/`, `decide/` | actions | — | — |
| GET/POST, DELETE | `/api/inquiries/<id>/files/[<fid>/]`; GET `counts/` | actions | — | — |
| CRUD | `/api/orders/[<id>/]` | `ChangeRequestViewSet` | `IsAuth`+`CanAccessOrders` (POST create — faqat sohaviy/admin/boshliq) | Ha; filterset: `status, priority, department, module, project, assigned_pm, assigned_developer, order_type`; qo'lda: `mine, for_pm, deadline, period, metric`; `search`, `ordering` |
| POST | `/api/orders/<id>/send/`, `claim-order/`, `reassign-pm/`, `unclaim-order/`, `set-pm-decision/`, `submit-completion/`, `client-approve/`, `client-reject-completion/`, `upload-version/`, `approve-version/`, `reject-version/`, `create-task/`, `attachments/` | actions | `workflow.check_transition` + `is_order_pm` | — |
| DELETE | `/api/orders/<id>/attachments/<aid>/` | action | — | — |
| GET | `/api/orders/<id>/export-docx/` | action (fayl) | — | — (shlyuzdan o'tmaydi, `api.download` to'g'ridan-to'g'ri GET) |
| GET | `/api/orders/stats/` | action | — | — |

### 3.6 Panel, tizim, ochiq

| Metod | Yo'l | View | Auth | Sahifa |
| --- | --- | --- | --- | --- |
| GET | `/api/dashboard/` | `panel.api.dashboard` | `IsAuth` | — |
| GET | `/api/dashboard/tasks/` | `panel_tasks` | `IsAuth` | qo'lda |
| GET | `/api/counts/`, `/api/my-work/`, `/api/meta/` | `panel.api` | `IsAuth` | — |
| GET | `/api/team/candidates/`, `/api/team/workload/` | `panel.team` | `IsAuth` | — |
| POST | `/api/team/add/` | `panel.team.add_member` | `IsAuth`, `AddMemberThrottle` | — |
| GET | `/api/public/projects/[<id>/]`, `/api/public/stats/` | `panel.public` | `Any`, `PublicSearchThrottle` | — |
| GET | `/api/ui-texts/` | `uitexts.api.ui_texts` | `Any`, ETag | — |
| GET/POST | `/api/system/settings/` | `system_settings` | `Any` (POST ichida admin/boshliq) | — |
| GET/POST/DELETE | `/api/telegram/link/` | `telegram_link` | `IsAuth` | — |
| POST | `/api/read/` | `core.read.read` | `Any` (ichki view tekshiradi) | — |
| GET | `/api/health/` | `config.urls.health` | ochiq | — |
| WS | `ws/notifications/`, `ws/chat/<scope>/<id>/` | consumers | `JWTAuthMiddleware` (`?token=`) | — |

---

## 4. Ma'lumotlar bazasi

### 4.1 Asosiy bog'lanishlar

```
User ─┬─< WorkspaceMember >── Workspace ──< Project ──┬─< ProjectMember >── User
      │                                               ├─< JoinRequest, ProjectSpecialty, ProjectFile ─< ProjectFileVersion
      │                                               ├── ProjectBrief (1:1), ProjectDeadlineNotice
      │                                               ├─< Task ──┬─< TaskAssignment >── User
      │                                               │          ├─< Comment, Review, WorkLog, Attachment, Submission ─< SubmissionEdit
      │                                               │          ├── parent (self), labels (M2M Label), order (FK ChangeRequest)
      │                                               └─< ChangeRequest ──< ChangeRequestVersion, OrderAttachment
      ├── department (FK Department)                   (assigned_pm, assigned_developer, linked_task, created_by)
      └── Activity, Notification, ChatMessage, Suggestion(+Vote,File), Inquiry(+Vote,File), TelegramLink(1:1)
```

### 4.2 Migratsiya holati (oxirgisi)

| App | Oxirgi migratsiya | Soni |
| --- | --- | --- |
| accounts | `0009_alter_user_specialty` | 9 |
| activity | `0001_squashed` | 1 |
| chat | `0002_chatmessage_deleted_at_chatmessage_deleted_by` | 2 |
| inquiries | `0001_initial` | 1 |
| notifications | `0010_alter_notification_kind` | 8 |
| orders | `0017_alter_changerequest_order_type` | 17 |
| projects | `0015_alter_project_project_type` | 15 |
| suggestions | `0002_suggestionfile` | 2 |
| tasks | `0009_taskassignment_allocated_hours_and_more` | 9 |
| telegram | `0001_initial` | 1 |
| uitexts | `0003_alter_systemsetting_options_and_more` | 3 |
| workspaces | `0002_workspace_deleted_at_workspace_deleted_by` | 2 |

Statik tekshiruv: har bir `models.py` dagi har bir maydon nomi o'z app'ining
migratsiyalarida bor (yagona istisno `projects.all_objects` — bu manager, maydon emas).
`tasks/models.py` dagi so'nggi o'zgarish sxemaga tegmaydi. **Lekin** `choices`/`help_text`
o'zgarishlarini bu usul ko'rmaydi — Docker ko'tarilgach `makemigrations --check --dry-run`
bilan tasdiqlash kerak.

### 4.3 Indekslar

FK'larga Django avtomatik indeks qo'yadi. Mavjud kompozit indekslar yaxshi:
`Task(project,status)`, `Task(project,deleted_at,status)`, `Task(deleted_at,due_date)`,
`Notification(recipient,is_read,-created_at)`, `Activity(project|actor|task,-created_at)`,
`TaskAssignment(user,is_active)`, `ProjectMember(user,is_active)`.

Yetishmayotgan (tez-tez filtrlanadi, indeks yo'q):

| Model.maydon | Qayerda filtrlanadi | Tavsiya |
| --- | --- | --- |
| `Project.status` (`projects/models.py:74`) | `scope=discover` `.exclude(status="ARCHIVED")`, `status` filtri, panel | `db_index=True` yoki `(deleted_at, status)` |
| `Project.is_public`, `is_listed` (105–116) | `discover`, `panel/public.py` (tokensiz, throttled) | `(is_listed, deleted_at)` |
| `JoinRequest.status` (`projects/models.py:427`) | panel `join_qs`, `counts/`, `requests/` | `(project, status)` |
| `Task.submitted_at` | `review-queue` `order_by("submitted_at")` + `status=IN_REVIEW` | `(status, submitted_at)` |
| `ChangeRequest.pm_deadline`, `due_date` | `deadline=OVERDUE/TODAY/WEEK` (`orders/api.py:182–200`) | `(status, pm_deadline)` |
| `ChangeRequest.department` | `sohaviy_q` — `iexact`, indeks baribir ishlamaydi | `department` ni FK ga o'tkazish (P2) |
| `WorkLog(user, work_date)` | `developer-report`, panel | kompozit indeks |

---

## 5. Frontend

### 5.1 Tuzilish

| Papka | Mazmuni |
| --- | --- |
| `main.tsx` → `bootstrap.tsx` → `App.tsx` | lug'at (`/ui-texts/`) avval yuklanadi, keyin ilova dinamik import qilinadi (CLAUDE.md talabi saqlangan). |
| `api/` | `client.ts` (yagona HTTP mijoz, token, refresh, `listOf/totalOf/pagesOf`), `useFetch.ts` (abort + debounce), `orders.ts`, `projects.ts`, `tasks.ts`, `branding.ts`, `types.ts` (1302 qator). |
| `auth/AuthContext.tsx` | `user`, `meta`, `login/register/logout/refreshUser`; `AUTH_EXPIRED` hodisasini tinglaydi. |
| `realtime/` | `socket.ts` (qayta ulanish, `freshAccess()`), `RealtimeContext.tsx` (bildirishnomalar, `useLive`). |
| `nav/` | ID'siz marshrutlar: identifikator `history.state` + `sessionStorage` da (`/loyiha`, `/vazifa`). `Resolve.tsx` eski `/:id` havolalarni aylantiradi. |
| `components/` | `ui.tsx`, `dates.tsx`, `diff.tsx` + 30 ga yaqin komponent. |
| `pages/` | 40 sahifa, `project/` (Board, Files, Forecast, Members, Overview, TaskList), `orders/` (Badges, Stepper, Skeletons). |

**Holat boshqaruvi:** Redux/Zustand yo'q — `AuthContext`, `RealtimeContext` va sahifa
ichidagi `useState` + `useFetch`. Server holati keshlanmaydi (har ochilishda qayta so'raladi).

### 5.2 Marshrutlar (`App.tsx:134–213`)

Ochiq: `/`, `/qidiruv`, `/ochiq-loyiha`, `/kirish`, `/royxatdan-otish`. Admin: `/admin`
(`AdminGate`). Himoyalangan (`Protected` + `Layout`): `/panel`, `/mening-ishim` (NonPm),
`/qilingan-ishlar` (Boss), `/loyihalar`, `/vazifalar` (Manages), `/qoshilish`,
`/loyiha/*`, `/vazifa/*`, `/tekshiruv`, `/tarix`, `/taqvim`, `/jamoa`, `/xodimlar` (Boss),
`/ish-maydonlari`, `/ish-maydoni/*`, `/xabarlar`, `/bildirishnomalar`, `/takliflar`,
`/taklif`, `/buyurtmalar`, `/buyurtma/*`, `/profil`. `/sorovlar` → `/panel` ga yo'naltiriladi.

> `pages/Inquiries.tsx` (475 qator) + `components/inquiry.tsx`, `InquiryDrawer.tsx`
> **hech qaysi marshrutga ulanmagan** — backend `inquiries` app'i UI'siz qolgan (P2).

### 5.3 API qatlami va auth oqimi

- `api.get(path, params)` → **`POST /api/read/ {path, params}`** (`client.ts:247`). Server
  (`core/read.py:166`) ichki GET yasab, o'sha view'ni chaqiradi. `post/patch/put/delete` —
  to'g'ridan-to'g'ri.
- Token: `tf_access`, `tf_refresh` — `localStorage` (`client.ts:29–43`). 401 → bitta umumiy
  `tryRefresh()` → qayta urinish → bo'lmasa `AUTH_EXPIRED`.
- WebSocket: `freshAccess()` token tugashiga <30 s qolsa oldindan yangilaydi.
- To'g'ridan-to'g'ri `fetch()`: faqat `client.ts` (kutilgan), `i18n/index.ts:86,131` (lug'at,
  ataylab — `main.tsx` tartibi uchun), `FilePreviewModal.tsx:101,127,152,179` (imzoli media
  URL — API emas). **Komponentda API'ga `fetch` yozilgan joy yo'q.**

### 5.4 Sahifa → API bog'lanishi (asosiylari)

| Sahifa | Endpointlar |
| --- | --- |
| `Dashboard.tsx` | `/dashboard/`, `/dashboard/tasks/`, `/orders/stats/` |
| `Projects.tsx` | `/projects/`, `/my-work/` |
| `ProjectDetail.tsx` + `project/*` | `/projects/<id>/`, `/tasks/` (+`board/`), `/projects/<id>/files|members|requests|forecast/`, `/activity/` |
| `TaskDetail.tsx` | `/tasks/<id>/` + 12 ta action, `/projects/<id>/members/` |
| `TaskForm.tsx` | `/projects/?scope=visible` (**buzuq**, §7), `/tasks/suggest-assignees/`, `/team/*` |
| `ChangeRequests.tsx`, `OrderDetail.tsx`, `OrderForm.tsx` | `api/orders.ts` (hamma order action), `/users/`, `/projects/`, `/tasks/` |
| `People.tsx` | `/users/` (+ `workload-summary`, `specialty-stats`), `/projects/`, `/tasks/`, `/users/<id>/role/` |
| `Admin.tsx` | `/users/*`, `/projects/?scope=all`, `/tasks/?deleted_only=1`, `/orders/`, `/auth/specialties/`, `/system/settings/` |
| `Tasks.tsx` | `/team/workload/` |
| `MyWork.tsx` | `/my-work/`, `/tasks/<id>/status|due/` |
| `Feed.tsx`, `WorkDone.tsx` | `/activity/*`, `/projects/` |
| `Suggestions.tsx`, `SuggestionDetail.tsx` | `/suggestions/*` |
| `Messages.tsx`, `WorkspaceChat.tsx`, `Chat.tsx` | `/chat/messages/*`, `/users/<id>/`, `/workspaces/<slug>/` |

### 5.5 `Pager` va sahifalash

`Pager` bor: Admin, Dashboard, Discover, Inquiries, MyWork, People, Profile,
project/TaskList, Projects, ReviewQueue, Suggestions, Tasks, WorkDone, DeveloperList.
`ChangeRequests.tsx:1699` va `Feed.tsx:169` — o'zining qo'lda yozilgan sahifalagichi (inline
style, `Pager` emas).

**Chegaraga tiralgan yoki `page_size` siz ro'yxatlar** (CLAUDE.md: «jimgina qirqiladi»):

| Joy | So'rov | Oqibat |
| --- | --- | --- |
| `OrderForm.tsx:48` | `/projects/` `{scope:"visible"}` — `page_size` yo'q | buyurtma formasida faqat 30 ta loyiha |
| `TaskForm.tsx:74` | `/projects/?scope=visible` | 30 ta + scope yo'qoladi (§7-1) |
| `WorkDone.tsx:143` | `/projects/?page_size=200` | `page_size` yo'qoladi → 30 ta (§7-1) |
| `WorkspaceDetail.tsx:23`, `Workspaces.tsx:20–21` | `page_size` yo'q | 30 dan ortig'i ko'rinmaydi |
| `ChangeRequests.tsx:117`, `OrderDetail.tsx:203`, `Admin.tsx:155` | `/users/` `page_size:200` | 200 dan ortiq xodimda PM/dasturchi ro'yxati kesiladi |
| `People.tsx:105,108,129,1331` | `/projects/`, `/users/`, `/tasks/` `page_size:100` | 100 da kesiladi |
| `DistributeTasksModal.tsx:53`, `OrderDetail.tsx:171` | `/tasks/` `page_size:100` | loyihada 100 dan ortiq vazifa bo'lsa kesiladi |

### 5.6 Qattiq yozilgan matn (namuna — to'liq ro'yxat Static Data Auditor'da)

`DistributeTasksModal.tsx:297,415–421`, `components/inquiry.tsx:98,103,109,116,162,271`,
`InquiryDrawer.tsx:88`, `NotificationModal.tsx:156`, `Admin.tsx:201,224,237,257,275,364,631,705,873,880,981,1037`,
`ChangeRequests.tsx:343,347,351` (`alert(...)`), `People.tsx:131`. Bundan tashqari
`api/types.ts` da `SidebarCounts` ikki marta e'lon qilingan (409 va 921).

---

## 6. Autentifikatsiya va avtorizatsiya

| Mavzu | Holat |
| --- | --- |
| JWT | access 30 daq (`JWT_ACCESS_MINUTES`), refresh 14 kun, `ROTATE_REFRESH_TOKENS` + `BLACKLIST_AFTER_ROTATION`, `UPDATE_LAST_LOGIN`. |
| Refresh cookie | `LoginView`/`RefreshView` `tf_refresh` HttpOnly cookie ham qo'yadi (`accounts/api.py:115`), lekin frontend refresh'ni `localStorage` da saqlaydi va body'da yuboradi — HttpOnly foydasi yo'q, ikki manba bor. |
| Logout | `LogoutView` `IsAuthenticated` talab qiladi (`accounts/api.py:283`). Access tugagan bo'lsa (30 daqiqa bo'sh turgach — odatiy holat) 401 → refresh blacklist'ga tushmaydi, `tf_refresh` cookie ham o'chirilmaydi. |
| WS | `config/ws_auth.py` — `?token=`, `token_exp` bo'yicha consumer o'zini yopadi. |
| Ruxsat sinflari | `IsPlatformAdmin`, `CanCreateProject` (`projects/permissions.py:120,128`), `CanAccessOrders` (`orders/api.py:42`), `CanAccessInquiries`, `IsAuthenticated`. |
| Egalik tekshiruvi | Loyiha/vazifa: `ProjectAccess`, `check_access`, `visible_projects_q`, `task_scope_q`, `managed_projects_q` (`projects/permissions.py`); vazifa tahriri: `tasks/services.can_edit_task:427`; buyurtma: `orders/visibility.visible_orders` + `workflow.is_order_pm`; takliflar: `SuggestionViewSet.get_queryset`; bildirishnoma: `recipient=request.user`. |
| Rol aniqlanishi | Global `global_role` bilan bir qatorda **`specialty` ham huquq beradi**: `specialty == "PM"` → `is_pm_or_boss` (`tasks/services.py:401`), `can_be_order_pm` (`orders/workflow.py:99`), `orders/serializers.py:555,584`; `specialty == "SOHAVIY"` → `is_sohaviy_boshqarma` → buyurtmalarga kirish. `specialty` esa foydalanuvchining o'zi tahrirlay oladigan maydon (§9 P0-1). |

---

## 7. Kontrakt nomuvofiqliklari (frontend ↔ backend)

1. **Yo'ldagi `?query` shlyuzda yo'qoladi.** `core/read.py:106–107` `path.split("?")[0]` qiladi,
   parametrlar faqat `params` dan olinadi. Natijada:
   - `frontend/src/pages/TaskForm.tsx:74` — `api.get("/projects/?scope=visible")` → server
     `scope=mine` (standart, `projects/api.py:184`) ni qo'llaydi. A'zo bo'lmagan global
     menejer/boshliq/loyiha menejeri vazifa formasida loyihalarini ko'rmaydi; ro'yxat 30 ta bilan cheklanadi.
   - `frontend/src/pages/WorkDone.tsx:143` — `useFetch("/projects/?page_size=200")` → 30 ta loyiha.
   - `client.ts:249` izohida ham shu uslub ko'rsatilgan. Tuzatish: `params` ga o'tkazish yoki
     shlyuzda `?` qismini `params` ga birlashtirish.
2. **`is_manager` serializerlarda yo'q.** `MeSerializer`/`UserBriefSerializer` fieldlarida
   `is_manager` yo'q (`accounts/serializers.py:34,76`), frontend esa uni tekshiradi:
   `App.tsx:116`, `Layout.tsx:114,412`, `ChangeRequests.tsx:129,140,148,582`,
   `TeamPicker.tsx:122,192,296`. Hozir `global_role === "MANAGER"` yonida turgani uchun
   natija to'g'ri chiqadi, lekin `types.ts:18` da `is_manager?` — o'lik maydon.
3. **`User.department` yo'q.** `types.ts:23` `department?: string`; `OrderForm.tsx:57` unga
   tayanadi — server faqat `department_name` beradi. O'lik tarmoq.
4. **Frontend ishlatmaydigan endpointlar:** `/api/activity/onboarding/` (Onboarding sahifasi
   `7ae86e2` da o'chirildi; `types.ts:576 OnboardingData` qoldi), `/api/labels/`,
   `/api/my-requests/`, `/api/inquiries/*` (sahifa marshrutsiz), `/api/inquiries/<id>/clear_vote/`.
5. **Ro'yxat chegaralari** — §5.5 jadvali (OrderForm, Workspaces va h.k.).
6. **Tekshirilgan va MOS:** `ChangeRequestItem` ↔ `ChangeRequestSerializer` (77/77 maydon),
   `Task`, `Project`, `Workspace`, `Activity`, `ProjectMember` (+`load`), `JoinRequest`,
   `Attachment`, `TaskAssignment`, `Suggestion`, `Inquiry`, `ChatMessage`, `ProjectFile`,
   `SidebarCounts`. Frontend chaqiradigan barcha 180+ yo'l backend marshrutlarida mavjud.

---

## 8. Qatlam buzilishlari

Diagramma: `panel·telegram` → `orders·inquiries·suggestions·chat·uitexts` →
`projects⇄tasks·activity·notifications·accounts·workspaces` → `core`.

| # | Import | Fayl:qator | Turi | Izoh |
| --- | --- | --- | --- | --- |
| L1 | `projects` → `orders.services` | `projects/api.py:18`, `projects/serializers.py:5` (modul darajasida) | YUQORIGA | `link_order_to_project`, `unlink_project_orders`, `order_earliest_start`. CLAUDE.md faqat `orders.models` ni taqiqlaydi, lekin baribir pastki qatlam ustkisini biladi. To'g'ri yo'l: bog'lashni `orders` tomonidan chaqirish yoki signal/hook. |
| L2 | `notifications` → `telegram.services` | `notifications/services.py:164` (funksiya ichida) | YUQORIGA | Telegram eng ustki qavat. Hook/registry orqali teskari qilinishi kerak (telegram o'zini `notify` ga ro'yxatdan o'tkazadi). |
| L3 | `accounts` → `projects.permissions`, `tasks.models`, `activity.services` | `accounts/api.py:17–20` (modul), `:358–359`; `accounts/serializers.py:136–137` | yon | `IsPlatformAdmin` `projects/permissions.py:120` da turibdi — u `accounts` yoki `core` ga tegishli. `workload-summary`/`specialty-stats` tasks ustidan o'qiydi → panelga. |
| L4 | `activity` → `projects`, `tasks` | `activity/api.py:10–17` | yon | `developer-report/`, `onboarding/`, `by-project/` — ko'p domenli o'qish; CLAUDE.md qoidasiga ko'ra panelga. |
| L5 | `notifications` → `projects`, `tasks` | `notifications/services.py:211–212` | yon | `check_unopened_task_notifications` — vazifa domeni mantiqi notifications ichida; `tasks/services` ga ko'chishi kerak. |
| L6 | `workspaces` ⇄ `projects` | `workspaces/models.py:95`, `serializers.py:74`, `api.py:9,12`; `projects/api.py:23`, `permissions.py:197,224` | halqa | Funksiya ichidagi importlar bilan yashirilgan halqa. Qabul qilingan faqat `projects⇄tasks`. |
| L7 | `orders/api.py:228` → `core.periods._period_start` | | xususiy API | `_` bilan boshlangan funksiya tashqaridan chaqirilmoqda. |

Tekshirildi — buzilish YO'Q: `core` hech bir domen app'ni import qilmaydi; `apps.panel` ni
hech kim import qilmaydi (faqat `settings.MIDDLEWARE` va `config/urls.py` matn orqali);
`projects` ichida `apps.orders.models` importi yo'q.

---

## 9. N+1 xavflari

| # | Joy | Sabab | Taxminiy narx |
| --- | --- | --- | --- |
| N1 | `TaskSerializer.get_can_edit` → `tasks/services.can_edit_task:427` | har qatorda `ProjectAccess(...)`, `task.assignments.filter(...).exists()` (prefetch'ni chetlab o'tadi, `:447`), `is_pm_or_boss` → `ProjectMember.objects.filter(...).exists()` (`:413`) | +2…4 so'rov / vazifa: `/tasks/`, `/tasks/board/`, `review-queue`, `/dashboard/tasks/`, `users/<id>/work/` |
| N2 | `TaskSerializer.get_is_pm_or_boss_created` (`tasks/serializers.py:270`) | yaratuvchi global PM bo'lmasa `ProjectMember` so'rovi | +1 / vazifa |
| N3 | `TaskSerializer.parent_code/parent_title` (`tasks/serializers.py:146–147`) | `for_display()` da `parent`, `parent__project` yo'q (`tasks/models.py:107`) | +2 / ostki vazifa |
| N4 | `UserBriefSerializer.department_name` (`accounts/serializers.py:26`, `models.py:204`) | `department` hech qayerda `select_related` qilinmagan (faqat admin'da) | +1 / bo'linmasi bor har foydalanuvchi — `UserBrief` hamma joyda ichma-ich |
| N5 | `specialty_icon`/`specialty_color` → `profile_for()` (`accounts/specialties.py:94–96`) | katalogdagi (admin qo'shgan) mutaxassislik uchun `SpecialtyItem` so'rovi, ikki marta | +2 / shunday foydalanuvchi, keshsiz |
| N6 | `ChangeRequestSerializer` (`orders/serializers.py:439–451, 540`) | `get_tasks` qator boshiga 1–4 so'rov; `project_detail.progress` → 2 ta `COUNT` (annotatsiyasiz); `linked_task.code` → `linked_task__project` select qilinmagan | ~5–7 / buyurtma, `/orders/` sahifasida 15 qator → ~90 so'rov |
| N7 | `copy_order_files_to_project` (`orders/services.py`, `7ae86e2`) | `approve-version` va `attachments/` so'rovi ichida 50 MB gacha fayllarni sinxron nusxalash | ishlash vaqti (N+1 emas, lekin so'rov ichida og'ir I/O) |

Yaxshi holatda: `ProjectViewSet` (prefetch + `project_counters`), `WorkspaceViewSet`
(annotatsiya), `ActivityViewSet` (`timeline()` select_related), `Notification`, `Chat`,
`Suggestion`/`Inquiry` (`related_count`).

---

## 10. Ustuvor muammolar ro'yxati

### P0 — xavfsizlik / ma'lumot chegarasi

| # | Muammo | Joy | Tavsiya |
| --- | --- | --- | --- |
| P0-1 | **O'z bo'linmasini o'zgartirib boshqa bo'linma buyurtmalarini ko'rish.** `PATCH /api/auth/me/ {department_name: "<boshqa bo'linma>"}` — `UserSerializer.update` `Department.get_or_create` qiladi (`accounts/serializers.py:71,90–103`); `sohaviy_q` esa `user.department.name` bo'yicha qoralama bo'lmagan hamma buyurtmani ochadi (`orders/visibility.py:38–45`). Profil formasi buni UI'dan ham beradi (`Profile.tsx:109,413`). | `accounts/serializers.py:71`, `orders/visibility.py:42` | `department_name` ni o'z-o'zini tahrirlashda read-only qilish (faqat admin beradi). |
| P0-2 | **`specialty` ni o'zi o'zgartirib huquq olish.** `specialty` `UserSerializer` da yoziladigan (`read_only_fields` da yo'q, `:89`; `validate_specialty` yo'q). `specialty="SOHAVIY"` → `is_sohaviy_boshqarma` → buyurtmalar bo'limi, yaratish (`orders/api.py:57`) va P0-1 bilan birga bo'linma buyurtmalari; `specialty="PM"` → `is_pm_or_boss` (`tasks/services.py:401`) → PM bergan vazifalarni tahrirlash, `can_be_order_pm` (`orders/workflow.py:99`). | `accounts/serializers.py:79,89` | `specialty` ni `MeSerializer` da read-only qilish yoki huquq beruvchi qiymatlarni rad etish; huquqni `specialty` emas, `global_role` dan olish. |

### P1 — to'g'rilik, ishlash, xavfsizlik chuqurligi

| # | Muammo | Joy |
| --- | --- | --- |
| P1-1 | O'qish shlyuzi yo'ldagi `?` qismini tashlaydi → `TaskForm` loyiha ro'yxati noto'g'ri (scope `mine`), `WorkDone` 30 ta. | `core/read.py:106`, `TaskForm.tsx:74`, `WorkDone.tsx:143` |
| P1-2 | Vazifa ro'yxatlarida N+1 (N1–N3) — eng ko'p ishlatiladigan endpointlar. | `tasks/services.py:427–453`, `tasks/serializers.py:146,263–272`, `tasks/models.py:107` |
| P1-3 | Buyurtma ro'yxatida N+1 (N6). | `orders/serializers.py:439–451,540`, `orders/api.py:106` |
| P1-4 | `UserBrief` N+1: `department` va katalog mutaxassisligi (N4, N5). | `accounts/serializers.py:26`, `accounts/specialties.py:94` |
| P1-5 | SVG logotip `branding/` da tokensiz va `inline` beriladi (`INLINE_SAFE` da `image/svg+xml`), izoh esa buning aksini aytadi — admin/boshliq yuklagan SVG ichidagi JS ilova originida ishlaydi va `localStorage` dagi tokenlarni o'qiydi. | `core/media.py:42,67–68`, `uitexts/api.py:96` |
| P1-6 | Logout access tugagach ishlamaydi: refresh blacklist'ga tushmaydi, HttpOnly `tf_refresh` cookie 14 kun qoladi va `RefreshView` uni qabul qiladi. | `accounts/api.py:283`, `:162–163` |
| P1-7 | `OrderForm` loyiha tanlovi 30 ta bilan cheklangan (`page_size` yo'q). | `OrderForm.tsx:48` |
| P1-8 | Qatlam: `notifications` → `telegram` (L2), `projects` → `orders` (L1). | §8 |

### P2 — texnik qarz

| # | Muammo | Joy |
| --- | --- | --- |
| P2-1 | `?inactive=1` admin bo'lmaganda hech qanday filtr qo'llanmaydi → faol emas hisoblar ham ro'yxatga chiqadi. | `accounts/api.py:381–383` |
| P2-2 | 100/200 ga tiralgan ro'yxatlar (§5.5). | `People.tsx`, `ChangeRequests.tsx:117`, `OrderDetail.tsx:171,203`, `Admin.tsx:155`, `DistributeTasksModal.tsx:53`, `Workspaces.tsx`, `WorkspaceDetail.tsx` |
| P2-3 | `inquiries` UI'si marshrutsiz; `activity/onboarding/`, `labels/`, `my-requests/` ishlatilmaydi; `OnboardingData`, `is_manager`, `department` o'lik tiplar; `SidebarCounts` ikki marta. | `App.tsx:197`, `types.ts:18,23,409,576,921` |
| P2-4 | Yon bog'liqliklar L3–L7 (ko'p domenli o'qishlar `accounts`/`activity` da, `IsPlatformAdmin` `projects` da). | §8 |
| P2-5 | Yetishmayotgan indekslar (§4.3). | `projects/models.py:74,105–116,427`, `orders/models.py` |
| P2-6 | Refresh token ikki joyda (localStorage + HttpOnly cookie) — bittasini tanlash. | `client.ts:29`, `accounts/api.py:115` |
| P2-7 | `DeadlineReminderMiddleware` izohi «rejalashtiruvchi yo'q» deydi, `docker-compose.yml` da esa `scheduler` servisi bor — ikki mexanizm parallel (dedupe bor, lekin ortiqcha). | `panel/middleware.py`, `docker-compose.yml:146` |
| P2-8 | `copy_order_files_to_project` so'rov ichida sinxron, nom bo'yicha dedupe — yangi versiya shu nomda bo'lsa loyihaga tushmasligi mumkin; tekshirish kerak. | `orders/services.py` (`_attach_single_file_to_project`), `orders/api.py:525,1199` |
| P2-9 | Qattiq yozilgan UI matnlari va `alert()` (§5.6); `ChangeRequests.tsx` 3464, `OrderDetail.tsx` 3393 qator — bo'lish kerak. | §5.6 |
| P2-10 | README Django admin manzili sifatida `/django-admin/` ko'rsatadi, asosiy — `/admin/`; README diagrammasi (`panel → … → core`) CLAUDE.md bilan mos emas. | `README.md` |

---

## Ilova: tekshirilmagan narsalar

- `makemigrations --check`, `manage.py test`, `npm run typecheck/lint/test` — Docker
  mavjud emasligi sababli yurgizilmadi.
- `panel/api.py` (950 qator) va `orders/api.py` (1475 qator) ichidagi har bir action
  tanlab o'qildi, to'liq emas.
