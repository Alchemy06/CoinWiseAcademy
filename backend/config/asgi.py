import os
from django.core.asgi import get_asgi_application

# ASGI entrypoint for async-capable servers (e.g., uvicorn/daphne).
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_asgi_application()
