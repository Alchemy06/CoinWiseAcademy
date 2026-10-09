export type MessageBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "unordered"; items: string[] }
  | { type: "ordered"; items: string[] }
  | { type: "callout"; lines: string[] }
  | { type: "divider" };

function normalizeHeadingLevel(markers: string): 2 | 3 {
  // Collapse loose markdown heading depth into the two visual sizes the chat UI supports.
  if (markers.length <= 1) {
    return 2;
  }
  return markers.length >= 3 ? 3 : 2;
}

function getNextNonEmptyLine(lines: string[], startIndex: number): string | null {
  // Look ahead so standalone labels can be treated as headings only when content follows.
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line) {
      return line;
    }
  }
  return null;
}

function normalizeStandaloneHeading(line: string): string {
  // Normalize section labels such as "Simple explanation:" before matching known patterns.
  return line.replace(/[:：]\s*$/, "").trim().toLowerCase();
}

function isStandaloneHeadingCandidate(line: string, nextNonEmptyLine: string | null): boolean {
  // Accept short section labels without markdown markers, but avoid upgrading real sentences.
  if (!nextNonEmptyLine) {
    return false;
  }

  if (!/[A-Za-z]/.test(line)) {
    return false;
  }

  if (/^([#>*-]|\d+\.)\s+/.test(line)) {
    return false;
  }

  if (/[.!?]$/.test(line)) {
    return false;
  }

  const normalized = normalizeStandaloneHeading(line);
  // Keep a whitelist for labels the model commonly emits without markdown syntax.
  const knownLabels = new Set([
    "direct answer",
    "direct answer in one line",
    "simple explanation",
    "explanation",
    "common phases",
    "common phases (simple)",
    "what drives cycles",
    "why it matters",
    "main risks",
    "key risks",
    "risks",
    "takeaway",
    "what to remember",
    "bottom line",
    "example",
    "pros",
    "cons",
    "benefits",
    "downsides",
    "comparison",
    "next steps"
  ]);

  if (knownLabels.has(normalized)) {
    return true;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 5 && normalized.length <= 42;
}

export function toMessageBlocks(content: string): MessageBlock[] {
  // Parse model output into a limited block set so the UI stays readable without full markdown.
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MessageBlock[] = [];
  let paragraphLines: string[] = [];
  let currentList: { type: "unordered" | "ordered"; items: string[] } | null = null;
  let currentCallout: string[] = [];

  const flushParagraph = (): void => {
    // Paragraph lines are merged to prevent accidental hard-wraps from becoming visual noise.
    if (paragraphLines.length === 0) {
      return;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
    paragraphLines = [];
  };

  const flushList = (): void => {
    // Lists are buffered so adjacent bullets stay grouped inside one semantic block.
    if (!currentList || currentList.items.length === 0) {
      currentList = null;
      return;
    }
    blocks.push(currentList);
    currentList = null;
  };

  const flushCallout = (): void => {
    // Consecutive blockquote lines are rendered together as one callout card.
    if (currentCallout.length === 0) {
      return;
    }
    blocks.push({ type: "callout", lines: currentCallout });
    currentCallout = [];
  };

  const flushAll = (): void => {
    // Flush in semantic order so buffered paragraph/list/callout fragments never leak into each other.
    flushParagraph();
    flushList();
    flushCallout();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      flushAll();
      continue;
    }

    const divider = line.match(/^([-*_])\1{2,}$/);
    if (divider) {
      // Treat markdown dividers as standalone structural breaks between message sections.
      flushAll();
      blocks.push({ type: "divider" });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading && heading[2].trim()) {
      // Honor explicit markdown headings when the model already emits them correctly.
      flushAll();
      blocks.push({
        type: "heading",
        level: normalizeHeadingLevel(heading[1]),
        text: heading[2].trim()
      });
      continue;
    }

    const nextNonEmptyLine = getNextNonEmptyLine(lines, index + 1);
    if (isStandaloneHeadingCandidate(line, nextNonEmptyLine)) {
      // Upgrade plain section labels like "Main risks" so they get heading styling in the UI.
      flushAll();
      blocks.push({
        type: "heading",
        level: 3,
        text: line.replace(/[:：]\s*$/, "").trim()
      });
      continue;
    }

    const callout = line.match(/^>\s?(.*)$/);
    if (callout) {
      // Start or extend a callout block when the model emits blockquote-style reminder lines.
      flushParagraph();
      flushList();
      currentCallout.push(callout[1].trim());
      continue;
    }

    flushCallout();

    const unordered = line.match(/^[-*]\s+(.*)$/);
    if (unordered) {
      // Group adjacent bullets together so the renderer produces one list instead of many fragments.
      flushParagraph();
      if (!currentList || currentList.type !== "unordered") {
        flushList();
        currentList = { type: "unordered", items: [] };
      }
      currentList.items.push(unordered[1]);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      // Ordered lists are buffered separately so numbered steps keep their semantic sequence.
      flushParagraph();
      if (!currentList || currentList.type !== "ordered") {
        flushList();
        currentList = { type: "ordered", items: [] };
      }
      currentList.items.push(ordered[1]);
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushAll();
  return blocks;
}
