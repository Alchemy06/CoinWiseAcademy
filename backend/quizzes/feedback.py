from __future__ import annotations

from pathlib import Path
import os
import re

from openai import OpenAI

from .localization import get_localized_option_text, get_localized_question_copy, get_localized_quiz_copy
from .models import QuizAttempt
from .sanitize import sanitize_display_text

DEFAULT_QUIZ_FEEDBACK_MODEL = os.getenv("QUIZ_FEEDBACK_MODEL", os.getenv("CHAT_MODEL", "gpt-5-mini")).strip() or "gpt-5-mini"
DEFAULT_QUIZ_FEEDBACK_MAX_OUTPUT_TOKENS = int(os.getenv("QUIZ_FEEDBACK_MAX_OUTPUT_TOKENS", "520"))
DEFAULT_QUIZ_FEEDBACK_REASONING_EFFORT = os.getenv(
    "QUIZ_FEEDBACK_REASONING_EFFORT",
    os.getenv("CHAT_REASONING_EFFORT", "low")
).strip().lower()
DEFAULT_QUIZ_FEEDBACK_TEXT_VERBOSITY = os.getenv(
    "QUIZ_FEEDBACK_TEXT_VERBOSITY",
    os.getenv("CHAT_TEXT_VERBOSITY", "low")
).strip().lower()
# Cache prompt text alongside file timestamps so prompt tweaks reload without restarting the backend process.
_PROMPT_CACHE: dict[Path, tuple[int, str]] = {}


def has_quiz_feedback_api_key() -> bool:
    # Reuse the same deployment credential as the main chat feature.
    return bool(os.getenv("OPENAI_API_KEY"))


def _repo_root() -> Path:
    # Resolve repository root from backend/quizzes/feedback.py location.
    return Path(__file__).resolve().parents[2]


def _prompt_path(locale: str = "en-GB") -> Path:
    # Keep the prompt externalized as text so product copy can evolve without touching Python logic.
    prompts_dir = _repo_root() / "backend" / "quizzes" / "prompts"
    localized_path = prompts_dir / f"quiz_feedback_prompt.{locale}.txt"
    if locale != "en-GB" and localized_path.exists():
        return localized_path
    return prompts_dir / "quiz_feedback_prompt.txt"


def load_quiz_feedback_prompt_text(locale: str = "en-GB") -> str:
    # Cache the prompt contents until the file changes so repeated requests avoid extra disk reads.
    path = _prompt_path(locale)
    mtime_ns = path.stat().st_mtime_ns

    cached = _PROMPT_CACHE.get(path)
    if cached and cached[0] == mtime_ns:
        return cached[1]

    prompt_text = path.read_text(encoding="utf-8")
    _PROMPT_CACHE[path] = (mtime_ns, prompt_text)
    return prompt_text


