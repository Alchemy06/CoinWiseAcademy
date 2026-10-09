import React, { useState } from "react";
import { useI18n } from "../i18n/provider";

const POPULAR_TERMS = [
  "Bitcoin",
  "Blockchain",
  "Wallet",
  "Stablecoin",
  "Volatility",
  "Liquidity",
  "Mining",
  "Market",
];

export function DictionaryPage() {
  const { tx } = useI18n();
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<{ term: string; definition: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const API_URL = import.meta.env.VITE_API_URL; // works in dev + prod

      const response = await fetch(
        `${API_URL}/api/dictionary/${encodeURIComponent(trimmed)}/`
      );

      if (!response.ok) {
        setError(tx('No definition found for "{term}".', { term: trimmed }));
        return;
      }

      const data = await response.json(); // array of { term, definition }
      setResults(data);
    } catch {
      setError(tx("Something went wrong. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    await runSearch(searchTerm);
  };

  const handlePopularTermClick = async (term: string) => {
    setSearchTerm(term);
    await runSearch(term);
  };

  return (
    <div className="dict-page">
      <header className="dict-header">
        <p className="dict-kicker">{tx("Crypto & general vocabulary")}</p>
        <h1 className="dict-title">{tx("Dictionary")}</h1>
        <p className="dict-subtitle">
          {tx("Look up any word — crypto jargon, finance terms, or everyday language.")}
        </p>
      </header>

      <form className="dict-search-form" onSubmit={handleSearch}>
        <div className="dict-search-row">
          <input
            className="dict-search-input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={tx("e.g. blockchain, liquidity, hash…")}
            aria-label={tx("Search for a word")}
          />
          <button className="dict-search-button" type="submit" disabled={loading}>
            {loading ? tx("Searching…") : tx("Search")}
          </button>
        </div>
      </form>

      <section className="dict-popular">
        <div className="dict-popular-head">
          <h2 className="dict-section-title">{tx("Popular terms")}</h2>
        </div>

        <div className="dict-popular-list">
          {POPULAR_TERMS.map((term) => (
            <button
              key={term}
              type="button"
              className="dict-term-pill"
              onClick={() => void handlePopularTermClick(term)}
            >
              {term}
            </button>
          ))}
        </div>
      </section>

      {!loading && !error && results.length === 0 && (
        <div className="dict-empty-state">
          <h2 className="dict-empty-title">{tx("Search for a term to get started")}</h2>
          <p className="dict-empty-text">
            {tx("Try a crypto word like")} <strong>{tx("wallet")}</strong>,{" "}
            <strong>{tx("blockchain")}</strong>, {tx("or")}{" "}
            <strong>{tx("stablecoin")}</strong>.
          </p>
        </div>
      )}

      {loading && (
        <div className="dict-state-message">
          <p>
            {tx("Looking up")} <strong>{searchTerm}</strong>…
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="dict-state-message dict-state-message--error">
          <p>{error}</p>
        </div>
      )}

      {results.length > 0 && !loading && (
        <div className="dict-result">
          <h2 className="dict-result-word">{tx("Results")}</h2>

          <ol className="dict-definition-list">
            {results.map((entry, i) => (
              <li key={i} className="dict-definition-item">
                <h3 className="dict-definition-term">{entry.term}</h3>
                <p className="dict-definition-text">{entry.definition}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
