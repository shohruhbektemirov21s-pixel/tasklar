"""So'rovlar `django-admin/` da."""
from django.contrib import admin
from django.utils.html import format_html

from apps.core.queries import related_count

from .models import Inquiry, InquiryFile, InquiryVote, VoteChoice


class InquiryFileInline(admin.TabularInline):
    model = InquiryFile
    extra = 0
    readonly_fields = ("original_name", "size_display", "uploaded_by", "created_at")
    can_delete = True


@admin.register(Inquiry)
class InquiryAdmin(admin.ModelAdmin):
    list_display = (
        "title", "scope_badge", "status_badge", "who",
        "for_votes", "against_votes", "neutral_votes", "created_at"
    )
    list_filter = ("scope", "status", "is_anonymous")
    search_fields = ("title", "body")
    ordering = ("-created_at",)
    readonly_fields = ("author", "decided_by", "decided_at", "created_at", "updated_at")
    inlines = [InquiryFileInline]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("author", "decided_by").annotate(
            n_for=related_count(InquiryVote, group_by="inquiry",
                                choice=VoteChoice.FOR),
            n_against=related_count(InquiryVote, group_by="inquiry",
                                    choice=VoteChoice.AGAINST),
            n_neutral=related_count(InquiryVote, group_by="inquiry",
                                    choice=VoteChoice.NEUTRAL),
        )

    @admin.display(description="Turi")
    def scope_badge(self, obj):
        if obj.scope == "OPEN":
            return format_html('<span class="badge badge-info"><i class="fas fa-globe mr-1"></i>Ochiq</span>')
        return format_html('<span class="badge badge-secondary"><i class="fas fa-lock mr-1"></i>Yopiq</span>')

    @admin.display(description="Holat")
    def status_badge(self, obj):
        colors = {
            "PENDING": ("badge-warning", "fas fa-clock", "Ko'rib chiqilmoqda"),
            "APPROVED": ("badge-success", "fas fa-check", "Tasdiqlangan"),
            "REJECTED": ("badge-danger", "fas fa-times", "Rad etilgan"),
        }
        cls, icon, text = colors.get(obj.status, ("badge-secondary", "fas fa-circle", obj.get_status_display()))
        return format_html('<span class="badge {}"><i class="{} mr-1"></i>{}</span>', cls, icon, text)

    @admin.display(description="Muallif")
    def who(self, obj):
        return "— (anonim)" if obj.is_anonymous else obj.author.full_name

    @admin.display(description="Qo'shilaman", ordering="n_for")
    def for_votes(self, obj):
        return obj.n_for

    @admin.display(description="Qo'shilmayman", ordering="n_against")
    def against_votes(self, obj):
        return obj.n_against

    @admin.display(description="Betaraf", ordering="n_neutral")
    def neutral_votes(self, obj):
        return obj.n_neutral