def _feedback_strings(locale: str) -> dict[str, str]:
    # Centralize learner-facing headings and fallback phrases so markdown assembly stays locale-aware without branching everywhere.
    if locale == "zh-CN":
        return {
            "no_explanation": "未提供解析。",
            "review_correct": "请回顾本题的正确概念",
            "review_main_concepts": "请强化你答错题目背后的核心概念。",
            "review_answers": "回顾正确答案，并把关键概念记得更短、更具体。",
            "heading_weak_points": "需要强化的薄弱点",
            "heading_memory_cues": "快速记忆提示",
            "heading_question_review": "逐题回顾",
            "result_prefix": "你的结果是",
            "your_answer": "你的答案",
            "correct_answer": "正确答案",
            "explanation": "解析",
            "for_question_remember": "对于“{question}”，请记住：{explanation}",
            "reinforce_idea": "强化这个概念：{explanation}",
            "quiz_title": "测验标题",
            "score": "得分",
            "pass_mark": "及格线",
            "passed_yes": "是",
            "passed_no": "否",
            "passed": "是否通过",
            "incorrect_section": "答错或未作答的题目：",
            "all_topics": "所有测验主题（用于记忆提示）：",
            "perfect_score": "学习者本次全部答对。",
            "all_topics_reinforcement": "所有测验主题（用于强化与记忆提示）：",
            "question_label": "问题",
            "learner_answer": "学习者答案",
            "no_answer_selected": "未选择答案",
            "no_correct_answer": "暂无正确答案",
        }
    return {
        "no_explanation": "No explanation provided.",
        "review_correct": "Review the correct concept for this question",
        "review_main_concepts": "Reinforce the main concepts behind the questions you missed.",
        "review_answers": "Review the correct answers and keep the key concepts short and concrete.",
        "heading_weak_points": "Weak points to reinforce",
        "heading_memory_cues": "Quick memory cues",
        "heading_question_review": "Question review",
        "result_prefix": "Your result is",
        "your_answer": "Your answer",
        "correct_answer": "Correct answer",
        "explanation": "Explanation",
        "for_question_remember": "For '{question}', remember: {explanation}",
        "reinforce_idea": "Reinforce this idea: {explanation}",
        "quiz_title": "Quiz title",
        "score": "Score",
        "pass_mark": "Pass mark",
        "passed_yes": "Yes",
        "passed_no": "No",
        "passed": "Passed",
        "incorrect_section": "Questions answered incorrectly or left unanswered:",
        "all_topics": "All quiz topics for memory cues:",
        "perfect_score": "The learner answered every question correctly.",
        "all_topics_reinforcement": "All quiz topics for reinforcement and memory cues:",
        "question_label": "Question",
        "learner_answer": "Learner answer",
        "no_answer_selected": "No answer selected",
        "no_correct_answer": "No correct answer available",
    }


def _localized_question_text(question, locale: str) -> str:
    # Prefer translated stems when present, then sanitize the fallback source text before it reaches prompts or markdown.
    localized_copy = get_localized_question_copy(locale, question.external_id) or {}
    return sanitize_display_text(localized_copy.get("text") or question.text)


def _localized_question_explanation(question, locale: str) -> str:
    # Explanations pass through the same normalization path so imported distractor notes do not leak into feedback copy.
    localized_copy = get_localized_question_copy(locale, question.external_id) or {}
    return _normalize_question_explanation(localized_copy.get("explanation") or question.explanation, locale=locale)


def _localized_option_text(option, locale: str) -> str:
    # Missing correct options should still yield deterministic copy for fallback summaries and review sections.
    if option is None:
        return _feedback_strings(locale)["no_correct_answer"]
    return sanitize_display_text(get_localized_option_text(locale, option.external_id) or option.text)


def _extract_output_text(response: object) -> str:
    # Prefer the typed shortcut first, then fall back to iterating raw output items for compatibility.
    text = getattr(response, "output_text", None)
    if isinstance(text, str) and text.strip():
        return text.strip()

    output_items = getattr(response, "output", None)
    if not isinstance(output_items, list):
        return ""

    parts: list[str] = []
    for item in output_items:
        content_items = getattr(item, "content", None)
        if not isinstance(content_items, list):
            continue
        for content_item in content_items:
            maybe_text = getattr(content_item, "text", None)
            if isinstance(maybe_text, str) and maybe_text.strip():
                parts.append(maybe_text.strip())

    return "\n".join(parts).strip()


def _clean_generated_feedback(text: str) -> str:
    # Remove any divider lines if the model emits them despite the prompt instructions.
    cleaned = re.sub(r"^\s*[-*_]{3,}\s*$", "", text, flags=re.MULTILINE)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _extract_bullets_for_heading(text: str, heading: str) -> list[str]:
    # Validate section completeness structurally so fallback logic does not depend on the model's exact prose.
    pattern = re.compile(
        rf"^##\s+{re.escape(heading)}\s*$([\s\S]*?)(?=^##\s+|\Z)",
        flags=re.MULTILINE
    )
    match = pattern.search(text)
    if not match:
        return []

    section_body = match.group(1)
    bullets = []
    for line in section_body.splitlines():
        stripped = line.strip()
        if stripped.startswith("- "):
            bullets.append(stripped[2:].strip())
    return [bullet for bullet in bullets if bullet]


