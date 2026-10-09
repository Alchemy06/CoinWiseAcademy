export type LessonInlineToken =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "em"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

export type LessonListItem = {
  // List items keep their own body text plus optional nested lists so numbering survives recursive rendering.
  text: string;
  children?: LessonListBlock[];
};

export type LessonListBlock =
  | { type: "unordered"; items: LessonListItem[] }
  | { type: "ordered"; items: LessonListItem[] };

export type LessonMarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: "paragraph"; text: string }
  | LessonListBlock
  | { type: "blockquote"; lines: string[] }
  | { type: "code"; language: string; code: string }
  | { type: "divider" }
  | { type: "embed"; provider: "youtube"; url: string; embedUrl: string }
  | { type: "table"; rows: string[][] };

type ListMarkerType = "unordered" | "ordered";

type ParsedListLine = {
  // Preserve the normalized indentation width so markdown sub-lists can be grouped under the correct parent item.
  indent: number;
  text: string;
  type: ListMarkerType;
};

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableDivider(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function normalizeInlineSource(text: string): string {
  // Convert the small subset of AsciiDoc inline passthrough used in upstream lessons before token parsing runs.
  return text
    .replace(/pass:\[([^\]]*?)\]/g, "$1")
    // Strip the leftover wrapper tags that backend cleanup may intentionally keep around while preserving their visible text nodes.
    .replace(/<\/DocLink>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?p>/gi, "")
    .replace(/<\/?[A-Za-z][^>]*>/g, "")
    .trim();
}

function isMetadataLine(line: string): boolean {
  return /^\[(quote|source(?:,[^\]]+)?)\]$/i.test(line);
}

function isDelimitedQuoteMarker(line: string): boolean {
  return /^(_{4,}|\*{4,})$/.test(line);
}

function normalizeAsciiHeadingLevel(markerLength: number): 1 | 2 | 3 | 4 {
  const normalized = Math.min(4, Math.max(1, markerLength - 2));
  return normalized as 1 | 2 | 3 | 4;
}

function isAdmonitionLabel(line: string): boolean {
  return /^(Tip|Note|Warning|Important|Caution)$/i.test(line.trim());
}

function normalizeUrlCandidate(candidate: string): string {
  // Bare URLs commonly end a sentence, so trim trailing punctuation before treating them as actual destinations.
  return candidate.replace(/[),.;:!?]+$/, "");
}

function getIndentWidth(rawIndent: string): number {
  // Tabs are expanded into a stable width before comparisons so mixed-indentation source content still nests predictably.
  return rawIndent.replace(/\t/g, "    ").length;
}

function parseListLine(rawLine: string): ParsedListLine | null {
  const match = rawLine.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
  if (!match) {
    return null;
  }

  return {
    indent: getIndentWidth(match[1]),
    // Reduce numeric markers into one ordered bucket because browser list styling will own the visible counter format later.
    type: /^\d+\.$/.test(match[2]) ? "ordered" : "unordered",
    text: normalizeInlineSource(match[3].trim())
  };
}

function getStandaloneUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  // Only promote paragraphs that are just a URL, otherwise inline links should stay inside normal paragraph flow.
  const normalized = normalizeUrlCandidate(trimmed);
  return /^https?:\/\/\S+$/i.test(normalized) ? normalized : null;
}

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();

    if (host === "youtu.be") {
      // Short-form share links need the first path segment promoted into the embed URL expected by the iframe renderer.
      const videoId = parsed.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        // Preserve the canonical watch URL in data while deriving a privacy-enhanced embed URL for rendering.
        const videoId = parsed.searchParams.get("v");
        return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
      }

      const pathMatch = parsed.pathname.match(/^\/embed\/([^/?#]+)/);
      return pathMatch?.[1] ? `https://www.youtube-nocookie.com/embed/${pathMatch[1]}` : null;
    }
  } catch {
    return null;
  }

  return null;
}

function compactParagraphs(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let currentParagraphLines: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      if (currentParagraphLines.length > 0) {
        paragraphs.push(currentParagraphLines.join(" "));
        currentParagraphLines = [];
      }
      continue;
    }

    currentParagraphLines.push(trimmedLine);
  }

  if (currentParagraphLines.length > 0) {
    paragraphs.push(currentParagraphLines.join(" "));
  }

  return paragraphs;
}

