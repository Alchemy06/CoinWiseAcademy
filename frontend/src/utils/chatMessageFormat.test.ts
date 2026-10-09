import { describe, expect, it } from "vitest";
import { toMessageBlocks } from "./chatMessageFormat";

describe("toMessageBlocks", () => {
  it("parses headings, paragraphs, and lists into distinct blocks", () => {
    const blocks = toMessageBlocks(
      [
        "## What it is",
        "Bitcoin is a digital asset.",
        "",
        "- It can be transferred globally.",
        "- It is volatile.",
        "",
        "1. Learn the basics",
        "2. Review the risks"
      ].join("\n")
    );

    expect(blocks).toEqual([
      { type: "heading", level: 2, text: "What it is" },
      { type: "paragraph", text: "Bitcoin is a digital asset." },
      { type: "unordered", items: ["It can be transferred globally.", "It is volatile."] },
      { type: "ordered", items: ["Learn the basics", "Review the risks"] }
    ]);
  });

  it("parses callouts and dividers for richer assistant formatting", () => {
    const blocks = toMessageBlocks(
      [
        "> Warning: Prices can change quickly.",
        "> Keep your private keys safe.",
        "",
        "---",
        "",
        "Remember the main idea."
      ].join("\n")
    );

    expect(blocks).toEqual([
      {
        type: "callout",
        lines: ["Warning: Prices can change quickly.", "Keep your private keys safe."]
      },
      { type: "divider" },
      { type: "paragraph", text: "Remember the main idea." }
    ]);
  });

  it("treats standalone section labels as headings even without markdown markers", () => {
    const blocks = toMessageBlocks(
      [
        "Simple explanation",
        "Prices move in cycles because sentiment and liquidity change over time.",
        "",
        "Common phases (simple)",
        "- Accumulation",
        "- Uptrend",
        "",
        "What drives cycles",
        "Human psychology and market structure both matter."
      ].join("\n")
    );

    expect(blocks).toEqual([
      { type: "heading", level: 3, text: "Simple explanation" },
      { type: "paragraph", text: "Prices move in cycles because sentiment and liquidity change over time." },
      { type: "heading", level: 3, text: "Common phases (simple)" },
      { type: "unordered", items: ["Accumulation", "Uptrend"] },
      { type: "heading", level: 3, text: "What drives cycles" },
      { type: "paragraph", text: "Human psychology and market structure both matter." }
    ]);
  });
});