def _target_bullet_counts(*, wrong_count: int) -> tuple[int, int]:
    # Scale minimum coverage with quiz difficulty signals so weak performance produces denser revision guidance.
    if wrong_count <= 0:
        return (2, 3)
    if wrong_count <= 2:
        return (2, 3)
    if wrong_count <= 4:
        return (3, 4)
    if wrong_count <= 6:
        return (4, 5)
    return (5, 6)


def _has_complete_insight_sections(text: str, *, wrong_count: int, locale: str = "en-GB") -> bool:
    # Require both sections to meet the dynamic bullet floor before trusting the model output as complete.
    copy = _feedback_strings(locale)
    weak_points = _extract_bullets_for_heading(text, copy["heading_weak_points"])
    memory_cues = _extract_bullets_for_heading(text, copy["heading_memory_cues"])
    target_weak_points, target_memory_cues = _target_bullet_counts(wrong_count=wrong_count)
    return len(weak_points) >= target_weak_points and len(memory_cues) >= target_memory_cues


def _is_unsupported_tuning_error(exc: Exception) -> bool:
    # Some deployed model variants reject reasoning/text tuning fields, so detect only those compatibility failures.
    message = str(exc).lower()
    return (
        "unknown parameter" in message
        or "unsupported parameter" in message
        or "extra inputs are not permitted" in message
        or "invalid field" in message
    )


def _create_feedback_response(client: OpenAI, *, input_text: str, locale: str) -> object:
    # Build one canonical Responses API payload so tuning knobs stay centralized for quiz feedback traffic.
    request: dict[str, object] = {
        "model": DEFAULT_QUIZ_FEEDBACK_MODEL,
        "instructions": load_quiz_feedback_prompt_text(locale),
        "input": input_text,
        "max_output_tokens": DEFAULT_QUIZ_FEEDBACK_MAX_OUTPUT_TOKENS,
    }

    if DEFAULT_QUIZ_FEEDBACK_REASONING_EFFORT:
        request["reasoning"] = {"effort": DEFAULT_QUIZ_FEEDBACK_REASONING_EFFORT}
    if DEFAULT_QUIZ_FEEDBACK_TEXT_VERBOSITY:
        request["text"] = {"verbosity": DEFAULT_QUIZ_FEEDBACK_TEXT_VERBOSITY}

    try:
        return client.responses.create(**request)
    except Exception as exc:  # noqa: BLE001
        if not _is_unsupported_tuning_error(exc):
            raise
        # Retry once without optional tuning fields to preserve compatibility with stricter model backends.
        request.pop("reasoning", None)
        request.pop("text", None)
        return client.responses.create(**request)


def _get_attempt_questions(attempt: QuizAttempt) -> list:
    # Always review questions in quiz order so the markdown summary matches the learner's original progression.
    quiz = attempt.quiz
    questions = [question for question in quiz.questions.all() if question.is_active]
    questions.sort(key=lambda question: question.id)
    return questions


def _format_score(value: float | int) -> str:
    # Avoid showing whole-number scores as floats in learner-facing copy.
    return str(int(value)) if float(value).is_integer() else str(value)


def _normalize_question_explanation(raw_text: str, *, locale: str = "en-GB") -> str:
    # Imported explanations may contain distractor-specific notes, so keep only the canonical "correct" teaching point.
    cleaned = sanitize_display_text(raw_text).strip()
    if not cleaned:
        return _feedback_strings(locale)["no_explanation"]

    correct_match = re.search(r"Correct:\s*(.*?)(?=\s+Wrong:|$)", cleaned, flags=re.IGNORECASE | re.DOTALL)
    if correct_match:
        compact = " ".join(correct_match.group(1).split()).strip(" .")
        if compact:
            return f"{compact}."

    cleaned = re.sub(r"^\s*Correct:\s*", "", cleaned, flags=re.IGNORECASE)
    return " ".join(cleaned.split())


def _to_memory_cue(correct_answer: str) -> str:
    # Convert the correct answer into a short cue the fallback summary can reuse without extra phrasing logic.
    compact = " ".join(correct_answer.split()).strip().rstrip(".")
    return f"{compact}."


