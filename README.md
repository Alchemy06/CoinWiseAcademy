# Crypto or No Crypto

## Project structure

- `frontend/` React app and chat UI
- `backend/` Django/DRF API proxy
- `backend/chat/prompts/system_prompt.txt` system prompt source of truth

## System Prompt Policy

- Do not modify `backend/chat/prompts/system_prompt.txt` and `backend/quizzes/prompts/quiz_feedback_prompt.txt`.
- These prompts were tuned and validated in OpenAI Playground and is the best-fit prompt for current project requirements.

## Prerequisites

- Node.js 20+
- Python 3.11+

## Setup

### 1) API key

Create `.env` in repo root (already supported by backend settings):

```env
OPENAI_API_KEY=your_openai_api_key_here
CHAT_ENABLE_WEB_SEARCH=1
QUIZ_GENERATION_MODEL=gpt-5-mini
QUIZ_GENERATION_MAX_OUTPUT_TOKENS=4200
QUIZ_GENERATION_REASONING_EFFORT=low
```

`CHAT_ENABLE_WEB_SEARCH=1` enables OpenAI's built-in web search tool for the chat backend. Set it to `0` to disable web access. Web-enabled replies may incur additional tool-call cost.
`QUIZ_GENERATION_MODEL` only affects offline quiz catalog regeneration, not runtime quiz attempts.

## Shared Quiz Catalog

- Runtime quiz requests never call OpenAI.
- Local HTTP requests also cannot regenerate quiz content.
- New environments can bootstrap from the repository snapshot file at `backend/quizzes/data/published_catalog.json`.
- Team members should not run local quiz regeneration commands or overwrite the shared catalog snapshot.
- Team members should only reuse the published quiz snapshot and consume it through the normal quiz/catalog APIs.

If a local database is empty and you want to seed it from the repository snapshot immediately, run:

```bash
cd backend
source .venv/bin/activate
python manage.py import_static_catalog
```

After that, every environment should continue consuming the published quiz snapshot instead of regenerating quiz content locally.

### 2) Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

### 3) Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://127.0.0.1:5173` and proxies `/api/*` to Django on `http://127.0.0.1:8000`, so browser requests stay same-origin in local development.

### 4) Reverse proxy deployment

In deployment, prefer serving the SPA and Django API from one public origin. Leave `VITE_API_BASE_URL` unset so the frontend keeps calling `/api/*` on the current host.

Example `Caddyfile`:

```caddy
your-domain.example {
    handle /api/* {
        reverse_proxy 127.0.0.1:8000
    }

    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
```

If you deploy with a public domain, add it to Django's allowed hosts and trusted origins:

```env
DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost,your-domain.example
CORS_ALLOWED_ORIGINS=https://your-domain.example
```

## Tests

### Backend tests

```bash
cd backend
source .venv/bin/activate
python manage.py test
```

To run the quiz-specific backend regression suite:

```bash
cd backend
source .venv/bin/activate
python manage.py test quizzes.tests
```

### Frontend tests

```bash
cd frontend
npm test
```

## GitLab CI

- `.gitlab-ci.yml` runs on merge requests and branch pushes.
- Frontend pipelines install dependencies, run `npm test`, and run `npm run build`.
- Backend pipelines install dependencies, run `python manage.py check`, verify migrations are committed with `makemigrations --check --dry-run`, and run `python manage.py test`.

If you want GitLab to block unsafe merges, set these jobs as required status checks in your branch protection / merge request settings.
