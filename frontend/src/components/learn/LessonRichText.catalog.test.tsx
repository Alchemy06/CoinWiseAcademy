import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LessonRichText } from "./LessonRichText";

type CatalogUnit = {
  external_id: string;
  learning: {
    body_markdown: string;
  };
};

function loadPublishedUnits(): CatalogUnit[] {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const snapshotPath = path.resolve(currentDir, "../../../../backend/quizzes/data/published_catalog.json");
  const payload = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as {
    catalog_json?: { tracks?: Array<{ units?: CatalogUnit[] }> };
    tracks?: Array<{ units?: CatalogUnit[] }>;
  };
  const tracks = payload.catalog_json?.tracks ?? payload.tracks ?? [];
  return tracks.flatMap((track) => track.units ?? []);
}

function getPublishedUnit(externalId: string): CatalogUnit {
  // Pull specific committed lessons by id so catalog-backed regression cases can target the exact markdown patterns that previously broke rendering.
  const unit = loadPublishedUnits().find((candidate) => candidate.external_id === externalId);
  if (!unit) {
    throw new Error(`Missing published unit ${externalId}`);
  }
  return unit;
}

describe("LessonRichText with published catalog", () => {
  it("renders external links, callout labels, and YouTube embeds with article-safe markup", () => {
    render(
      <LessonRichText
        content={
          [
            "Paragraph with [Ethereum](https://ethereum.org) and https://example.test/docs.",
            "",
            "> Tip",
            "> Verify the destination carefully.",
            "",
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
          ].join("\n")
        }
      />
    );

    const links = screen.getAllByRole("link");
    expect(links.some((link) => link.getAttribute("href") === "https://ethereum.org")).toBe(true);
    expect(links.some((link) => link.getAttribute("href") === "https://example.test/docs")).toBe(true);
    expect(links.every((link) => link.getAttribute("target") === "_blank")).toBe(true);
    expect(links.every((link) => link.getAttribute("rel") === "noreferrer noopener")).toBe(true);

    expect(screen.getByText("Tip")).toHaveClass("learn-rich-text-quote-label");

    const iframe = screen.getByTitle("Embedded YouTube video");
    expect(iframe).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("suppresses links that only point back to the current lesson source page", () => {
    render(
      <LessonRichText
        content="Learn more about [Proof-of-work (PoW)](https://ethereum.org/developers/docs/consensus-mechanisms/pow)."
        sourcePath="public/content/developers/docs/consensus-mechanisms/pow/index.md"
        sourceRepo="ethereum/ethereum-org-website"
      />
    );

    expect(screen.queryByRole("link", { name: "Proof-of-work (PoW)" })).toBeNull();
    expect(screen.getByText("Proof-of-work (PoW)")).toBeInTheDocument();
  });

  it("suppresses same-page anchor links and still resolves nested formatting safely", () => {
    render(
      <LessonRichText
        content={
          [
            "See **[recovery scams](#scam-types)** below.",
            "",
            "<p>Dapp stands for decentralized applications.</p>",
            "",
            "- **[Prediction markets](https://ethereum.org/prediction-markets/)**"
          ].join("\n")
        }
      />
    );

    expect(screen.queryByRole("link", { name: "recovery scams" })).toBeNull();
    expect(screen.getByText("recovery scams")).toBeInTheDocument();
    expect(screen.getByText("Dapp stands for decentralized applications.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Prediction markets" })).toHaveAttribute("href", "https://ethereum.org/prediction-markets/");
  });

  it("renders fenced code blocks with a language label and line numbers", () => {
    const { container } = render(
      <LessonRichText
        content={
          [
            "```python",
            "from openai import OpenAI",
            "client = OpenAI()",
            "",
            "print(client)",
            "```"
          ].join("\n")
        }
      />
    );

    expect(screen.getByText("python")).toHaveClass("learn-rich-text-code-language");
    expect(container.querySelectorAll(".learn-rich-text-code-line")).toHaveLength(4);
    expect(container.querySelector(".learn-rich-text-code-line-number")).toHaveTextContent("1");
    expect(screen.getByText("from")).toHaveClass("learn-rich-text-code-token", "keyword");
    expect(screen.getByText("OpenAI", { selector: ".type" })).toHaveClass("learn-rich-text-code-token", "type");
    expect(screen.getByText("print", { selector: ".function" })).toHaveClass("learn-rich-text-code-token", "function");
  });

  it("keeps decentralized identity benefits inside one ordered list instead of restarting at one", () => {
    const unit = getPublishedUnit("intermediate-05-decentralized-identity");
    const { container } = render(<LessonRichText content={unit.learning.body_markdown} />);

    // This lesson previously rendered six separate ordered lists because blank lines between items reset the browser counter to one.
    const orderedLists = container.querySelectorAll("ol.learn-rich-text-list.ordered");
    const matchingList = Array.from(orderedLists).find((list) => list.textContent?.includes("Decentralized identity harnesses blockchain technology"));

    expect(matchingList).toBeTruthy();
    expect(matchingList?.querySelectorAll(":scope > li")).toHaveLength(6);
    expect(matchingList?.textContent).toContain("Decentralized identity makes identity data portable.");
    expect(matchingList?.textContent).toContain("Decentralized identity enables anti-Sybil mechanisms");
  });

  it("renders nested ordered steps for the mining lesson instead of flattening them into the parent numbering", () => {
    const unit = getPublishedUnit("advanced-03-mining");
    const { container } = render(<LessonRichText content={unit.learning.body_markdown} />);

    // The mining lesson contains a numbered child list inside step four, which is the regression case for alphabetic second-level markers.
    const parentListItem = Array.from(container.querySelectorAll("li")).find((listItem) =>
      (listItem.textContent ?? "").includes("At some point, a mining node aggregates several dozen or hundred transaction requests into a potential block")
    );

    expect(parentListItem).not.toBeNull();
    const nestedOrderedList = parentListItem?.querySelector("ol.learn-rich-text-list.ordered");
    expect(nestedOrderedList).not.toBeNull();
    expect(nestedOrderedList).toHaveAttribute("data-depth", "1");
    expect(nestedOrderedList?.querySelectorAll(":scope > li")).toHaveLength(2);
    expect(container.querySelectorAll("ol.learn-rich-text-list.ordered").length).toBeGreaterThan(1);
  });

  it("renders all 21 lesson bodies without leaking raw component tags", () => {
    const units = loadPublishedUnits();
    expect(units).toHaveLength(21);

    for (const unit of units) {
      const view = render(<LessonRichText content={unit.learning.body_markdown} />);
      const text = view.container.textContent ?? "";

      // Treat the committed catalog snapshot as a regression corpus so upstream content changes cannot silently break the lesson renderer.
      expect(text.length, unit.external_id).toBeGreaterThan(80);
      expect(text, unit.external_id).not.toMatch(/<YouTube|<DocLink|<Divider|<QuizWidget|<ListenToPlayer|<Emoji|<table|<tr|<td|<th|<a\s/i);
      expect(text, unit.external_id).not.toContain("#### ");
      expect(text, unit.external_id).not.toContain("ExpandableCard");
      expect(text, unit.external_id).not.toContain("_ConsenSys_");
      expect(text, unit.external_id).not.toMatch(/\[quote\]|\[source,[^\]]+\]|pass:\[/i);
      expect(text, unit.external_id).not.toMatch(/^\s*={3,}\s+/m);
      expect(text, unit.external_id).not.toContain("____");
      expect(text, unit.external_id).not.toContain("****");

      if (unit.learning.body_markdown.includes("| ---")) {
        expect(view.container.querySelector("table.learn-rich-text-table"), unit.external_id).not.toBeNull();
      }

      if (/^\d+\.\s+/m.test(unit.learning.body_markdown)) {
        expect(view.container.querySelector("ol.learn-rich-text-list.ordered"), unit.external_id).not.toBeNull();
      }

      if (/^>\s+/m.test(unit.learning.body_markdown)) {
        expect(view.container.querySelector("blockquote.learn-rich-text-quote"), unit.external_id).not.toBeNull();
      }

      if (/\n={3,6}\s+/m.test(unit.learning.body_markdown) || /^\={3,6}\s+/m.test(unit.learning.body_markdown)) {
        expect(view.container.querySelector(".learn-rich-text-heading"), unit.external_id).not.toBeNull();
      }

      view.unmount();
    }
  });
});