def _build_fallback_insights_markdown(attempt: QuizAttempt, *, locale: str) -> str:
    # Fallback guidance is deterministic so the learner still gets complete revision notes when the model under-delivers.
    copy = _feedback_strings(locale)
    questions = _get_attempt_questions(attempt)
    responses_by_question_id = {
        response.question_id: response
        for response in attempt.responses.all()
    }
    wrong_questions = [question for question in questions if not responses_by_question_id.get(question.id) or not responses_by_question_id[question.id].is_correct]
    target_weak_points, target_memory_cues = _target_bullet_counts(wrong_count=len(wrong_questions))
    weak_points: list[str] = []
    memory_cues: list[str] = []
    seen_weak_points: set[str] = set()
    seen_memory_cues: set[str] = set()

    for question in wrong_questions:
        # Prioritize missed questions first so fallback bullets stay focused on genuine weaknesses.
        response = responses_by_question_id.get(question.id)
        correct_option = next((option for option in question.options.all() if option.is_active and option.is_correct), None)
        correct_option_text = _localized_option_text(correct_option, locale) if correct_option else copy["review_correct"]
        explanation_text = _localized_question_explanation(question, locale)

        weak_point = copy["for_question_remember"].format(
            question=_localized_question_text(question, locale),
            explanation=explanation_text.rstrip("."),
        )
        if weak_point not in seen_weak_points:
            seen_weak_points.add(weak_point)
            weak_points.append(f"- {weak_point}.")

        memory_cue = _to_memory_cue(correct_option_text)
        if memory_cue not in seen_memory_cues:
            seen_memory_cues.add(memory_cue)
            memory_cues.append(f"- {memory_cue}")

    for question in questions:
        if len(weak_points) >= target_weak_points and len(memory_cues) >= target_memory_cues:
            break

        # If the learner missed very little, top up from the whole quiz so both sections still feel intentionally complete.
        correct_option = next((option for option in question.options.all() if option.is_active and option.is_correct), None)
        correct_option_text = _localized_option_text(correct_option, locale) if correct_option else copy["review_correct"]
        explanation_text = _localized_question_explanation(question, locale)

        if len(weak_points) < target_weak_points:
            weak_point = explanation_text.rstrip(".")
            if weak_point and weak_point not in seen_weak_points:
                seen_weak_points.add(weak_point)
                weak_points.append(f"- {copy['reinforce_idea'].format(explanation=weak_point)}.")

        if len(memory_cues) < target_memory_cues:
            memory_cue = _to_memory_cue(correct_option_text)
            if memory_cue not in seen_memory_cues:
                seen_memory_cues.add(memory_cue)
                memory_cues.append(f"- {memory_cue}")

    if not weak_points:
        weak_points.append(f"- {copy['review_main_concepts']}")

    if not memory_cues:
        memory_cues.append(f"- {copy['review_answers']}")

    return "\n".join(
        [
            f"## {copy['heading_weak_points']}",
            *weak_points[:target_weak_points],
            "",
            f"## {copy['heading_memory_cues']}",
            *memory_cues[:target_memory_cues],
        ]
    ).strip()


def _build_question_review_markdown(attempt: QuizAttempt, *, locale: str) -> str:
    # Compose the fixed per-question review separately so the model only needs to generate the high-level insight sections.
    copy = _feedback_strings(locale)
    questions = _get_attempt_questions(attempt)
    responses_by_question_id = {
        response.question_id: response
        for response in attempt.responses.all()
    }
    score = _format_score(attempt.total_score)
    max_score = sum(question.marks for question in questions)
    lines = [
        f"{copy['result_prefix']} **{score}/{max_score}**.",
        "",
        f"## {copy['heading_question_review']}",
    ]

    for index, question in enumerate(questions, start=1):
        # Each item mirrors the learner answer, authoritative correct answer, and explanation in one predictable block.
        response = responses_by_question_id.get(question.id)
        correct_option = next((option for option in question.options.all() if option.is_active and option.is_correct), None)
        selected_option_text = _localized_option_text(response.selected_option, locale) if response and response.selected_option else copy["no_answer_selected"]
        correct_option_text = _localized_option_text(correct_option, locale) if correct_option else copy["no_correct_answer"]
        explanation_text = _localized_question_explanation(question, locale)
        result_marker = "✅" if response and response.is_correct else "❌"
        lines.extend(
            [
                "",
                f"### {index}. {_localized_question_text(question, locale)}",
                "",
                f"{copy['your_answer']}: {selected_option_text} {result_marker}",
                "",
                f"{copy['correct_answer']}: {correct_option_text}",
                "",
                f"{copy['explanation']}: {explanation_text}",
            ]
        )

    return "\n".join(lines)


