from rest_framework import serializers
from .models import DictionaryTerm, Definition

class DefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Definition
        fields = ["part_of_speech", "definition", "example"]

class DictionaryTermSerializer(serializers.ModelSerializer):
    definitions = DefinitionSerializer(many=True)

    class Meta:
        model = DictionaryTerm
        fields = ["word", "phonetic", "definitions"]
