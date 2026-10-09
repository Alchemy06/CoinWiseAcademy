from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from .models import ChatMessage, Conversation
from .services import ChatGenerationResult, _compact_web_links, _create_response, generate_chat_reply, load_system_prompt_bytes, prepare_context


class PromptLoadingTests(TestCase):
    # Prompt loading tests guard the repo-tracked system prompt contract.
    def test_system_prompt_is_loaded_verbatim(self) -> None:
        # Guardrail: backend should use exactly the same prompt file tracked in repo.
        repo_prompt = (Path(__file__).resolve().parent / "prompts" / "system_prompt.txt").read_bytes()
        loaded_prompt = load_system_prompt_bytes()
        self.assertEqual(loaded_prompt, repo_prompt)


class ChatApiTests(TestCase):
    # API tests cover request validation and the normalized frontend response contract.
    def setUp(self) -> None:
        self.client = APIClient()

    def test_returns_503_when_api_key_is_missing(self) -> None:
        # API should surface infra misconfiguration explicitly to frontend.
        payload = {
            "session_id": "session_1",
            "messages": [],
            "summary": "",
            "user_input": "What is blockchain?",
            "web_search_enabled": True
        }

        with patch("chat.views.has_openai_api_key", return_value=False):
            response = self.client.post("/api/ai/chat", payload, format="json")

        self.assertEqual(response.status_code, 503)
        self.assertIn("OPENAI_API_KEY", response.json()["detail"])

    def test_returns_assistant_message_on_success(self) -> None:
        # Verify response contract expected by frontend store/update flow.
        payload = {
            "session_id": "session_2",
            "messages": [{"role": "user", "content": "Explain blockchain."}],
            "summary": "",
            "user_input": "And what is a wallet?",
            "web_search_enabled": False
        }

        mocked_result = ChatGenerationResult(
            assistant_message="A wallet stores the keys that control your crypto assets.",
            usage={"total_tokens": 123},
            updated_summary="User asked about blockchain and wallets.",
            sources=[{"title": "OpenAI Docs", "url": "https://developers.openai.com"}]
        )

        with (
            patch("chat.views.has_openai_api_key", return_value=True),
            patch("chat.views.generate_chat_reply", return_value=mocked_result)
        ):
            response = self.client.post("/api/ai/chat", payload, format="json")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["assistant_message"], mocked_result.assistant_message)
        self.assertEqual(body["updated_summary"], mocked_result.updated_summary)
        self.assertEqual(body["sources"], mocked_result.sources)

    def test_guest_chat_stays_stateless(self) -> None:
        # Anonymous sends should still work, but must not create persisted Conversation rows on the server.
        payload = {
            "session_id": "session_guest",
            "guest_id": "guest_abc",
            "messages": [],
            "summary": "",
            "user_input": "What is a wallet?",
            "web_search_enabled": False
        }

        mocked_result = ChatGenerationResult(
            assistant_message="A wallet stores keys.",
            usage={},
            updated_summary="Wallet basics",
            sources=[]
        )

        with (
            patch("chat.views.has_openai_api_key", return_value=True),
            patch("chat.views.generate_chat_reply", return_value=mocked_result)
        ):
            response = self.client.post("/api/ai/chat", payload, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Conversation.objects.filter(id="session_guest").exists())

    def test_lists_only_authenticated_users_conversations(self) -> None:
        # History endpoints must never leak another user's persisted conversations.
        user = User.objects.create_user(username="alice@example.com", email="alice@example.com", password="strong-pass-123")
        other_user = User.objects.create_user(username="bob@example.com", email="bob@example.com", password="strong-pass-123")
        Conversation.objects.create(id="session_a", user=user, title="Alice chat", summary="")
        Conversation.objects.create(id="session_b", user=other_user, title="Bob chat", summary="")
        self.client.force_authenticate(user=user)

        response = self.client.get("/api/me/conversations")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["id"], "session_a")

    def test_imports_local_guest_conversations_for_authenticated_user(self) -> None:
        # Import should recreate the local transcript exactly once for the authenticated owner.
        user = User.objects.create_user(username="alice@example.com", email="alice@example.com", password="strong-pass-123")
        self.client.force_authenticate(user=user)

        response = self.client.post(
            "/api/me/conversations/import",
            {
                "conversations": [
                    {
                        "id": "session_local",
                        "title": "Imported chat",
                        "summary": "Summary",
                        "messages": [
                            {"role": "user", "content": "Hello"},
                            {"role": "assistant", "content": "Hi there"},
                        ]
                    }
                ]
            },
            format="json"
        )

        self.assertEqual(response.status_code, 200)
        conversation = Conversation.objects.get(id="session_local", user=user)
        self.assertEqual(conversation.title, "Imported chat")
        self.assertEqual(conversation.messages.count(), 2)


