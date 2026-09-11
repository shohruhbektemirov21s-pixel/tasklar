from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.core.queries import int_param, object_or_404
from apps.activity.models import Activity
from apps.activity.services import log, log_field_changes
from apps.projects.permissions import (ProjectAccess, check_access, managed_projects_q,
                                   sees_all_projects, task_scope_q, visible_projects_q)
from apps.core.uploads import check_uploads
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify, notify_many, send_to_users
from apps.projects.models import Project, ProjectRole

from .models import (BOARD_COLUMNS, Attachment, Label, Review, ReviewVerdict, Submission,
                     SubmissionEdit, Task, TaskAssignment, TaskStatus, WorkLog)
from .serializers import (AttachmentSerializer, BoardTaskSerializer, BulkTaskSerializer,
                          CommentSerializer, LabelSerializer, ReviewSerializer,
                          StatusChangeSerializer, SubmissionSerializer,
                          TaskDetailSerializer, TaskSerializer, WorkLogSerializer)

User = get_user_model()


from .services import (apply_review, live_task, move_status, project_people,
                       send_to_review, sync_assignees, task_watchers)


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    search_fields = ["title", "description", "acceptance_criteria"]
    ordering_fields = ["priority", "due_date", "created_at", "updated_at", "position"]
    ordering = ["-priority", "due_date", "-id"]

    # ------------------------------------------------------------ queryset
    def get_queryset(self):
        user = self.request.user
        qs = (Task.objects.for_display()
              # O'chirilgan loyihaning vazifalari hech qayerda ko'rinmaydi
              # (yozuvlar bazada qoladi).
              .filter(project__deleted_at__isnull=True))

        # Ko'rish doirasi `ProjectAccess.can_view` bilan bir xil qoidadan
        # keladi: a'zo bo'lgan loyihalar + o'z ish maydonidagi ochiqlar.
        # Hamma loyihani ko'radiganlar uchun shart o'zi bo'sh `Q()` bo'ladi -
        # rolni bu yerda IKKINCHI marta sanash kerak emas va aynan shunday
        # takror qoldirilgan joyda ro'yxatlar bir-biridan uzoqlashardi
        # (bittasida boshliq qo'shildi, ikkinchisida esdan chiqdi).
        qs = qs.filter(visible_projects_q(user, "project__"))

        # Loyiha ichida esa - kimning ishi ko'rinishi. Menejerga hammasi,
        # qolganga o'ziniki (`task_scope_q`). Doska ham shu yerdan o'tadi.
        qs = qs.filter(task_scope_q(user))

        # Raqamli filtrlar `int_param` dan o'tadi: yaroqsiz qiymat ("abc")
        # so'rov bajarilayotganda ValueError bilan 500 bermasin - 400 qaytsin.
        p = self.request.query_params
        if p.get("project"):
            qs = qs.filter(project_id=int_param(p["project"], "project"))
        if p.get("status"):
            qs = qs.filter(status__in=p["status"].split(","))
        if p.get("task_type"):
            qs = qs.filter(task_type=p["task_type"])
        if p.get("priority"):
            qs = qs.filter(priority=int_param(p["priority"], "priority"))
        if p.get("assignee"):
            who = user.pk if p["assignee"] == "me" else int_param(p["assignee"], "assignee")
            qs = qs.filter(Exists(TaskAssignment.objects.filter(
                task=OuterRef("pk"), user_id=who, is_active=True)))
        if p.get("open") == "1":
            qs = qs.exclude(status__in=[TaskStatus.DONE, TaskStatus.CANCELLED])
        if p.get("overdue") == "1":
            from django.utils import timezone
            qs = qs.filter(due_date__lt=timezone.now()).exclude(
                status__in=[TaskStatus.DONE, TaskStatus.CANCELLED])
        return qs

    def get_serializer_class(self):
        if self.action in ("retrieve", "create", "update", "partial_update"):
            return TaskDetailSerializer
        return TaskSerializer

    # Vazifa sahifasi bir so'rovda izohlar, ish jurnali, tekshiruvlar, fayllar
    # va ostki vazifalarni qaytaradi. Ular oldindan yuklanmasa har bir yozuv
    # uchun muallif alohida so'roviga aylanardi (10 izoh + 10 worklog = +20).
    DETAIL_PREFETCH = ("assignments__user", "labels", "comments__author",
                       "worklogs__user", "reviews__reviewer",
                       "attachments__uploaded_by", "subtasks__project",
                       "subtasks__assignments__user")

    def get_object(self):
        task = object_or_404(
            Task.objects.select_related("project", "project__workspace",
                                        "created_by", "reviewer")
            .prefetch_related(*self.DETAIL_PREFETCH),
            pk=self.kwargs["pk"])
        need = "view" if self.request.method in ("GET", "HEAD", "OPTIONS") else "work"
        check_access(self.request.user, task.project, need)
        return task

    # ------------------------------------------------------------ yaratish
    def create(self, request, *args, **kwargs):
        project = object_or_404(Project, pk=request.data.get("project"))
        check_access(request.user, project, "task")

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignee_ids = serializer.validated_data.pop("assignee_ids", [])
        label_ids = serializer.validated_data.pop("label_ids", [])
        reviewer_id = serializer.validated_data.pop("reviewer_id", None)
        # Ota vazifa: faqat PM va loyiha admini biriktira oladi.
        parent = serializer.validated_data.get("parent")
        if parent is not None:
            access = ProjectAccess(request.user, project)
            if not access.can_create_subtask:
                raise PermissionDenied(
                    "Vazifa ichiga ostki vazifa (subtask) joylash faqat loyiha menejeri (PM) yoki loyiha adminiga ruxsat etilgan."
                )
            if parent.project_id != project.pk:
                raise ValidationError({"parent": "Ota vazifa shu loyihadan bolishi kerak."})
        # «Bajarildi» - tekshiruvning natijasi, boshlang'ich holat emas.
        if serializer.validated_data.get("status") == TaskStatus.DONE:
            raise ValidationError({
                "status": "Yangi vazifa «Bajarildi» holatida yaratilmaydi - "
                          "ish topshirilib, tekshiruvdan otishi kerak."})

        task = serializer.save(project=project, created_by=request.user,
                               reviewer_id=reviewer_id)
        if label_ids:
            task.labels.set(Label.objects.filter(project=project, id__in=label_ids))
        _, _, skipped = sync_assignees(task, assignee_ids, request.user)

        log(actor=request.user, verb="task.created", task=task,
            summary="{} yaratildi: {}".format(task.code, task.title),
            detail=task.description[:500],
            meta={"priority": task.priority_label, "type": task.get_task_type_display(),
                  "specialty": task.required_specialty or None})
        live_task(task, "created", request.user, title=task.title[:120])
        payload = TaskDetailSerializer(task, context=self.get_serializer_context()).data
        # Jamoada yo'q odamlar biriktirilmadi - interfeys buni aytib qo'ysin.
        payload["skipped_assignees"] = skipped
        return Response(payload, status=201)

    def update(self, request, *args, **kwargs):
        task = self.get_object()
        access = ProjectAccess(request.user, task.project)
        # Vazifa mazmunini (sarlavha, tavsif, muddat, ijrochi) faqat menejer
        # va admin o'zgartiradi. Ijrochi ishni bajaradi: holatni suradi, izoh
        # yozadi, fayl biriktiradi va ishni topshiradi - lekin topshiriqning
        # o'zini qayta yozmaydi.
        if not access.can_create_task:
            raise PermissionDenied(
                "Vazifani faqat loyiha menejeri yoki admin ozgartira oladi.")

        tracked = ["title", "description", "acceptance_criteria", "priority", "due_date",
                   "task_type", "estimate_hours", "branch_name", "pr_url"]
        before = {f: getattr(task, f) for f in tracked}

        serializer = self.get_serializer(task, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        assignee_ids = serializer.validated_data.pop("assignee_ids", None)
        label_ids = serializer.validated_data.pop("label_ids", None)
        reviewer_id = serializer.validated_data.pop("reviewer_id", "skip")
        if reviewer_id != "skip":
            serializer.validated_data["reviewer_id"] = reviewer_id
        # Ota vazifa tekshiruvi: faqat PM va loyiha admini biriktira yoki ajrata oladi.
        parent = serializer.validated_data.get("parent")
        if "parent" in serializer.validated_data and serializer.validated_data["parent"] != task.parent:
            if not access.can_create_subtask:
                raise PermissionDenied(
                    "Vazifa ichiga ostki vazifa joylash yoki ajratish faqat loyiha menejeri (PM) yoki loyiha adminiga ruxsat etilgan."
                )
            if parent is not None:
                if parent.project_id != task.project_id:
                    raise ValidationError({"parent": "Ota vazifa shu loyihadan bolishi kerak."})
                if parent.pk == task.pk:
                    raise ValidationError({"parent": "Vazifa o'ziga ota vazifa bo'la olmaydi."})
                curr = parent
                while curr:
                    if curr.pk == task.pk:
                        raise ValidationError({"parent": "Siklik bog'liqlik: vazifa o'zining ostki vazifasiga biriktirilishi mumkin emas."})
                    curr = curr.parent
        # Holat shu yerda yozilmaydi: u `move_status` dan o'tadi - aks holda
        # «Bajarildi» taqig'i, `completed_at` va tarix yozuvi chetlab o'tilardi.
        new_status = serializer.validated_data.pop("status", None)

        obj = serializer.save()
        if new_status:
            move_status(obj, new_status, access, request.user,
                        blocked_reason=request.data.get("blocked_reason", ""))
        if label_ids is not None:
            obj.labels.set(Label.objects.filter(project=obj.project, id__in=label_ids))
        skipped = []
        if assignee_ids is not None:
            _, _, skipped = sync_assignees(obj, assignee_ids, request.user)

        changes = {}
        for f in tracked:
            if before[f] != getattr(obj, f):
                changes[str(obj._meta.get_field(f).verbose_name)] = (before[f], getattr(obj, f))
        log_field_changes(request.user, obj, changes)
        live_task(obj, "updated", request.user, title=obj.title[:120])

        payload = TaskDetailSerializer(obj, context=self.get_serializer_context()).data
        payload["skipped_assignees"] = skipped
        return Response(payload)

    def destroy(self, request, *args, **kwargs):
        task = self.get_object()
        check_access(request.user, task.project, "manage")
        # Yumshoq o'chirish: avval bazada qator belgilanadi. Agar baza xatosi
        # bo'lsa, xatolik qaytadi; efirga yolg'on "o'chirildi" signali ketmaydi.
        task.soft_delete(request.user)
        log(actor=request.user, verb="task.deleted", project=task.project,
            summary="{} ochirildi: {}".format(task.code, task.title))
        live_task(task, "deleted", request.user)
        return Response(status=204)

    # ------------------------------------------------------------ ommaviy yaratish
    @action(detail=False, methods=["post"], url_path="bulk")
    def bulk(self, request):
        project = object_or_404(Project, pk=request.data.get("project"))
        check_access(request.user, project, "task")

        s = BulkTaskSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        # Bitta vazifada bo'lgani kabi: «Bajarildi» - tekshiruvning natijasi.
        if d["status"] == TaskStatus.DONE:
            raise ValidationError({
                "status": "Vazifalar «Bajarildi» holatida yaratilmaydi."})

        from apps.accounts.models import GlobalRole

        members = list(
            project.memberships.filter(is_active=True)
            .exclude(user__global_role__in=[GlobalRole.ADMIN, GlobalRole.BOSS])
            .exclude(user__is_superuser=True)
            .select_related("user")
        )
        member_ids = {m.user_id for m in members}
        assignees = [uid for uid in d["assignee_ids"] if uid in member_ids]

        required = (d.get("required_specialty") or "").strip()
        skipped = []
        if required and d.get("match_by_specialty"):
            spec_ok = {m.user_id for m in members if m.user.specialty == required}
            skipped = [uid for uid in assignees if uid not in spec_ok]
            assignees = [uid for uid in assignees if uid in spec_ok]
            if not assignees:
                # hech kim tanlanmagan bolsa loyihadagi mos mutaxassislarga beramiz
                assignees = list(spec_ok)

        created = []
        # Kimga qaysi vazifa tekkani - xabarni odam boshiga bir marta yuborish uchun.
        given = {}
        # Yuzta vazifa - yoki hammasi, yoki hech biri. O'rtada uzilsa yarim
        # ro'yxat qolib, foydalanuvchi qolganini qo'lda qidirib yurardi.
        # Bildirishnoma va tarix ataylab tashqarida: ular yozuvlar bazaga
        # tushgandan keyin ketadi.
        with transaction.atomic():
            # Bitta qulf bilan loyihaning eng so'nggi raqamini olamiz
            type(project).objects.select_for_update().filter(pk=project.pk).exists()
            last_no = (Task.all_objects.filter(project=project)
                       .order_by("-number").values_list("number", flat=True).first() or 0)

            for idx, title in enumerate(d["titles"]):
                last_no += 1
                task = Task(project=project, title=title[:250], created_by=request.user,
                            priority=d["priority"], task_type=d["task_type"],
                            status=d["status"], due_date=d.get("due_date"),
                            required_specialty=required,
                            acceptance_criteria=d.get("acceptance_criteria", ""),
                            number=last_no)
                task._number_assigned = True
                task.save()
                if assignees:
                    targets = ([assignees[idx % len(assignees)]] if d["distribute"]
                               else assignees)
                    for uid in targets:
                        TaskAssignment.objects.create(task=task, user_id=uid,
                                                      assigned_by=request.user)
                        given.setdefault(uid, []).append(task.code)
                created.append(task)

        log(actor=request.user, verb="task.created", project=project,
            summary="{} ta task yaratildi".format(len(created)),
            detail="\n".join("{} - {}".format(t.code, t.title) for t in created[:50]),
            meta={"count": len(created), "codes": [t.code for t in created[:50]]})

        # 20 ta vazifa 20 ta qo'ng'iroq bo'lmasin: har kimga bitta yig'ma xabar.
        by_id = {m.user_id: m.user for m in members}
        for uid, codes in given.items():
            notify(by_id.get(uid), NotificationKind.TASK_ASSIGNED,
                   title="{} ta yangi vazifa biriktirildi".format(len(codes)),
                   body="{} - {}".format(project.name, ", ".join(codes[:10])),
                   url="/mening-ishim", actor=request.user,
                   meta={"project": project.pk, "codes": codes[:20]})
        if created:
            live_task(created[0], "created", request.user, count=len(created))
        return Response({
            "created": len(created),
            "skipped_assignees": skipped,
            "tasks": TaskSerializer(created, many=True,
                                    context=self.get_serializer_context()).data,
        }, status=201)

    # ------------------------------------------------------------ doska
    @action(detail=False, methods=["get"])
    def board(self, request):
        project_id = request.query_params.get("project")
        if not project_id:
            raise ValidationError({"project": "Loyiha ID kerak."})
        project = object_or_404(Project, pk=project_id)
        access = check_access(request.user, project, "view")

        qs = self.filter_queryset(self.get_queryset()).filter(project=project)
        # Ruxsat butun doska uchun bitta - kartalarga kontekst orqali beriladi.
        ctx = self.get_serializer_context()
        ctx["board_access"] = access
        raw_limit = request.query_params.get("limit")
        limit = int_param(raw_limit, "limit") if raw_limit else 100
        limit = max(1, min(limit, 500))
        columns = []
        for status in BOARD_COLUMNS:
            col_qs = qs.filter(status=status).order_by("position", "-priority", "id")
            total_count = col_qs.count()
            items = BoardTaskSerializer(col_qs[:limit], many=True, context=ctx).data
            columns.append({
                "status": status,
                "label": TaskStatus(status).label,
                "count": total_count,
                "tasks": items,
            })
        return Response({"columns": columns, "access": access.as_dict()})

    # ------------------------------------------------------------ holat
    @action(detail=True, methods=["post"], url_path="status")
    def change_status(self, request, pk=None):
        task = self.get_object()
        access = check_access(request.user, task.project, "work")

        s = StatusChangeSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        new_status = s.validated_data["status"]

        # Doskada kartani «Bajarildi» ustuniga tashlash - tekshiruvchi uchun
        # TASDIQLASH degani. Ilgari bu har doim rad etilardi: doskada ustun
        # ko'rinib turar, lekin unga tashlab bo'lmasdi - hatto menejer ham
        # xato xabarini olardi va tasdiqlash uchun boshqa sahifaga o'tishi
        # kerak edi. Qoida buzilmaydi: ish avval topshirilgan bo'lishi
        # (`IN_REVIEW`) va odamning tekshirish huquqi bo'lishi shart.
        if (new_status == TaskStatus.DONE and task.status == TaskStatus.IN_REVIEW
                and access.can_review):
            review = Review.objects.create(
                task=task, reviewer=request.user, verdict=ReviewVerdict.APPROVED,
                comment=s.validated_data.get("blocked_reason", "")[:1000],
                round_no=max(task.review_round, 1))
            apply_review(task, review, request.user)
        else:
            move_status(task, new_status, access, request.user,
                        blocked_reason=s.validated_data.get("blocked_reason", ""))

        return Response(TaskDetailSerializer(task,
                                             context=self.get_serializer_context()).data)

    # ------------------------------------------------------------ muddat
    @action(detail=True, methods=["post"], url_path="due")
    def change_due(self, request, pk=None):
        """Vazifa MUDDATINI qo'yish yoki olib tashlash - «Mening ishim» doskasi.

        NEGA ALOHIDA ESHIK. Vazifani tahrirlash (`PATCH`) faqat menejer va
        adminga ochiq: ijrochi ishni bajaradi, topshiriqning o'zini qayta
        yozmaydi. Doskada esa odam O'Z ishini rejalashtiradi - kartani
        «bugun» ga tortadi yoki «barchasi» ga qaytarib muddatni oladi. Shu
        bitta amal uchun butun tahrirlashni ochib bo'lmasdi: u bilan birga
        sarlavha, tavsif, prioritet va IJROCHI ham ochilib ketardi.

        Shuning uchun eshik TOR: bu yerdan faqat `due_date` o'zgaradi va
        faqat ishning O'ZIDA ishlay oladigan odam (`work`) - ya'ni loyiha
        a'zosi. Boshqa maydonlarga baribir tegib bo'lmaydi.

        O'zgarish TARIXGA tushadi (`log_field_changes`) - muddat kim
        tomonidan surilgani ko'rinib tursin.
        """
        task = self.get_object()
        check_access(request.user, task.project, "work")

        raw = request.data.get("due_date", None)
        if raw in ("", None):
            due = None
        else:
            due = parse_datetime(raw) if isinstance(raw, str) else None
            if due is None:
                raise ValidationError({"due_date": "Muddat ISO korinishida bolsin."})
            if timezone.is_naive(due):
                due = timezone.make_aware(due)

        if due == task.due_date:
            return Response(TaskDetailSerializer(
                task, context=self.get_serializer_context()).data)

        before = task.due_date
        task.due_date = due
        task.save(update_fields=["due_date", "updated_at"])
        log_field_changes(request.user, task,
                          {str(task._meta.get_field("due_date").verbose_name): (before, due)})
        live_task(task, "updated", request.user, title=task.title[:120])
        from apps.core.cache import invalidate_panel_many
        uids = [u.id for u in task.assignee_list]
        if task.project.manager_id:
            uids.append(task.project.manager_id)
        if request.user and request.user.id:
            uids.append(request.user.id)
        invalidate_panel_many(uids)
        return Response(TaskDetailSerializer(
            task, context=self.get_serializer_context()).data)

    # ------------------------------------------------------------ boshqa odamga otkazish
    @action(detail=True, methods=["post"], url_path="reassign")
    def reassign(self, request, pk=None):
        """Vazifani BOSHQA odamga otkazish.

        Ijrochini vazifa formasidan ham ozgartirsa boladi, lekin u yerda
        butun topshiriq qaytadan ochiladi va royxatdan belgi olib tashlanadi -
        odam ketib qolgan yoki ish boshqasiga oshgan paytda bu uzoq yol.
        Bu yerda esa bitta amal: kimga va nega. Ish BITTA odamga otadi -
        "otkazish" degani shu, shuning uchun qolgan ijrochilar olib
        tashlanadi (yozuvlari ochmaydi, faqat nofaol boladi - kim qachon
        ishlagani tarixda qolsin).

        Ruxsat vazifani tahrirlash bilan bir xil: loyiha menejeri, loyiha
        admini va tizim admini. Ijrochining ozi ishni boshqaga otkaza olmaydi.
        """
        from django.utils import timezone

        task = self.get_object()
        access = ProjectAccess(request.user, task.project)
        if not access.can_create_task:
            raise PermissionDenied(
                "Vazifani boshqa odamga faqat loyiha menejeri yoki admin otkaza oladi.")
        # Tugagan ishni otkazishning ma'nosi yoq: yangi odam uchun bu ish emas,
        # eskisining tarixi esa buziladi.
        if task.status in (TaskStatus.DONE, TaskStatus.CANCELLED):
            raise ValidationError(
                {"detail": "Yakunlangan yoki bekor qilingan vazifani otkazib bolmaydi."})

        user_id = int_param(request.data.get("user_id"), "user_id")
        note = (request.data.get("note") or "").strip()[:250]

        # Faqat loyiha a'zosiga - `sync_assignees` dagi qoida bilan bir xil.
        member = (task.project.memberships.filter(is_active=True, user_id=user_id)
                  .select_related("user").first())
        if member is None:
            raise ValidationError({"user_id": "Vazifani faqat loyiha a'zosiga otkazish mumkin."})
        target = member.user

        active = list(task.assignments.filter(is_active=True).select_related("user"))
        if [a.user_id for a in active] == [target.id]:
            raise ValidationError({"user_id": "Vazifa allaqachon shu odamda."})

        now = timezone.now()
        for a in active:
            if a.user_id == target.id:
                continue
            a.is_active = False
            a.unassigned_at = now
            a.save(update_fields=["is_active", "unassigned_at"])

        # Odam ilgari shu vazifada bolgan bolsa yangi qator ochilmaydi -
        # eskisi qayta faollashadi (bir odam bir vazifada ikki marta turmasin).
        current = task.assignments.filter(user=target).first()
        if current is None:
            TaskAssignment.objects.create(task=task, user=target, assigned_by=request.user)
        else:
            current.is_active = True
            current.unassigned_at = None
            current.assigned_by = request.user
            current.save(update_fields=["is_active", "unassigned_at", "assigned_by"])

        gone = [a.user for a in active if a.user_id != target.id]
        detail = []
        if gone:
            detail.append("Oldingi ijrochi: " + ", ".join(u.full_name for u in gone))
        if note:
            detail.append("Sabab: " + note)
        log(actor=request.user, verb="task.reassigned", task=task,
            summary="{}: {} ga otkazildi".format(task.code, target.full_name),
            detail=" · ".join(detail),
            meta={"task": task.pk, "to": target.pk, "from": [u.pk for u in gone]})

        # Yangi ijrochi uchun bu - yangi ish, shuning uchun odatdagi
        # "biriktirildi" turi: ish royxatlari va filtrlar ozgarmaydi.
        notify_many([target], NotificationKind.TASK_ASSIGNED,
                    title="{} sizga otkazildi".format(task.code),
                    body=(note or task.title)[:150],
                    url="/vazifa/{}".format(task.pk), actor=request.user,
                    meta={"task": task.pk, "project": task.project_id})
        # Ishdan chiqqan odam ham bilsin - aks holda u eski topshiriq ustida
        # ishlab yuraveradi.
        if gone:
            notify_many(gone, NotificationKind.TASK_REASSIGNED,
                        title="{} boshqa ijrochiga otkazildi".format(task.code),
                        body="Endi ustida {} ishlaydi".format(target.full_name),
                        url="/vazifa/{}".format(task.pk), actor=request.user,
                        meta={"task": task.pk, "project": task.project_id})

        live_task(task, "updated", request.user, title=task.title[:120])
        task.refresh_from_db()
        return Response(TaskDetailSerializer(
            task, context=self.get_serializer_context()).data)

    # ------------------------------------------------------------ izoh / ish jurnali
    @action(detail=True, methods=["post"], url_path="comments")
    def add_comment(self, request, pk=None):
        task = self.get_object()
        s = CommentSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        comment = s.save(task=task, author=request.user)
        log(actor=request.user, verb="task.commented", task=task,
            summary="{} ga izoh qoldirdi".format(task.code), detail=comment.body[:500])
        # `collapse=True`: ketma-ket izohlar bitta qo'ng'iroqqa yig'iladi.
        notify_many(task_watchers(task), NotificationKind.TASK_COMMENT,
                    title="{} ga yangi izoh".format(task.code),
                    body="{}: {}".format(request.user.full_name, comment.body[:120]),
                    url="/vazifa/{}".format(task.pk), actor=request.user,
                    meta={"task": task.pk}, collapse=True)
        live_task(task, "comment", request.user)
        return Response(CommentSerializer(comment, context={"request": request}).data, status=201)

    @action(detail=True, methods=["post"], url_path="worklogs")
    def add_worklog(self, request, pk=None):
        task = self.get_object()
        check_access(request.user, task.project, "work")
        s = WorkLogSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        wl = s.save(task=task, user=request.user)
        log(actor=request.user, verb="task.worklog", task=task,
            summary="{}: {} soat ish qayd etildi".format(task.code, wl.hours),
            detail=wl.note[:500], meta={"hours": str(wl.hours)})
        return Response(WorkLogSerializer(wl, context={"request": request}).data, status=201)

    # ------------------------------------------------------------ ish topshirish
    @action(detail=True, methods=["get", "post"], url_path="submissions",
            parser_classes=[MultiPartParser, FormParser, JSONParser])
    def submissions(self, request, pk=None):
        """Dasturchi ishni yakunlab hisobot topshiradi.

        GET  - topshiriqlar (tahrir tarixi bilan);
        POST - yangi topshiriq: matn + ixtiyoriy fayllar. Odatiy holda vazifa
               darrov TEKSHIRUVGA otadi va menejer tasdiqlamaguncha shunday
               turadi (`submit_for_review=0` bolsa - otmaydi).
        """
        task = self.get_object()

        if request.method == "GET":
            check_access(request.user, task.project, "view")
            qs = (task.submissions.select_related("author")
                  .prefetch_related("files", "edits__editor"))
            return Response(SubmissionSerializer(qs, many=True,
                                                 context=self.get_serializer_context()).data)

        access = check_access(request.user, task.project, "work")

        ser = SubmissionSerializer(data={"text": request.data.get("text", "")},
                                   context=self.get_serializer_context())
        ser.is_valid(raise_exception=True)
        submission = ser.save(task=task, author=request.user,
                              round_no=max(task.review_round, 1))

        uploads = check_uploads(
            request.FILES.getlist("file") or request.FILES.getlist("files"))
        for f in uploads:
            fs = AttachmentSerializer(data={"file": f, "description": "Ish topshirigi"},
                                      context={"request": request})
            fs.is_valid(raise_exception=True)
            fs.save(task=task, submission=submission, uploaded_by=request.user,
                    content_type=(getattr(f, "content_type", "") or "")[:120])

        moved = False
        old_label = task.get_status_display()
        wants_review = str(request.data.get("submit_for_review", "1")).lower() not in ("0", "false")
        if wants_review:
            moved = send_to_review(task, access)
            if moved:
                submission.round_no = task.review_round
                submission.save(update_fields=["round_no"])
                log(actor=request.user, verb="task.submitted", task=task,
                    summary="{}: {} -> {}".format(task.code, old_label,
                                                  task.get_status_display()),
                    meta={"from": old_label, "to": task.get_status_display()})

        log(actor=request.user, verb="task.handover", task=task,
            summary="{}: ish topshirildi ({}-aylana)".format(task.code, submission.round_no),
            detail=submission.text[:1000],
            meta={"files": len(uploads), "moved_to_review": moved})

        # Tekshiruvchilarga xabar: kimdir ishni topshirdi
        reviewers = [m.user for m in task.project.memberships.filter(
            is_active=True, role__in=[ProjectRole.MANAGER, ProjectRole.ADMIN])
            .select_related("user")]
        notify_many(reviewers, NotificationKind.TASK_REVIEW,
                    title="{} tekshiruvga topshirildi".format(task.code),
                    body="{}: {}".format(request.user.full_name, task.title[:100]),
                    url="/vazifa/{}".format(task.pk), actor=request.user)

        live_task(task, "submitted", request.user)

        payload = SubmissionSerializer(
            submission, context=self.get_serializer_context()).data
        # Interfeys rostini aytsin: vazifa tekshiruvga otdimi yoki yoq.
        payload["moved_to_review"] = moved
        payload["task_status"] = task.status
        payload["task_status_display"] = task.get_status_display()
        return Response(payload, status=201)

    @action(detail=True, methods=["patch", "delete"],
            url_path="submissions/(?P<submission_id>[^/.]+)")
    def submission_detail(self, request, pk=None, submission_id=None):
        """Topshiriqni tahrirlash yoki ochirish.

        Tahrirlanganda eski matn `SubmissionEdit` da qoladi - tarix yoqolmaydi.
        """
        task = self.get_object()
        submission = object_or_404(Submission, pk=submission_id, task=task)
        access = ProjectAccess(request.user, task.project)
        mine = submission.author_id == request.user.pk
        if not (mine or access.can_manage):
            raise PermissionDenied("Faqat topshirgan odam yoki menejer ozgartira oladi.")

        if request.method == "DELETE":
            # Fayl topshiriq bilan birga yoq bolib ketmasin. `Attachment.submission`
            # CASCADE - shuning uchun oldin bogni uzamiz: fayllar vazifada qoladi
            # va "Fayllar" bolimidan ochilaveradi. Skrinshot, log, patch - bular
            # qilingan ishning isboti, matn ochirilgani bilan ular kerak boladi.
            kept = list(submission.files.values_list("original_name", flat=True))
            log(actor=request.user, verb="task.handover_deleted", task=task,
                summary="{}: ish topshirigi ochirildi".format(task.code),
                detail="{}{}".format(
                    submission.text[:500],
                    "\n\nFayllar vazifada qoldirildi: " + ", ".join(kept) if kept else ""))
            # Yumshoq o'chirish. Fayllarni topshiriqdan uzish ham endi shart
            # emas: CASCADE ishlamaydi, ya'ni ular joyida qoladi va topshiriq
            # tiklansa butun holicha qaytadi.
            submission.soft_delete(request.user)
            return Response(status=204)

        new_text = (request.data.get("text") or "").strip()
        if len(new_text) < 3:
            raise ValidationError({"text": "Qilingan ishni qisqacha bolsa ham yozing."})

        old_text = submission.text
        if new_text != old_text:
            SubmissionEdit.objects.create(submission=submission, editor=request.user,
                                          old_text=old_text, new_text=new_text)
            submission.text = new_text
            submission.edited_count += 1
            submission.save(update_fields=["text", "edited_count", "updated_at"])
            # Tahrirda fayllarga tegilmaydi - eskisi joyida qoladi. Tarixda
            # ham korinib tursin: ish qaysi fayl bilan topshirilgani muhim.
            names = list(submission.files.values_list("original_name", flat=True))
            log(actor=request.user, verb="task.handover_edited", task=task,
                summary="{}: ish topshirigi tahrirlandi".format(task.code),
                detail="Eski: {}\nYangi: {}{}".format(
                    old_text[:400], new_text[:400],
                    "\nFayllar (ozgarmadi): " + ", ".join(names) if names else ""))

        submission.refresh_from_db()
        return Response(SubmissionSerializer(
            submission, context=self.get_serializer_context()).data)

    # ------------------------------------------------------------ fayllar
    @action(detail=True, methods=["get", "post"], url_path="attachments",
            parser_classes=[MultiPartParser, FormParser, JSONParser])
    def attachments(self, request, pk=None):
        """GET - fayllar royxati; POST - fayl biriktirish (multipart/form-data)."""
        task = self.get_object()

        if request.method == "GET":
            qs = task.attachments.select_related("uploaded_by")
            return Response(AttachmentSerializer(qs, many=True,
                                                 context={"request": request}).data)

        check_access(request.user, task.project, "work")
        files = request.FILES.getlist("file") or request.FILES.getlist("files")
        if not files:
            raise ValidationError({"file": "Fayl tanlanmagan."})
        check_uploads(files)

        created = []
        for f in files:
            s = AttachmentSerializer(
                data={"file": f, "description": request.data.get("description", "")},
                context={"request": request})
            s.is_valid(raise_exception=True)
            created.append(s.save(task=task, uploaded_by=request.user,
                                  content_type=(getattr(f, "content_type", "") or "")[:120]))

        log(actor=request.user, verb="task.attachment", task=task,
            summary="{}: {} ta fayl biriktirildi".format(task.code, len(created)),
            detail=", ".join(a.original_name for a in created),
            meta={"files": [{"name": a.original_name, "size": a.size} for a in created]})

        return Response(AttachmentSerializer(created, many=True,
                                             context={"request": request}).data, status=201)

    @action(detail=True, methods=["delete"], url_path="attachments/(?P<attachment_id>[^/.]+)")
    def delete_attachment(self, request, pk=None, attachment_id=None):
        task = self.get_object()
        att = object_or_404(Attachment, pk=attachment_id, task=task)
        access = ProjectAccess(request.user, task.project)
        if not (access.can_manage or att.uploaded_by_id == request.user.id):
            raise PermissionDenied("Faylni faqat yuklagan odam yoki menejer ochira oladi.")
        name = att.original_name
        # Fayl diskdan ham, bazadan ham yo'q qilinmaydi: yozuv `deleted_at`
        # bilan belgilanadi va admin panelidan qaytarib bo'ladi. Ilgari
        # baytlar ham o'chirilardi - xato bosilgan tugmani tiklab bo'lmasdi.
        att.soft_delete(request.user)
        log(actor=request.user, verb="task.attachment_deleted", task=task,
            summary="{}: fayl ochirildi ({})".format(task.code, name))
        return Response(status=204)

    # ------------------------------------------------------------ tekshiruv
    @action(detail=False, methods=["get"], url_path="review-queue")
    def review_queue(self, request):
        """Tasdiqlanishi kutilayotgan ishlar - ishni QABUL QILADIGAN odamga.

        KIMGA. Loyiha menejeri, loyiha admini va platforma admini -
        `managed_projects_q` aynan shu uchovini beradi. Ijrochiga bu navbat
        tegishli emas: uning ishi tekshiruvga o'tgach qarorni boshqa odam
        beradi va ro'yxat unda har doim bo'sh edi.

        HALI LOYIHASI YO'Q MENEJER ham kira oladi (`can_create_project`):
        u loyiha ochishi bilan navbat to'ladi, darhol «ruxsat yo'q»
        degan javob esa xato tuyulardi - navbat bo'sh, xolos.
        """
        user = request.user
        # `Project.objects` o'chirilgan loyihalarni yashiradi, ya'ni
        # `project__in=managed` ularni ro'yxatdan ham chiqarib tashlaydi.
        managed = Project.objects.filter(managed_projects_q(user))
        if not (user.can_create_project or managed.exists()):
            raise PermissionDenied("Tekshiruv navbati loyiha menejeriga tegishli.")
        qs = Task.objects.filter(status=TaskStatus.IN_REVIEW, project__in=managed)
        qs = (qs.select_related("project", "created_by")
              .prefetch_related("assignments__user", "labels").order_by("submitted_at", "id"))

        if "page" in request.query_params or "page_size" in request.query_params:
            page = self.paginate_queryset(qs)
            if page is not None:
                serializer = TaskSerializer(page, many=True,
                                            context=self.get_serializer_context())
                return self.get_paginated_response(serializer.data)

        return Response(TaskSerializer(qs, many=True,
                                       context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"], url_path="review")
    def review(self, request, pk=None):
        task = self.get_object()
        check_access(request.user, task.project, "review")

        s = ReviewSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        review = s.save(task=task, reviewer=request.user,
                        round_no=max(task.review_round, 1))
        apply_review(task, review, request.user)

        return Response(TaskDetailSerializer(task,
                                             context=self.get_serializer_context()).data)

    @action(detail=False, methods=["get"], url_path="suggest-assignees")
    def suggest_assignees(self, request):
        """?project=<id>&specialty=<code> - vazifaga mos azolarni tavsiya qiladi."""
        from apps.accounts.serializers import UserBriefSerializer

        project = object_or_404(Project, pk=request.query_params.get("project"))
        check_access(request.user, project, "view")
        from apps.accounts.models import GlobalRole

        members = (project.memberships
                   .filter(is_active=True)
                   .exclude(user__global_role__in=[GlobalRole.ADMIN, GlobalRole.BOSS])
                   .exclude(user__is_superuser=True)
                   .select_related("user"))
        # Ochiq vazifalar soni HAMMA a'zo uchun bitta guruhlangan so'rovda
        # olinadi. Ilgari tsikl ichida `count()` chaqirilardi va so'rovlar soni
        # jamoa kattaligiga ko'payib ketardi (14 a'zo -> 18 so'rov).
        open_counts = dict(
            TaskAssignment.objects
            .filter(task__project=project, is_active=True,
                    task__status__in=[TaskStatus.TODO, TaskStatus.IN_PROGRESS,
                                      TaskStatus.CHANGES_REQUESTED])
            .values_list("user_id").annotate(n=Count("id")))
        rows = []
        for m in members:
            if specialty and m.user.specialty != specialty:
                continue
            open_count = open_counts.get(m.user_id, 0)
            rows.append({
                "user": UserBriefSerializer(m.user, context={"request": request}).data,
                "role": m.role,
                "open_tasks": open_count,
                "matches": (not specialty) or m.user.specialty == specialty,
            })
        rows.sort(key=lambda r: (not r["matches"], r["open_tasks"]))
        return Response(rows)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        from apps.activity.serializers import ActivitySerializer

        task = self.get_object()
        qs = Activity.objects.filter(task=task).select_related("actor").order_by("-created_at")
        return Response(ActivitySerializer(qs, many=True, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="subtasks")
    def create_subtask(self, request, pk=None):
        """Vazifa ichiga yangi ostki vazifa (subtask) yaratish.
        Faqat loyiha menejeri (PM) va loyiha admini qila oladi.
        """
        task = self.get_object()
        access = ProjectAccess(request.user, task.project)
        if not access.can_create_subtask:
            raise PermissionDenied(
                "Ostki vazifa (subtask) yaratish faqat loyiha menejeri (PM) yoki loyiha adminiga ruxsat etilgan."
            )

        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        data["project"] = task.project_id
        data["parent"] = task.pk
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        assignee_ids = serializer.validated_data.pop("assignee_ids", [])
        label_ids = serializer.validated_data.pop("label_ids", [])
        reviewer_id = serializer.validated_data.pop("reviewer_id", None)

        if serializer.validated_data.get("status") == TaskStatus.DONE:
            raise ValidationError({
                "status": "Yangi vazifa «Bajarildi» holatida yaratilmaydi."
            })

        subtask = serializer.save(
            project=task.project,
            parent=task,
            created_by=request.user,
            reviewer_id=reviewer_id or task.reviewer_id,
        )
        if label_ids:
            subtask.labels.set(Label.objects.filter(project=task.project, id__in=label_ids))
        _, _, skipped = sync_assignees(subtask, assignee_ids, request.user)

        log(actor=request.user, verb="task.created", task=subtask,
            summary="{} ostki vazifasi yaratildi: {}".format(subtask.code, subtask.title),
            detail=subtask.description[:500],
            meta={"priority": subtask.priority_label, "type": subtask.get_task_type_display(),
                  "parent_code": task.code})
        live_task(subtask, "created", request.user, title=subtask.title[:120])
        live_task(task, "updated", request.user, title=task.title[:120])

        payload = TaskSerializer(subtask, context=self.get_serializer_context()).data
        payload["skipped_assignees"] = skipped
        return Response(payload, status=201)

    @action(detail=True, methods=["post"], url_path="link-subtask")
    def link_subtask(self, request, pk=None):
        """Mavjud vazifani shu vazifaga ostki vazifa qilib biriktirish.
        Faqat loyiha menejeri (PM) va loyiha admini qila oladi.
        """
        task = self.get_object()
        access = ProjectAccess(request.user, task.project)
        if not access.can_create_subtask:
            raise PermissionDenied(
                "Ostki vazifa biriktirish faqat loyiha menejeri (PM) yoki loyiha adminiga ruxsat etilgan."
            )
        subtask_id = request.data.get("subtask_id")
        if not subtask_id:
            raise ValidationError({"subtask_id": "Biriktiriladigan vazifa tanlanishi shart."})

        subtask = object_or_404(Task.objects.filter(deleted_at__isnull=True), pk=subtask_id)
        if subtask.project_id != task.project_id:
            raise ValidationError({"subtask_id": "Vazifa boshqa loyihaga tegishli."})
        if subtask.pk == task.pk:
            raise ValidationError({"subtask_id": "Vazifa o'ziga ostki vazifa bo'la olmaydi."})

        curr = task
        while curr:
            if curr.pk == subtask.pk:
                raise ValidationError({"subtask_id": "Siklik bog'liqlik: vazifa o'zining avlodiga biriktirilishi mumkin emas."})
            curr = curr.parent

        subtask.parent = task
        subtask.save(update_fields=["parent", "updated_at"])

        log(actor=request.user, verb="task.updated", task=subtask,
            summary="{} vazifasi {} ning ostki vazifasi qilib biriktirildi".format(subtask.code, task.code))
        live_task(task, "updated", request.user, title=task.title[:120])
        live_task(subtask, "updated", request.user, title=subtask.title[:120])

        return Response(TaskDetailSerializer(task, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"], url_path="unlink-subtask")
    def unlink_subtask(self, request, pk=None):
        """Ostki vazifani ota vazifadan ajratish (mustaqil vazifaga aylantirish).
        Faqat loyiha menejeri (PM) va loyiha admini qila oladi.
        """
        task = self.get_object()
        access = ProjectAccess(request.user, task.project)
        if not access.can_create_subtask:
            raise PermissionDenied(
                "Ostki vazifani ajratish faqat loyiha menejeri (PM) yoki loyiha adminiga ruxsat etilgan."
            )
        subtask_id = request.data.get("subtask_id")
        if not subtask_id:
            raise ValidationError({"subtask_id": "Ajratiladigan vazifa ko'rsatilishi shart."})

        subtask = object_or_404(task.subtasks.filter(deleted_at__isnull=True), pk=subtask_id)
        subtask.parent = None
        subtask.save(update_fields=["parent", "updated_at"])

        log(actor=request.user, verb="task.updated", task=subtask,
            summary="{} ostki vazifasi {} dan ajratildi".format(subtask.code, task.code))
        live_task(task, "updated", request.user, title=task.title[:120])
        live_task(subtask, "updated", request.user, title=subtask.title[:120])

        return Response(TaskDetailSerializer(task, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["get"], url_path="available-subtasks")
    def available_subtasks(self, request, pk=None):
        """Shu vazifaga ostki vazifa qilib biriktirish mumkin bo'lgan ochiq vazifalar ro'yxati."""
        task = self.get_object()
        exclude_ids = {task.pk}
        for sid in task.subtasks.filter(deleted_at__isnull=True).values_list("id", flat=True):
            exclude_ids.add(sid)
        curr = task.parent
        while curr:
            exclude_ids.add(curr.pk)
            curr = curr.parent

        qs = (Task.objects.filter(project=task.project, deleted_at__isnull=True, parent__isnull=True)
              .exclude(id__in=exclude_ids)
              .order_by("-id"))

        q = request.query_params.get("q", "").strip()
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(number__icontains=q))

        return Response(TaskSerializer(qs[:50], many=True, context=self.get_serializer_context()).data)


class LabelViewSet(viewsets.ModelViewSet):
    """Loyiha teglari.

    Teg loyihaga tegishli, ya'ni uni ko'rish ham, o'zgartirish ham loyiha
    ruxsatiga bog'lanadi. Ilgari tekshiruv faqat YARATISHDA bor edi: ro'yxat
    har qanday `?project=<id>` uchun ochiq qaytar, tahrirlash va o'chirish esa
    loyihaga aloqasi yo'q odamga ham ishlar edi.
    """

    serializer_class = LabelSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Label.objects.select_related("project").filter(
            project__deleted_at__isnull=True)
        # Ko'rish doirasi vazifalar bilan bir xil: admin va boshliq
        # hammasini, qolganlar o'zi a'zo bo'lgan loyihalarni.
        if not sees_all_projects(user):
            from apps.projects.models import ProjectMember

            qs = qs.filter(Exists(ProjectMember.objects.filter(
                project=OuterRef("project_id"), user=user, is_active=True)))
        project = self.request.query_params.get("project")
        if project:
            # Yaroqsiz qiymat 500 emas, 400 bersin.
            qs = qs.filter(project_id=int_param(project, "project"))
        return qs

    def get_object(self):
        """Teg jamoaga ko'rinadi, lekin uni faqat boshqaruvchi o'zgartiradi."""
        label = object_or_404(self.get_queryset(), pk=self.kwargs["pk"])
        need = "view" if self.request.method in ("GET", "HEAD", "OPTIONS") else "manage"
        check_access(self.request.user, label.project, need)
        return label

    def perform_create(self, serializer):
        project = object_or_404(Project, pk=self.request.data.get("project"))
        check_access(self.request.user, project, "manage")
        serializer.save(project=project)
