#!/usr/bin/env python
"""Django command-line entrypoint.

Common usage:
- python manage.py runserver
- python manage.py test
- python manage.py migrate
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()

def main() -> None:
    # Ensure Django knows which settings module to load for every command.
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError("Couldn't import Django.") from exc
    # Forward raw CLI arguments to Django's command dispatcher.
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