class ContextCompressionTests(TestCase):
    # Compression tests ensure long history is summarized without dropping recent turns.
    def test_prepare_context_triggers_summary_for_long_history(self) -> None:
        # Small token threshold forces compression path for deterministic testing.
        messages = [
            {"role": "user", "content": "x" * 1200},
            {"role": "assistant", "content": "y" * 1200},
            {"role": "user", "content": "z" * 1200},
            {"role": "assistant", "content": "k" * 1200},
            {"role": "user", "content": "m" * 1200},
            {"role": "assistant", "content": "n" * 1200}
        ]

        with patch("chat.services._summarize_older_messages", return_value="compressed-summary"):
            prepared, summary, compressed = prepare_context(
                messages=messages,
                summary="",
                max_input_tokens=100,
                keep_recent_messages=2
            )

        self.assertTrue(compressed)
        self.assertEqual(summary, "compressed-summary")
        self.assertEqual(len(prepared), 2)


class ResponseRequestTests(TestCase):
    # Request-shape tests keep the OpenAI tool wiring stable across future refactors.
    def test_create_response_enables_web_search_when_configured(self) -> None:
        # Use a lightweight mock client so the test inspects the exact request payload without real API traffic.
        create_call = Mock(return_value=SimpleNamespace(output_text="ok"))
        client = SimpleNamespace(responses=SimpleNamespace(create=create_call))

        with patch("chat.services.DEFAULT_WEB_SEARCH_ENABLED", True):
            _create_response(
                client,
                model="gpt-5-mini",
                model_input=[{"role": "user", "content": "Latest crypto news?"}],
                max_output_tokens=None
            )

        request = create_call.call_args.kwargs
        self.assertEqual(request["tools"], [{"type": "web_search"}])
        self.assertEqual(request["tool_choice"], "auto")
        self.assertEqual(request["include"], ["web_search_call.action.sources"])

    def test_create_response_skips_web_search_when_user_disables_it(self) -> None:
        # Explicit opt-out should remove tool wiring entirely so the model cannot perform live retrieval accidentally.
        create_call = Mock(return_value=SimpleNamespace(output_text="ok"))
        client = SimpleNamespace(responses=SimpleNamespace(create=create_call))

        with patch("chat.services.DEFAULT_WEB_SEARCH_ENABLED", True):
            _create_response(
                client,
                model="gpt-5-mini",
                model_input=[{"role": "user", "content": "Explain Bitcoin basics."}],
                max_output_tokens=None,
                web_search_enabled=False
            )

        request = create_call.call_args.kwargs
        self.assertNotIn("tools", request)
        self.assertNotIn("tool_choice", request)
        self.assertNotIn("include", request)


