import requests
from bs4 import BeautifulSoup
from .models import DictionaryEntry

def scrape_glossary():
    url = "https://coinmarketcap.com/academy/glossary"
    html = requests.get(url).text
    soup = BeautifulSoup(html, "html.parser")

    # Each term is in <h2>, definition in the next <div>
    headings = soup.find_all("h2")

    for h2 in headings:
        term = h2.get_text(strip=True)

        definition_div = h2.find_next("div")
        if not definition_div:
            continue

        definition = definition_div.get_text(strip=True)

        # Save to DB
        DictionaryEntry.objects.update_or_create(
            term=term,
            defaults={"definition": definition}
        )

    return "Done"
