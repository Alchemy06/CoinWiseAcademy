
from pathlib import Path
import os


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)

        key = key.strip()
        value = value.strip().strip('"').strip("'")

        os.environ.setdefault(key, value)


def _get_int_env(name: str, default: int) -> int:
    raw_value = os.getenv(name, "").strip()

    if not raw_value:
        return default

    try:
        return int(raw_value)
    except ValueError:
        return default


def _get_bool_env(name: str, default: bool) -> bool:
    raw_value = os.getenv(name, "").strip().lower()

    if not raw_value:
        return default

    return raw_value in {"1", "true", "yes", "on"}


BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent

_load_env_file(REPO_ROOT / ".env")

SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    "dev-only-django-secret-key"
)

DEBUG = os.getenv("DJANGO_DEBUG", "1") == "1"

ALLOWED_HOSTS = [
    "localhost",
    "127.0.0.1",
    "10.2.8.126",
    "10.2.8.126:3000",
    "com2042-la-mesa.csee.surrey.ac.uk",
]
DEFAULT_WEB_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "https://com2042-la-mesa.csee.surrey.ac.uk",
]

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://com2042-la-mesa.csee.surrey.ac.uk",
]

CORS_ALLOWED_ORIGINS = DEFAULT_WEB_ORIGINS

SECURE_PROXY_SSL_HEADER = (
    "HTTP_X_FORWARDED_PROTO",
    "https",
)

CSRF_COOKIE_SECURE = _get_bool_env(
    "CSRF_COOKIE_SECURE",
    not DEBUG,
)

SESSION_COOKIE_SECURE = _get_bool_env(
    "SESSION_COOKIE_SECURE",
    not DEBUG,
)

CORS_URLS_REGEX = r"^/api/.*$"

CORS_ALLOW_CREDENTIALS = True

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "accounts",
    "chat",
    "market",
    "quizzes",
    "covid_crash",
    "predictions",
    "market_replay",
    "mock_trading",
    "dictionary",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

WSGI_APPLICATION = "config.wsgi.application"

ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny"
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication"
    ],
}

QUIZ_CONTENT_API_BASE_URL = os.getenv(
    "QUIZ_CONTENT_API_BASE_URL",
    "",
).strip()

QUIZ_CONTENT_API_TOKEN = os.getenv(
    "QUIZ_CONTENT_API_TOKEN",
    "",
).strip()

QUIZ_CONTENT_SYNC_TTL_SECONDS = _get_int_env(
    "QUIZ_CONTENT_SYNC_TTL_SECONDS",
    21600,
)

QUIZ_CONTENT_REQUEST_TIMEOUT_SECONDS = _get_int_env(
    "QUIZ_CONTENT_REQUEST_TIMEOUT_SECONDS",
    8,
)

GITHUB_CONTENT_API_TOKEN = os.getenv(
    "GITHUB_CONTENT_API_TOKEN",
    "",
).strip()

QUIZ_GENERATION_MODEL = (
    os.getenv("QUIZ_GENERATION_MODEL", "gpt-5-mini").strip()
    or "gpt-5-mini"
)

QUIZ_GENERATION_MAX_OUTPUT_TOKENS = _get_int_env(
    "QUIZ_GENERATION_MAX_OUTPUT_TOKENS",
    4200,
)

QUIZ_GENERATION_REASONING_EFFORT = os.getenv(
    "QUIZ_GENERATION_REASONING_EFFORT",
    "low",
).strip().lower()



# Price update interval (seconds)
MOCK_TRADING_PRICE_UPDATE_INTERVAL = _get_int_env(
    "MOCK_TRADING_PRICE_UPDATE_INTERVAL",
    45,  # Update every 45 seconds
)

# Currency
MOCK_TRADING_PRICE_CURRENCY = os.getenv(
    "MOCK_TRADING_PRICE_CURRENCY",
    "usd",
).strip().lower()