class SourceExtractionTests(TestCase):
    # Source extraction tests ensure the UI receives clickable references when web search is used.
    def test_compact_web_links_replaces_verbose_inline_urls(self) -> None:
        # Simulate the raw Responses API behavior where the model emits a full URL inline before backend cleanup.
        text = "Current rate is 3.75% (https://www.bankofengland.co.uk/example)."
        start_index = text.index("https://")
        end_index = start_index + len("https://www.bankofengland.co.uk/example")

        response = SimpleNamespace(
            output=[
                SimpleNamespace(
                    type="message",
                    content=[
                        SimpleNamespace(
                            annotations=[
                                SimpleNamespace(
                                    type="url_citation",
                                    url_citation=SimpleNamespace(
                                        title="Bank of England",
                                        url="https://www.bankofengland.co.uk/example",
                                        start_index=start_index,
                                        end_index=end_index
                                    )
                                )
                            ]
                        )
                    ]
                )
            ]
        )

        compacted = _compact_web_links(
            text,
            response,
            [{"title": "Bank of England", "url": "https://www.bankofengland.co.uk/example"}]
        )

        # The cleaned answer should keep only the compact numbered marker because the footer owns the clickable link.
        self.assertEqual(compacted, "Current rate is 3.75% ([1]).")

    def test_generate_chat_reply_returns_deduplicated_web_sources(self) -> None:
        # Include both search-call sources and inline citations so the dedupe logic is exercised across both paths.
        output_text = "Bitcoin moved after a regulatory update (https://www.reuters.com/example)."
        start_index = output_text.index("https://")
        end_index = start_index + len("https://www.reuters.com/example")

        response = SimpleNamespace(
            output_text=output_text,
            output=[
                SimpleNamespace(
                    type="web_search_call",
                    action=SimpleNamespace(
                        sources=[
                            SimpleNamespace(title="Reuters", url="https://www.reuters.com/example"),
                            SimpleNamespace(title="Reuters duplicate", url="https://www.reuters.com/example"),
                        ]
                    )
                ),
                SimpleNamespace(
                    type="message",
                    content=[
                        SimpleNamespace(
                            annotations=[
                                SimpleNamespace(
                                    type="url_citation",
                                    url_citation=SimpleNamespace(
                                        title="Reuters",
                                        url="https://www.reuters.com/example",
                                        start_index=start_index,
                                        end_index=end_index
                                    )
                                ),
                                SimpleNamespace(
                                    type="url_citation",
                                    url_citation=SimpleNamespace(
                                        title="SEC",
                                        url="https://www.sec.gov/example",
                                        start_index=0,
                                        end_index=0
                                    )
                                )
                            ]
                        )
                    ]
                )
            ],
            usage={"total_tokens": 42}
        )

        mocked_client = SimpleNamespace(responses=SimpleNamespace(create=lambda **_: response))

        with (
            patch("chat.services.has_openai_api_key", return_value=True),
            patch("chat.services.load_system_prompt_text", return_value="You are helpful."),
            patch("chat.services.prepare_context", return_value=([], "", False)),
            patch("chat.services.OpenAI", return_value=mocked_client)
        ):
            result = generate_chat_reply(messages=[], summary="", user_input="What happened today?")

        # Assistant text should already be compacted before the API view serializes it to the frontend.
        self.assertEqual(result.assistant_message, "Bitcoin moved after a regulatory update ([1]).")
        self.assertEqual(
            result.sources,
            [
                {"title": "Reuters", "url": "https://www.reuters.com/example"},
                {"title": "SEC", "url": "https://www.sec.gov/example"}
            ]
        )

    def test_generate_chat_reply_forwards_web_search_preference(self) -> None:
        # Service orchestration should pass the client preference through unchanged to the Responses API adapter.
        mocked_client = SimpleNamespace(responses=SimpleNamespace(create=lambda **_: SimpleNamespace(output_text="Answer", output=[])))

        with (
            patch("chat.services.has_openai_api_key", return_value=True),
            patch("chat.services.load_system_prompt_text", return_value="You are helpful."),
            patch("chat.services.prepare_context", return_value=([], "", False)),
            patch("chat.services.OpenAI", return_value=mocked_client),
            patch("chat.services._create_response", return_value=SimpleNamespace(output_text="Answer", output=[])) as create_response
        ):
            generate_chat_reply(messages=[], summary="", user_input="What happened today?", web_search_enabled=False)

        self.assertFalse(create_response.call_args.kwargs["web_search_enabled"])