def _build_insights_input(attempt: QuizAttempt, *, locale: str) -> str:
    # Feed the model only the quiz-wide context it needs for synthesis, leaving exact review rendering to local code.
    copy = _feedback_strings(locale)
    quiz = attempt.quiz
    questions = _get_attempt_questions(attempt)
    responses_by_question_id = {
        response.question_id: response
        for response in attempt.responses.all()
    }
    max_score = sum(question.marks for question in questions)
    incorrect_items: list[str] = []
    all_topics: list[str] = []

    for index, question in enumerate(questions, start=1):
        response = responses_by_question_id.get(question.id)
        correct_option = next((option for option in question.options.all() if option.is_active and option.is_correct), None)
        correct_option_text = _localized_option_text(correct_option, locale) if correct_option else copy["no_correct_answer"]
        explanation_text = _localized_question_explanation(question, locale)
        # Include every topic so the model can produce reinforcement cues even for perfect scores.
        all_topics.append(f"- Q{index}: {_localized_question_text(question, locale)} -> {correct_option_text}")

        if response and response.is_correct:
            continue

        # Missed questions are expanded into explicit learner/correct/explanation triples for grounded remediation.
        selected_option_text = _localized_option_text(response.selected_option, locale) if response and response.selected_option else copy["no_answer_selected"]
        incorrect_items.extend(
            [
                f"- {copy['question_label']} {index}: {_localized_question_text(question, locale)}",
                f"  {copy['learner_answer']}: {selected_option_text}",
                f"  {copy['correct_answer']}: {correct_option_text}",
                f"  {copy['explanation']}: {explanation_text}",
            ]
        )

    localized_quiz_copy = get_localized_quiz_copy(locale, quiz.external_id) or {}
    lines = [
        f"{copy['quiz_title']}: {sanitize_display_text(localized_quiz_copy.get('title') or quiz.title)}",
        f"{copy['score']}: {_format_score(attempt.total_score)}/{max_score}",
        f"{copy['pass_mark']}: {quiz.pass_mark}/{max_score}",
        f"{copy['passed']}: {copy['passed_yes'] if attempt.total_score >= quiz.pass_mark else copy['passed_no']}",
        "",
    ]

    if incorrect_items:
        lines.extend(
            [
                copy["incorrect_section"],
                *incorrect_items,
                "",
                copy["all_topics"],
                *all_topics,
            ]
        )
    else:
        lines.extend(
            [
                copy["perfect_score"],
                "",
                copy["all_topics_reinforcement"],
                *all_topics,
            ]
        )

    return "\n".join(lines)


def generate_quiz_feedback(attempt: QuizAttempt, *, locale: str = "en-GB") -> str:
    # Re-check credentials here so direct service calls from tests or future tasks cannot skip configuration validation.
    if not has_quiz_feedback_api_key():
        raise RuntimeError("OPENAI_API_KEY is missing.")

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = _create_feedback_response(client, input_text=_build_insights_input(attempt, locale=locale), locale=locale)
    insights_markdown = _clean_generated_feedback(_extract_output_text(response))
    # Count only incorrect recorded responses here; unanswered items are already represented in the prompt context.
    wrong_count = sum(
        1
        for response_row in attempt.responses.all()
        if not response_row.is_correct
    )

    # Fall back whenever the model omits a required section or returns an obviously too-thin summary.
    if not insights_markdown or not _has_complete_insight_sections(insights_markdown, wrong_count=wrong_count, locale=locale):
        insights_markdown = _build_fallback_insights_markdown(attempt, locale=locale)

    return f"{_build_question_review_markdown(attempt, locale=locale)}\n\n{insights_markdown}".strip()
