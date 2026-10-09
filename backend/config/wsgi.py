import os
from django.core.wsgi import get_wsgi_application

# WSGI entrypoint for traditional synchronous servers (e.g., gunicorn/uwsgi).
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

application = get_wsgi_application()