export function parseLessonInline(text: string): LessonInlineToken[] {
  const tokens: LessonInlineToken[] = [];
  const normalizedText = normalizeInlineSource(text);
  // Support the markdown and AsciiDoc inline markers that already appear inside the published lesson corpus.
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|https?:\/\/[^\s<]+|\*\*(.+?)\*\*|__(.+?)__|`(.+?)`|\+([^+\n]+?)\+|(?<!\*)\*([^*\n]+?)\*(?!\*)|(?<!_)_([^_\n]+?)_(?!_))/g;
  let index = 0;
  let match = pattern.exec(normalizedText);

  while (match) {
    if (match.index > index) {
      tokens.push({ type: "text", text: normalizedText.slice(index, match.index) });
    }

    if (match[2] && match[3]) {
      tokens.push({ type: "link", text: match[2], href: match[3] });
    } else if (match[0].startsWith("http://") || match[0].startsWith("https://")) {
      const href = normalizeUrlCandidate(match[0]);
      tokens.push({ type: "link", text: href, href });
    } else if (match[4]) {
      tokens.push({ type: "strong", text: match[4] });
    } else if (match[5]) {
      tokens.push({ type: "strong", text: match[5] });
    } else if (match[6]) {
      tokens.push({ type: "code", text: match[6] });
    } else if (match[7]) {
      tokens.push({ type: "code", text: match[7] });
    } else if (match[8]) {
      tokens.push({ type: "em", text: match[8] });
    } else if (match[9]) {
      tokens.push({ type: "em", text: match[9] });
    }

    index = match.index + match[0].length;
    match = pattern.exec(normalizedText);
  }

  if (index < normalizedText.length) {
    tokens.push({ type: "text", text: normalizedText.slice(index) });
  }

  return tokens;
}

