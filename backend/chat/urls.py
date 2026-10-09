from django.urls import path

from .views import ChatAPIView, ConversationDetailAPIView, ConversationImportAPIView, ConversationListAPIView

# Keep the chat surface compact while still separating send, list, detail, and import responsibilities cleanly.
urlpatterns = [
    path("ai/chat", ChatAPIView.as_view(), name="chat-api"),
    path("ai/chat/", ChatAPIView.as_view(), name="chat-api-trailing"),
    # History routes sit under /me because they are always scoped to the authenticated session owner.
    path("me/conversations", ConversationListAPIView.as_view(), name="conversation-list"),
    path("me/conversations/", ConversationListAPIView.as_view(), name="conversation-list-trailing"),
    path("me/conversations/import", ConversationImportAPIView.as_view(), name="conversation-import"),
    path("me/conversations/import/", ConversationImportAPIView.as_view(), name="conversation-import-trailing"),
    path("me/conversations/<str:conversation_id>", ConversationDetailAPIView.as_view(), name="conversation-detail"),
    path("me/conversations/<str:conversation_id>/", ConversationDetailAPIView.as_view(), name="conversation-detail-trailing"),
]
