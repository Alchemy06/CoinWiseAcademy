from rest_framework import serializers
from .models import ChatMessage, Conversation


class ChatMessageSerializer(serializers.Serializer):
    # Validate each historical turn so service code only sees known role/content combinations.
    id = serializers.CharField(required=False, allow_blank=True)
    # Restrict roles here so later prompt assembly can safely branch on only user or assistant.
    role = serializers.ChoiceField(choices=["user", "assistant"])
    # Keep content free-form because formatting decisions belong to prompt/model logic.
    content = serializers.CharField()
    # createdAt is optional because the backend does not need UI timestamps to answer correctly.
    createdAt = serializers.CharField(required=False, allow_blank=True)


class ChatRequestSerializer(serializers.Serializer):
    # Validate the full stateless payload because the backend does not persist per-session chat rows.
    session_id = serializers.CharField()
    # messages carries recent verbatim turns so the model still sees the latest conversational texture.
    messages = ChatMessageSerializer(many=True, required=False, default=list)
    # summary carries compressed long-term memory returned by earlier backend generations.
    summary = serializers.CharField(required=False, allow_blank=True, default="")
    # user_input is the newest turn and is appended after history when the prompt is assembled.
    user_input = serializers.CharField()
    # conversation_id is used for authenticated persistence and guest-to-user migration continuity.
    conversation_id = serializers.CharField(required=False, allow_blank=True)
    # guest_id lets anonymous users carry a stable identity before they register or log in.
    guest_id = serializers.CharField(required=False, allow_blank=True)
    # web_search_enabled stays optional so older clients still inherit the backend default behavior.
    web_search_enabled = serializers.BooleanField(required=False)


class PersistedChatMessageSerializer(serializers.ModelSerializer):
    # Map Django field names back to the frontend's camelCase message contract.
    createdAt = serializers.DateTimeField(source="created_at")

    class Meta:
        model = ChatMessage
        fields = ["id", "role", "content", "createdAt"]


class ConversationImportSerializer(serializers.Serializer):
    # Import accepts the same stable conversation fields the browser already persists locally.
    id = serializers.CharField()
    title = serializers.CharField()
    summary = serializers.CharField(required=False, allow_blank=True, default="")
    messages = ChatMessageSerializer(many=True, required=False, default=list)
    createdAt = serializers.CharField(required=False, allow_blank=True)
    updatedAt = serializers.CharField(required=False, allow_blank=True)


class ConversationImportRequestSerializer(serializers.Serializer):
    # Bulk import lets a post-login sync migrate multiple guest-local threads in one request.
    conversations = ConversationImportSerializer(many=True, required=False, default=list)


class ConversationSummarySerializer(serializers.ModelSerializer):
    # Summary responses intentionally omit messages so the history list stays lightweight.
    createdAt = serializers.DateTimeField(source="created_at")
    updatedAt = serializers.DateTimeField(source="updated_at")

    class Meta:
        model = Conversation
        fields = ["id", "title", "summary", "createdAt", "updatedAt"]


class ConversationDetailSerializer(serializers.ModelSerializer):
    # Detail responses add the ordered transcript needed to reopen one specific conversation.
    createdAt = serializers.DateTimeField(source="created_at")
    updatedAt = serializers.DateTimeField(source="updated_at")
    messages = PersistedChatMessageSerializer(many=True, read_only=True)

    class Meta:
        model = Conversation
        fields = ["id", "title", "summary", "createdAt", "updatedAt", "messages"]