export function parseLessonMarkdown(content: string): LessonMarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks: LessonMarkdownBlock[] = [];
  let paragraphLines: string[] = [];
  let quoteLines: string[] = [];
  let tableLines: string[] = [];
  let codeFenceLanguage = "";
  let codeLines: string[] = [];
  let inCodeFence = false;
  let delimitedQuoteState: { delimiter: string; lines: string[] } | null = null;

  const flushParagraph = (): void => {
    if (paragraphLines.length === 0) {
      return;
    }
    const text = paragraphLines.join(" ");
    const standaloneUrl = getStandaloneUrl(text);
    const youtubeEmbedUrl = standaloneUrl ? getYouTubeEmbedUrl(standaloneUrl) : null;

    if (standaloneUrl && youtubeEmbedUrl) {
      // Upgrade standalone YouTube URLs into a dedicated embed block so the renderer does not treat the video as plain link text.
      blocks.push({ type: "embed", provider: "youtube", url: standaloneUrl, embedUrl: youtubeEmbedUrl });
    } else {
      blocks.push({ type: "paragraph", text });
    }
    paragraphLines = [];
  };

  const flushQuote = (): void => {
    if (quoteLines.length === 0) {
      return;
    }
    if (isAdmonitionLabel(quoteLines[0])) {
      // Preserve admonition labels as the first rendered quote line so warning/tip callouts do not collapse into plain body text.
      const [label, ...bodyLines] = quoteLines;
      const normalizedLines = [label.trim(), ...compactParagraphs(bodyLines)];
      blocks.push({ type: "blockquote", lines: normalizedLines });
    } else {
      blocks.push({ type: "blockquote", lines: compactParagraphs(quoteLines) });
    }
    quoteLines = [];
  };

  const flushDelimitedQuote = (): void => {
    if (!delimitedQuoteState) {
      return;
    }

    const normalizedLines = compactParagraphs(delimitedQuoteState.lines);
    if (normalizedLines.length > 0) {
      blocks.push({ type: "blockquote", lines: normalizedLines });
    }

    delimitedQuoteState = null;
  };

  const flushTable = (): void => {
    if (tableLines.length < 2) {
      if (tableLines.length === 1) {
        // A lone pipe line is more likely prose than a real table, so fold it back into the current paragraph instead of rendering a broken grid.
        paragraphLines.push(tableLines[0]);
      }
      tableLines = [];
      return;
    }

    const rows = tableLines.map((line) => splitTableRow(line));
    if (rows.length >= 2 && isTableDivider(tableLines[1])) {
      rows.splice(1, 1);
    }
    blocks.push({ type: "table", rows });
    tableLines = [];
  };

  const flushCode = (): void => {
    if (codeLines.length === 0 && !codeFenceLanguage) {
      return;
    }
    blocks.push({ type: "code", language: codeFenceLanguage, code: codeLines.join("\n") });
    codeFenceLanguage = "";
    codeLines = [];
  };

  const flushAll = (): void => {
    flushParagraph();
    flushQuote();
    flushTable();
    flushDelimitedQuote();
  };

  const isStructuralLine = (line: string, rawLine: string): boolean => {
    const isIndentedListMarker = /^\s+([-*]|\d+\.)\s+.+$/.test(rawLine);
    // Wrapped list continuations should stay attached to the previous item unless the next line clearly starts a new block construct.
    return (
      /^([-*_])\1{2,}$/.test(line)
      || /^(#{1,6})\s+.+$/.test(line)
      || /^(={3,6})\s+.+$/.test(line)
      || /^\|(.+)\|\s*$/.test(line)
      || /^>\s?.*$/.test(line)
      || /^[-*]\s+.+$/.test(line)
      || /^\d+\.\s+.+$/.test(line)
      || rawLineStartsCodeFence(line)
      || isMetadataLine(line)
      || isDelimitedQuoteMarker(line)
      || isIndentedListMarker
    );
  };

  function rawLineStartsCodeFence(line: string): boolean {
    return line.startsWith("```");
  }

  function readList(startIndex: number): { block: LessonListBlock; nextIndex: number } {
    const firstLine = parseListLine(lines[startIndex]);
    if (!firstLine) {
      throw new Error("readList called without a list marker.");
    }

    const rootIndent = firstLine.indent;
    const rootType = firstLine.type;
    const items: LessonListItem[] = [];
    let currentItem: LessonListItem | null = null;
    let index = startIndex;

    while (index < lines.length) {
      const rawLine = lines[index];
      const normalizedLine = normalizeInlineSource(rawLine.trim());
      const listLine = parseListLine(rawLine);

      if (listLine) {
        if (listLine.indent < rootIndent) {
          // A shallower marker means the current nested list is finished and control should return to the parent parser frame.
          break;
        }

        if (listLine.indent > rootIndent) {
          if (!currentItem) {
            break;
          }

          // Recurse immediately on deeper markers so child ordered/unordered groups stay attached to the preceding parent item.
          const nested = readList(index);
          currentItem.children = [...(currentItem.children ?? []), nested.block];
          index = nested.nextIndex;
          continue;
        }

        if (listLine.type !== rootType) {
          // Switching marker families at the same depth starts a sibling block rather than silently merging incompatible list styles.
          break;
        }

        currentItem = { text: listLine.text };
        items.push(currentItem);
        index += 1;
        continue;
      }

      if (!normalizedLine) {
        let lookahead = index + 1;
        while (lookahead < lines.length && !lines[lookahead].trim()) {
          lookahead += 1;
        }

        if (lookahead >= lines.length) {
          break;
        }

        const nextListLine = parseListLine(lines[lookahead]);
        if (nextListLine && nextListLine.indent >= rootIndent) {
          // Blank lines inside published lessons often separate items visually, so keep scanning when another list marker follows.
          index = lookahead;
          continue;
        }

        break;
      }

      if (!currentItem || isStructuralLine(normalizedLine, rawLine)) {
        // Paragraph continuations may extend the active item, but any new structural block should terminate the list first.
        break;
      }

      // Upstream lessons sometimes soft-wrap long list bodies without indentation, so fold the prose back into the current item.
      currentItem.text = `${currentItem.text} ${normalizedLine}`.trim();
      index += 1;
    }

    return {
      block: {
        type: rootType,
        items
      },
      nextIndex: index
    };
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = normalizeInlineSource(rawLine.trim());

    if (delimitedQuoteState) {
      if (isDelimitedQuoteMarker(line) && line === delimitedQuoteState.delimiter) {
        flushDelimitedQuote();
      } else if (isDelimitedQuoteMarker(line)) {
        // Ignore nested delimiter noise so malformed upstream quote blocks still render as one readable callout.
        continue;
      } else {
        delimitedQuoteState.lines.push(line);
      }
      continue;
    }

    if (rawLineStartsCodeFence(rawLine.trimStart())) {
      flushAll();
      if (inCodeFence) {
        inCodeFence = false;
        flushCode();
      } else {
        inCodeFence = true;
        codeFenceLanguage = rawLine.trimStart().slice(3).trim();
      }
      continue;
    }

    if (inCodeFence) {
      codeLines.push(rawLine);
      continue;
    }

    if (isMetadataLine(line)) {
      continue;
    }

    if (isDelimitedQuoteMarker(line)) {
      flushParagraph();
      flushQuote();
      flushTable();
      delimitedQuoteState = {
        delimiter: line,
        lines: []
      };
      continue;
    }

    if (!line) {
      flushAll();
      continue;
    }

    const divider = line.match(/^([-*_])\1{2,}$/);
    if (divider) {
      flushAll();
      blocks.push({ type: "divider" });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading && heading[2].trim()) {
      flushAll();
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: heading[2].trim()
      });
      continue;
    }

    const asciiHeading = line.match(/^(={3,6})\s+(.*)$/);
    if (asciiHeading && asciiHeading[2].trim()) {
      flushAll();
      blocks.push({
        type: "heading",
        level: normalizeAsciiHeadingLevel(asciiHeading[1].length),
        text: asciiHeading[2].trim()
      });
      continue;
    }

    if (/^\|(.+)\|\s*$/.test(line)) {
      flushParagraph();
      flushQuote();
      tableLines.push(line);
      continue;
    }

    flushTable();

    const blockquote = line.match(/^>\s?(.*)$/);
    if (blockquote) {
      flushParagraph();
      quoteLines.push(normalizeInlineSource(blockquote[1].trim()));
      continue;
    }

    if (quoteLines.length > 0 && isAdmonitionLabel(quoteLines[0]) && !isStructuralLine(line, rawLine)) {
      quoteLines.push(line);
      continue;
    }

    flushQuote();

    if (parseListLine(rawLine)) {
      flushParagraph();
      // Parse the whole nested list tree in one pass so render-time numbering can depend on stable parent/child structure.
      const parsedList = readList(lineIndex);
      blocks.push(parsedList.block);
      lineIndex = parsedList.nextIndex - 1;
      continue;
    }

    paragraphLines.push(line);
  }

  if (inCodeFence) {
    flushCode();
  }

  flushAll();
  return blocks;
}
