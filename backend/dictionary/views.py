from rest_framework.response import Response
from rest_framework.decorators import api_view
from django.db.models import Q
from rapidfuzz import fuzz
from .models import DictionaryEntry


def smart_search(query):
    base = list(DictionaryEntry.objects.filter(
        Q(term__icontains=query)
    ))

    if not base:
        entries = DictionaryEntry.objects.all()
        scored = []
        for entry in entries:
            score = fuzz.ratio(query.lower(), entry.term.lower())
            if score > 60:
                scored.append((score, entry))

        scored.sort(reverse=True, key=lambda x: x[0])
        base = [entry for score, entry in scored]

    return base


@api_view(["GET"])
def search_term(request, term):
    results = smart_search(term)

    if not results:
        return Response({"error": "Term not found"}, status=404)

    return Response([
        {"term": entry.term, "definition": entry.definition}
        for entry in results
    ])


# old strict implementation, kept for reference and backup in case we want to revert to it later. The new fuzzy search is more user-friendly but could have unforseen issues, we want to keep something we know works as a fallback.
# @api_view(["GET"])
# def search_term(request, term):
#     try:
#         entry = DictionaryEntry.objects.get(term__iexact=term)
#         return Response({"term": entry.term, "definition": entry.definition})
#     except DictionaryEntry.DoesNotExist:
#         return Response({"error": "Term not found"}, status=404)
