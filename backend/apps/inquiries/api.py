"""So'rovlar API."""
from django.db.models import F, IntegerField, OuterRef, Prefetch, Q, Subquery
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status as http, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.core.periods import due_span
from apps.core.queries import related_count
from apps.core.uploads import check_uploads

from .models import (Inquiry, InquiryFile, InquiryScope, InquiryStatus,
                     InquiryVote, VoteChoice)
from .permissions import CanAccessInquiries
from .serializers import (DecisionSerializer, InquiryFileSerializer,
                          InquirySerializer, VoteSerializer)
from .services import notify_decision, notify_new


class InquiryViewSet(viewsets.ModelViewSet):
    serializer_class = InquirySerializer
    permission_classes = [permissions.IsAuthenticated, CanAccessInquiries]

    def visible(self, me):
        """Odam ko'ra oladigan so'rovlar."""
        qs = Inquiry.objects.all()
        if not me.is_boss:
            qs = qs.filter(Q(scope=InquiryScope.OPEN) | Q(author=me))
        return qs

    def get_queryset(self):
        me = self.request.user

        qs = self.visible(me).select_related("author", "decided_by").prefetch_related(
            Prefetch("files", queryset=InquiryFile.objects
                     .select_related("uploaded_by", "inquiry")))

        qs = qs.annotate(
            for_count=related_count(InquiryVote, group_by="inquiry",
                                    choice=VoteChoice.FOR),
            against_count=related_count(InquiryVote, group_by="inquiry",
                                        choice=VoteChoice.AGAINST),
            neutral_count=related_count(InquiryVote, group_by="inquiry",
                                        choice=VoteChoice.NEUTRAL),
            my_vote=Subquery(
                InquiryVote.objects
                .filter(inquiry=OuterRef("pk"), user=me)
                .values("choice")[:1]),
        ).annotate(
            score=Coalesce(F("for_count") - F("against_count"), 0,
                           output_field=IntegerField()),
        )

        scope = self.request.query_params.get("scope")
        if scope in InquiryScope.values:
            qs = qs.filter(scope=scope)

        state = self.request.query_params.get("status")
        if state in InquiryStatus.values:
            qs = qs.filter(status=state)

        if self.request.query_params.get("mine") in ("1", "true"):
            qs = qs.filter(author=me)

        qs = self.searched(qs, self.request.query_params.get("search"))
        qs = self.on_dates(qs, self.request.query_params.get("date"),
                           self.request.query_params.get("period"))

        return qs.order_by(*self.ordering_for(self.request.query_params.get("sort")))

    def searched(self, qs, needle):
        needle = (needle or "").strip()
        if not needle:
            return qs
        return qs.filter(
            Q(title__icontains=needle)
            | Q(body__icontains=needle)
            | Q(is_anonymous=False, author__full_name__icontains=needle))

    def on_dates(self, qs, date_raw, period):
        span = due_span(date_raw or "", period or "")
        if span is None:
            return qs
        return qs.filter(created_at__gte=span[0], created_at__lt=span[1])

    SORTS = {
        "top": ("-score", "-for_count", "-created_at"),
        "new": ("-created_at",),
        "old": ("created_at",),
    }

    def ordering_for(self, key):
        return self.SORTS.get((key or "").strip(), self.SORTS["top"])

    # --------------------------------------------------------------- yozish

    def perform_create(self, serializer):
        obj = serializer.save(author=self.request.user)
        notify_new(obj)

    def _mine_or_403(self, obj):
        if obj.author_id != self.request.user.id and not self.request.user.is_boss:
            raise PermissionDenied("So'rovni faqat uni yozgan odam yoki boshliq o'zgartira oladi.")

    def perform_update(self, serializer):
        obj = serializer.instance
        self._mine_or_403(obj)

        changed = any(serializer.validated_data.get(f, getattr(obj, f)) != getattr(obj, f)
                      for f in ("title", "body", "scope", "is_anonymous"))
        if changed and obj.is_decided:
            obj.clear_decision()
            serializer.save(status=InquiryStatus.PENDING, decided_by=None,
                            decided_at=None, decision_note="")
            return
        serializer.save()

    def perform_destroy(self, instance):
        self._mine_or_403(instance)
        instance.delete()

    # --------------------------------------------------------------- amallar

    @action(detail=True, methods=["post"])
    def vote(self, request, pk=None):
        obj = self.get_object()
        if obj.scope != InquiryScope.OPEN:
            return Response({"detail": "Yopiq so'rovga ovoz berilmaydi."},
                            status=http.HTTP_400_BAD_REQUEST)

        form = VoteSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        choice = form.validated_data["choice"]

        existing = InquiryVote.objects.filter(inquiry=obj, user=request.user).first()
        if existing and existing.choice == choice:
            existing.delete()
        elif existing:
            existing.choice = choice
            existing.save(update_fields=["choice", "updated_at"])
        else:
            InquiryVote.objects.create(inquiry=obj, user=request.user, choice=choice)

        return Response(self.get_serializer(self.get_queryset().get(pk=obj.pk)).data)

    @action(detail=True, methods=["post"])
    def clear_vote(self, request, pk=None):
        obj = self.get_object()
        InquiryVote.objects.filter(inquiry=obj, user=request.user).delete()
        return Response(self.get_serializer(self.get_queryset().get(pk=obj.pk)).data)

    @action(detail=True, methods=["post"])
    def decide(self, request, pk=None):
        if not request.user.is_boss:
            raise PermissionDenied("So'rov bo'yicha qarorni faqat boshliq qabul qiladi.")

        obj = self.get_object()
        form = DecisionSerializer(data=request.data)
        form.is_valid(raise_exception=True)

        note = form.validated_data.get("decision_note", "").strip()
        new_status = form.validated_data.get("status")

        if new_status:
            obj.status = new_status
            obj.decided_by = request.user
            obj.decided_at = timezone.now()
        if note or new_status:
            obj.decision_note = note
        obj.save(update_fields=["status", "decided_by", "decided_at",
                                "decision_note", "updated_at"])

        if new_status or note:
            notify_decision(obj, actor=request.user, status_changed=bool(new_status))

        return Response(self.get_serializer(self.get_queryset().get(pk=obj.pk)).data)

    # ---------------------------------------------------------------- fayllar

    @action(detail=True, methods=["get", "post"], url_path="files",
            parser_classes=[MultiPartParser, FormParser, JSONParser])
    def files(self, request, pk=None):
        obj = self.get_object()

        if request.method == "GET":
            return Response(InquiryFileSerializer(
                obj.files.select_related("uploaded_by", "inquiry"), many=True,
                context=self.get_serializer_context()).data)

        self._mine_or_403(obj)
        uploads = request.FILES.getlist("file") or request.FILES.getlist("files")
        if not uploads:
            raise ValidationError({"file": "Fayl tanlanmagan."})
        check_uploads(uploads)

        created = []
        for f in uploads:
            form = InquiryFileSerializer(data={"file": f},
                                         context=self.get_serializer_context())
            form.is_valid(raise_exception=True)
            created.append(form.save(
                inquiry=obj, uploaded_by=request.user,
                content_type=(getattr(f, "content_type", "") or "")[:120]))

        return Response(InquiryFileSerializer(
            created, many=True, context=self.get_serializer_context()).data,
            status=http.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path="files/(?P<file_id>[^/.]+)")
    def delete_file(self, request, pk=None, file_id=None):
        obj = self.get_object()
        self._mine_or_403(obj)
        item = get_object_or_404(InquiryFile, pk=file_id, inquiry=obj)
        item.file.delete(save=False)
        item.delete()
        return Response(status=http.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=["get"], url_path="counts")
    def counts(self, request):
        base = self.visible(request.user)
        data = {
            "open": base.filter(scope=InquiryScope.OPEN).count(),
            "closed": base.filter(scope=InquiryScope.CLOSED).count(),
            "all": base.count(),
            "mine": base.filter(author=request.user).count(),
        }
        for value in InquiryStatus.values:
            data[value] = base.filter(status=value).count()
        data["pending"] = data[InquiryStatus.PENDING] if request.user.is_boss else 0
        return Response(data)
