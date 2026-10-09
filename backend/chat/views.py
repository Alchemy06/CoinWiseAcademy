from django.db import transaction
from django.utils import timezone
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ChatMessage, Conversation
from .serializers import (
    ChatRequestSerializer,
    ConversationDetailSerializer,
    ConversationImportRequestSerializer,
    ConversationSummarySerializer
)
from .services import generate_chat_reply, has_openai_api_key


def _derive_conversation_title(messages: list[str], fallback: str = "New Chat") -> str:
    # Derive titles from user phrasing so imported/remote threads read naturally in the history menu.
    for content in messages:
        compact = " ".join(content.split()).strip()
        if not compact:
            continue
        cleaned = compact.strip(" .,!?:;")
        if not cleaned:
            continue
        if len(cleaned) <= 60:
            return cleaned
        return f"{cleaned[:57].rstrip()}..."
    return fallback


def _get_or_create_conversation(*, request, payload: dict) -> Conversation | None:
    if not request.user.is_authenticated:
        # Anonymous chat stays stateless; local browser storage remains the source of truth until login.
        return None

    conversation_id = (payload.get("conversation_id") or payload.get("session_id") or "").strip()
    if not conversation_id:
        # Without a stable id there is nowhere safe to persist the turn pair, so fall back to stateless behavior.
        return None
    defaults = {
        "title": "New Chat",
        "summary": payload.get("summary", ""),
        "user": request.user,
        "guest_id": ""
    }

    # Reuse the client-generated id so guest/local and authenticated/server history stay aligned after login.
    conversation, created = Conversation.objects.get_or_create(id=conversation_id, defaults=defaults)

    if request.user.is_authenticated and conversation.user_id not in {None, request.user.id}:
        # Prevent one authenticated user from claiming or mutating another user's conversation id.
        raise PermissionError("Conversation does not belong to the current user.")

    if request.user.is_authenticated and conversation.user_id != request.user.id:
        # Freshly adopted guest conversations are rebound to the new user and no longer need their guest marker.
        conversation.user = request.user
        conversation.guest_id = ""
        conversation.save(update_fields=["user", "guest_id", "updated_at"])

    if created and payload.get("summary"):
        # Preserve any client-carried summary when the first persisted turn begins from an already-compressed thread.
        conversation.summary = payload["summary"]
        conversation.save(update_fields=["summary", "updated_at"])

    return conversation


class ChatAPIView(APIView):
    parser_classes = [JSONParser]
    # Session auth is optional here: guests may still post, but signed-in users gain persistence automatically.
    authentication_classes = [SessionAuthentication]
    permission_classes = []

    def post(self, request):
        # Validate before any model or OpenAI work so malformed payloads fail cheaply.
        serializer = ChatRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        if not has_openai_api_key():
            return Response(
                {"detail": "OPENAI_API_KEY is missing on the server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        payload = serializer.validated_data
        try:
            conversation = _get_or_create_conversation(request=request, payload=payload)
        except PermissionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)

        try:
            result = generate_chat_reply(
                messages=payload.get("messages", []),
                summary=payload.get("summary", ""),
                user_input=payload["user_input"],
                web_search_enabled=payload.get("web_search_enabled")
            )
        except FileNotFoundError:
            # Missing prompt files indicate broken deployment state rather than user input problems.
            return Response(
                {"detail": "Prompt file was not found on the server."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as exc:  # noqa: BLE001
            # Normalize all generation failures into one stable response shape for the widget.
            return Response(
                {"detail": f"Failed to get AI response: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY
            )

        if conversation is not None:
            with transaction.atomic():
                # Persist the user/assistant pair atomically so reopened history never contains half a turn.
                ChatMessage.objects.create(
                    conversation=conversation,
                    role="user",
                    content=payload["user_input"]
                )
                ChatMessage.objects.create(
                    conversation=conversation,
                    role="assistant",
                    content=result.assistant_message
                )
                recent_user_inputs = [
                    *(message["content"] for message in payload.get("messages", []) if message["role"] == "user"),
                    payload["user_input"]
                ]
                # Refresh title, summary, and recency together so history ordering stays consistent after each send.
                conversation.title = _derive_conversation_title(recent_user_inputs, conversation.title)
                conversation.summary = result.updated_summary
                conversation.last_message_at = timezone.now()
                conversation.save(update_fields=["title", "summary", "last_message_at", "updated_at"])

        return Response(
            {
                "assistant_message": result.assistant_message,
                "usage": result.usage,
                "updated_summary": result.updated_summary,
                "sources": result.sources,
                "conversation": ConversationDetailSerializer(conversation).data if conversation is not None else None
            },
            status=status.HTTP_200_OK
        )


class ConversationListAPIView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Prefetch messages so opening the first returned conversation can reuse the queryset cache if needed later.
        conversations = Conversation.objects.filter(user=request.user).prefetch_related("messages")
        return Response(ConversationSummarySerializer(conversations, many=True).data, status=status.HTTP_200_OK)

    def delete(self, request):
        # Bulk delete supports the widget's "clear history" action without issuing one request per conversation.
        Conversation.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConversationDetailAPIView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get_object(self, request, conversation_id: str) -> Conversation:
        # Scope every lookup by user to make object ownership enforcement impossible to forget in handlers below.
        return Conversation.objects.prefetch_related("messages").get(id=conversation_id, user=request.user)

    def get(self, request, conversation_id: str):
        try:
            conversation = self.get_object(request, conversation_id)
        except Conversation.DoesNotExist:
            return Response({"detail": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)

        return Response(ConversationDetailSerializer(conversation).data, status=status.HTTP_200_OK)

    def patch(self, request, conversation_id: str):
        try:
            conversation = self.get_object(request, conversation_id)
        except Conversation.DoesNotExist:
            return Response({"detail": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)

        title = str(request.data.get("title", "")).strip()
        if not title:
            return Response({"detail": "Title is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Hard-cap title length here so auto-generated and user-edited titles share the same storage constraint.
        conversation.title = title[:120]
        conversation.save(update_fields=["title", "updated_at"])
        return Response(ConversationDetailSerializer(conversation).data, status=status.HTTP_200_OK)

    def delete(self, request, conversation_id: str):
        deleted, _ = Conversation.objects.filter(id=conversation_id, user=request.user).delete()
        if not deleted:
            return Response({"detail": "Conversation not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ConversationImportAPIView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # Import validates the full batch first so one malformed guest session does not partially migrate history.
        serializer = ConversationImportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        imported_ids: list[str] = []

        for payload in serializer.validated_data.get("conversations", []):
            conversation_id = payload["id"]
            if Conversation.objects.filter(id=conversation_id, user=request.user).exists():
                # Skip already-imported ids so repeated post-login sync calls remain harmless.
                continue

            if Conversation.objects.filter(id=conversation_id).exclude(user=request.user).exists():
                # Refuse to import ids that already belong to someone else instead of silently hijacking them.
                continue

            with transaction.atomic():
                # Create the conversation and its transcript together so imported history never appears partially written.
                conversation = Conversation.objects.create(
                    id=conversation_id,
                    user=request.user,
                    title=str(payload.get("title", "New Chat")).strip()[:120] or "New Chat",
                    summary=payload.get("summary", "")
                )
                ChatMessage.objects.bulk_create(
                    [
                        ChatMessage(
                            conversation=conversation,
                            role=message["role"],
                            content=message["content"]
                        )
                        for message in payload.get("messages", [])
                    ]
                )
                imported_ids.append(conversation.id)

        return Response({"imported_ids": imported_ids}, status=status.HTTP_200_OK)
