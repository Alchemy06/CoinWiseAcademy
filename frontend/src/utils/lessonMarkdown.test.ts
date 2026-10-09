import { describe, expect, it } from "vitest";
import { parseLessonInline, parseLessonMarkdown } from "./lessonMarkdown";

describe("parseLessonInline", () => {
  it("parses strong and inline code spans", () => {
    expect(parseLessonInline("Read **carefully** and use `wallet` tooling.")).toEqual([
      { type: "text", text: "Read " },
      { type: "strong", text: "carefully" },
      { type: "text", text: " and use " },
      { type: "code", text: "wallet" },
      { type: "text", text: " tooling." }
    ]);
  });

  it("parses emphasis and markdown links", () => {
    expect(parseLessonInline("Built by _ConsenSys_ and [ENS](https://example.test).")).toEqual([
      { type: "text", text: "Built by " },
      { type: "em", text: "ConsenSys" },
      { type: "text", text: " and " },
      { type: "link", text: "ENS", href: "https://example.test" },
      { type: "text", text: "." }
    ]);
  });

  it("parses bare URLs as links", () => {
    expect(parseLessonInline("Read more at https://example.test/docs.")).toEqual([
      { type: "text", text: "Read more at " },
      { type: "link", text: "https://example.test/docs", href: "https://example.test/docs" }
    ]);
  });

  it("parses AsciiDoc pass-through and inline monospace markers", () => {
    expect(parseLessonInline("The pass:[block hash] uses +bitcoin-cli+ on +testnet+.")).toEqual([
      { type: "text", text: "The block hash uses " },
      { type: "code", text: "bitcoin-cli" },
      { type: "text", text: " on " },
      { type: "code", text: "testnet" },
      { type: "text", text: "." }
    ]);
  });

  it("strips stray HTML wrapper tags from inline text", () => {
    expect(parseLessonInline("<p>Dapp stands for decentralized applications.</p>")).toEqual([
      { type: "text", text: "Dapp stands for decentralized applications." }
    ]);
  });
});

