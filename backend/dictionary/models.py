from django.db import models

class DictionaryEntry(models.Model):
    term = models.CharField(max_length=255, unique=True)
    definition = models.TextField()

    def __str__(self):
        return self.term
