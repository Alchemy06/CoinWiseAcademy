from __future__ import annotations

# Keep backend and frontend default locale aligned so unsupported requests fall back predictably.
DEFAULT_LOCALE = "en-GB"
# Only locales with checked-in catalogs and prompt assets should resolve here.
SUPPORTED_LOCALES = {"en-GB", "zh-CN"}


def resolve_request_locale(request) -> str:
    # Treat any Simplified Chinese preference as zh-CN; everything else uses the shared English default.
    header = (request.headers.get("Accept-Language") or "").lower()
    if "zh-cn" in header or "zh" in header:
        return "zh-CN"
    return DEFAULT_LOCALE
