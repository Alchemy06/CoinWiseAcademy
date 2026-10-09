from django.test import TestCase


class CovidCrashSmokeTests(TestCase):
    def test_app_is_importable(self):
        from covid_crash import models, services, views
        self.assertTrue(True)