describe("parseLessonMarkdown", () => {
  it("parses headings, paragraphs, lists, quotes, code fences, and tables", () => {
    const blocks = parseLessonMarkdown(
      [
        "# Wallet Basics",
        "",
        "Use **care** before any transfer.",
        "",
        "## Steps",
        "",
        "1. Verify the address",
        "2. Confirm the network",
        "",
        "#### Access to global funds",
        "",
        "> Never rush a transfer.",
        "",
        "```text",
        "wallet address",
        "```",
        "",
        "| Card | Notes |",
        "| --- | --- |",
        "| MetaMask | Self-custody |"
      ].join("\n")
    );

    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "Wallet Basics" },
      { type: "paragraph", text: "Use **care** before any transfer." },
      { type: "heading", level: 2, text: "Steps" },
      {
        type: "ordered",
        items: [
          { text: "Verify the address" },
          { text: "Confirm the network" }
        ]
      },
      { type: "heading", level: 4, text: "Access to global funds" },
      { type: "blockquote", lines: ["Never rush a transfer."] },
      { type: "code", language: "text", code: "wallet address" },
      {
        type: "table",
        rows: [
          ["Card", "Notes"],
          ["MetaMask", "Self-custody"]
        ]
      }
    ]);
  });

  it("parses AsciiDoc headings, metadata fences, and delimited quote blocks", () => {
    const blocks = parseLessonMarkdown(
      [
        "===== Using testnet",
        "",
        "[quote]",
        "____",
        "https://blockstream.info/block/0000",
        "____",
        "",
        "****",
        "WARNING! This block is intentionally highlighted.",
        "",
        "Read it carefully before continuing.",
        "****",
        "",
        "[source,json]",
        "```json",
        "{\"chain\": \"test\"}",
        "```"
      ].join("\n")
    );

    expect(blocks).toEqual([
      { type: "heading", level: 3, text: "Using testnet" },
      { type: "blockquote", lines: ["https://blockstream.info/block/0000"] },
      {
        type: "blockquote",
        lines: [
          "WARNING! This block is intentionally highlighted.",
          "Read it carefully before continuing."
        ]
      },
      { type: "code", language: "json", code: "{\"chain\": \"test\"}" }
    ]);
  });

  it("keeps admonition bodies inside the same quote block", () => {
    const blocks = parseLessonMarkdown(
      [
        "> Tip",
        "Testnet addresses begin with +m+, +n+, or +tb1+.",
        "",
        "Next paragraph."
      ].join("\n")
    );

    expect(blocks).toEqual([
      {
        type: "blockquote",
        lines: [
          "Tip",
          "Testnet addresses begin with +m+, +n+, or +tb1+."
        ]
      },
      { type: "paragraph", text: "Next paragraph." }
    ]);
  });

  it("parses standalone YouTube URLs as embed blocks", () => {
    const blocks = parseLessonMarkdown(
      [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "",
        "After the video."
      ].join("\n")
    );

    expect(blocks).toEqual([
      {
        type: "embed",
        provider: "youtube",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
      },
      { type: "paragraph", text: "After the video." }
    ]);
  });

  it("merges wrapped ordered list lines into the same list item", () => {
    const blocks = parseLessonMarkdown(
      [
        "1. It will take a while to sync fully and use up resources",
        "on your computer. Not as much as mainnet, but not exactly lightweight either.",
        "2. You need disk space.",
        "",
        "After the list."
      ].join("\n")
    );

    expect(blocks).toEqual([
      {
        type: "ordered",
        items: [
          // Real lesson exports sometimes soft-wrap list bodies, so the parser should keep them in one logical step.
          { text: "It will take a while to sync fully and use up resources on your computer. Not as much as mainnet, but not exactly lightweight either." },
          { text: "You need disk space." }
        ]
      },
      { type: "paragraph", text: "After the list." }
    ]);
  });

  it("keeps blank-line separated ordered items inside one list block", () => {
    const blocks = parseLessonMarkdown(
      [
        "1. First benefit",
        "",
        "2. Second benefit",
        "",
        "3. Third benefit",
        "",
        "After the list."
      ].join("\n")
    );

    expect(blocks).toEqual([
      {
        type: "ordered",
        items: [
          // Published lessons sometimes separate numbered items with blank lines, but that spacing should not restart browser counters.
          { text: "First benefit" },
          { text: "Second benefit" },
          { text: "Third benefit" }
        ]
      },
      { type: "paragraph", text: "After the list." }
    ]);
  });

  it("parses nested ordered and unordered lists without flattening their numbering", () => {
    const blocks = parseLessonMarkdown(
      [
        "1. Prepare the block",
        "  1. Verify each transaction",
        "  2. Produce the certificate",
        "2. Broadcast the result",
        "   - Share it with peers",
        "   - Wait for validation",
        "",
        "After the list."
      ].join("\n")
    );

    expect(blocks).toEqual([
      {
        type: "ordered",
        items: [
          {
            text: "Prepare the block",
            children: [
              {
                type: "ordered",
                items: [
                  // Nested ordered markers should survive as a child list so rendering can switch from decimal to alphabetic counters.
                  { text: "Verify each transaction" },
                  { text: "Produce the certificate" }
                ]
              }
            ]
          },
          {
            text: "Broadcast the result",
            children: [
              {
                type: "unordered",
                items: [
                  { text: "Share it with peers" },
                  { text: "Wait for validation" }
                ]
              }
            ]
          }
        ]
      },
      { type: "paragraph", text: "After the list." }
    ]);
  });

  it("ignores nested delimiter markers inside delimited quote blocks", () => {
    const blocks = parseLessonMarkdown(
      [
        "****",
        "____",
        "WARNING! Read this carefully.",
        "Bitcoin Core src/consensus/merkle.cpp",
        "____",
        "****"
      ].join("\n")
    );

    expect(blocks).toEqual([
      {
        type: "blockquote",
        lines: [
          "WARNING! Read this carefully. Bitcoin Core src/consensus/merkle.cpp"
        ]
      }
    ]);
  });
});
