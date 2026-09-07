"""So'rovlar serializerlari."""
from rest_framework import serializers

from apps.accounts.serializers import UserBriefSerializer

from .models import Inquiry, InquiryFile, InquiryScope, InquiryStatus, VoteChoice


class InquiryFileSerializer(serializers.ModelSerializer):
    """So'rovga biriktirilgan fayl."""

    uploaded_by = serializers.SerializerMethodField()
    size_display = serializers.CharField(read_only=True)
    extension = serializers.CharField(read_only=True)
    is_image = serializers.BooleanField(read_only=True)
    url = serializers.SerializerMethodField()
    file = serializers.FileField(write_only=True)

    class Meta:
        model = InquiryFile
        fields = [
            "id", "file", "url", "original_name", "size", "size_display",
            "content_type", "extension", "is_image", "uploaded_by", "created_at"
        ]
        read_only_fields = ["original_name", "size", "content_type", "created_at"]

    def get_url(self, obj):
        from apps.core.media import media_url

        return media_url(obj.file)

    def get_uploaded_by(self, obj):
        if obj.inquiry.is_anonymous:
            return None
        if not obj.uploaded_by_id:
            return None
        return UserBriefSerializer(obj.uploaded_by, context=self.context).data

    def validate_file(self, value):
        from apps.core.uploads import check_upload

        return check_upload(value)


class InquirySerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    decided_by = UserBriefSerializer(read_only=True)
    scope_display = serializers.CharField(source="get_scope_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    # Ovoz sonlari - `api.py` da annotatsiya qilinadi.
    for_count = serializers.IntegerField(read_only=True)
    against_count = serializers.IntegerField(read_only=True)
    neutral_count = serializers.IntegerField(read_only=True)
    score = serializers.IntegerField(read_only=True)
    my_vote = serializers.CharField(read_only=True, allow_null=True)

    files = InquiryFileSerializer(many=True, read_only=True)

    is_mine = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    can_decide = serializers.SerializerMethodField()
    can_vote = serializers.SerializerMethodField()

    class Meta:
        model = Inquiry
        fields = [
            "id", "title", "body", "scope", "scope_display", "is_anonymous",
            "status", "status_display", "author",
            "decided_by", "decided_at", "decision_note",
            "for_count", "against_count", "neutral_count", "score", "my_vote",
            "files", "is_mine", "can_edit", "can_decide", "can_vote",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "status", "decided_by", "decided_at", "decision_note",
            "created_at", "updated_at",
        ]

    def get_author(self, obj):
        if obj.is_anonymous:
            return None
        return UserBriefSerializer(obj.author, context=self.context).data

    def get_is_mine(self, obj):
        me = self.context.get("request") and self.context["request"].user
        return bool(me and me.is_authenticated and obj.author_id == me.id)

    def get_can_edit(self, obj):
        me = self.context.get("request") and self.context["request"].user
        if not (me and me.is_authenticated):
            return False
        # Muallif o'zgartira oladi (faqat hal qilinmagan bo'lsa)
        if obj.author_id == me.id and obj.status == InquiryStatus.PENDING:
            return True
        return False

    def get_can_decide(self, obj):
        me = self.context.get("request") and self.context["request"].user
        return bool(me and me.is_authenticated and me.is_boss)

    def get_can_vote(self, obj):
        me = self.context.get("request") and self.context["request"].user
        return bool(me and me.is_authenticated)

    def create(self, validated_data):
        validated_data["author"] = self.context["request"].user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        # Matn yoki sarlavha o'zgarsa, qaror bekor qilinadi
        body_changed = "body" in validated_data and validated_data["body"] != instance.body
        title_changed = "title" in validated_data and validated_data["title"] != instance.title
        if (body_changed or title_changed) and instance.is_decided:
            instance.clear_decision()
        return super().update(instance, validated_data)


class DecisionSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[
        InquiryStatus.APPROVED,
        InquiryStatus.REJECTED,
        InquiryStatus.PENDING,
    ])
    decision_note = serializers.CharField(required=False, allow_blank=True, default="")


class VoteSerializer(serializers.Serializer):
    choice = serializers.ChoiceField(choices=VoteChoice.choices)
