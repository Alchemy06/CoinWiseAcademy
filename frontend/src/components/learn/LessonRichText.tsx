import type { ReactNode } from "react";
import type { LessonListBlock } from "../../utils/lessonMarkdown";
import { parseLessonInline, parseLessonMarkdown } from "../../utils/lessonMarkdown";

const ADMONITION_LABELS = new Set(["tip", "note", "warning", "important", "caution"]);

function getCanonicalSourceUrl(sourceRepo?: string, sourcePath?: string): string {
  if (!sourceRepo || !sourcePath) {
    return "";
  }

  if (sourceRepo === "ethereum/ethereum-org-website" && sourcePath.startsWith("public/content/")) {
    // Mirror the backend repo/path mapping so links back to the source lesson page can be recognized client-side.
    const pagePath = sourcePath
      .replace(/^public\/content/, "")
      .replace(/\/index\.md$/i, "")
      .replace(/\.md$/i, "");
    return `https://ethereum.org${pagePath}`.replace(/\/$/, "");
  }

  return "";
}

function stripUrlHash(url: string): string {
  try {
    // Compare same-page links without fragment identifiers so section anchors do not masquerade as distinct destinations.
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return url.replace(/#.*$/, "").replace(/\/$/, "");
  }
}

function getAdmonitionLabel(lines: string[]): string {
  // Quote blocks carry admonition labels as their first line, so surface only the small curated label set that has dedicated styling.
  const label = lines[0]?.trim() ?? "";
  return ADMONITION_LABELS.has(label.toLowerCase()) ? label : "";
}

function renderInline(text: string, currentSourceUrl: string): ReactNode[] {
  // Inline parsing stays separate from block parsing so links/emphasis can be reused across paragraphs, headings, tables, and quotes.
  return parseLessonInline(text).map((token, index) => {
    if (token.type === "strong") {
      return <strong key={`strong-${index}`}>{renderInline(token.text, currentSourceUrl)}</strong>;
    }

    if (token.type === "em") {
      return <em key={`em-${index}`}>{renderInline(token.text, currentSourceUrl)}</em>;
    }

    if (token.type === "code") {
      return <code className="learn-rich-text-inline-code" key={`code-${index}`}>{token.text}</code>;
    }

    if (token.type === "link") {
      if (token.href.startsWith("#")) {
        // Same-document anchors do not work inside the isolated lesson article shell, so keep only the readable label.
        return <span key={`link-text-${index}`}>{token.text}</span>;
      }

      if (currentSourceUrl && stripUrlHash(token.href) === currentSourceUrl) {
        // Suppress links that bounce back to the source page the learner is already reading to avoid fake "external" actions.
        return <span key={`link-text-${index}`}>{token.text}</span>;
      }

      return (
        <a className="learn-rich-text-link" href={token.href} key={`link-${index}`} rel="noreferrer noopener" target="_blank">
          {token.text}
        </a>
      );
    }

    return <span key={`text-${index}`}>{token.text}</span>;
  });
}

function renderCodeLines(code: string): ReactNode[] {
  const lines = code.split("\n");
  return lines.map((line, index) => (
    <span className="learn-rich-text-code-line" key={`code-line-${index}`}>
      <span aria-hidden="true" className="learn-rich-text-code-line-number">
        {index + 1}
      </span>
      <span className="learn-rich-text-code-line-content">{renderCodeTokens(line)}</span>
    </span>
  ));
}

function getCodeTokenClass(token: string): string {
  // Keep token categories intentionally lightweight; the goal is readable teaching content, not language-accurate syntax parsing.
  if (!token) {
    return "plain";
  }

  if (/^#.*$/.test(token) || /^\/\/.*$/.test(token)) {
    return "comment";
  }

  if (/^([A-Za-z][A-Za-z0-9+.-]*:)/.test(token)) {
    return "protocol";
  }

  if (/^"(?:[^"\\]|\\.)*"$/.test(token) || /^'(?:[^'\\]|\\.)*'$/.test(token)) {
    return "string";
  }

  if (/^(from|import|const|let|var|return|await|async|function|class|new|if|else|for|while|try|catch|finally|True|False|None|def)$/.test(token)) {
    return "keyword";
  }

  if (/^[A-Z][A-Za-z0-9_]*$/.test(token)) {
    return "type";
  }

  if (/^\d+(?:\.\d+)?$/.test(token)) {
    return "number";
  }

  if (/^[=+\-*/%<>!&|?:]+$/.test(token)) {
    return "operator";
  }

  if (/^[()[\]{},.]$/.test(token)) {
    return "punctuation";
  }

  if (/^[A-Za-z_][A-Za-z0-9_]*=$/.test(token)) {
    return "property";
  }

  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(token)) {
    return "identifier";
  }

  return "plain";
}

function renderCodeTokens(line: string): ReactNode[] {
  if (!line) {
    // Emit a visible placeholder space so empty lines still take up vertical room inside numbered code blocks.
    return [" "];
  }

  const tokenPattern = /([A-Za-z][A-Za-z0-9+.-]*:|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[A-Za-z_][A-Za-z0-9_]*\(|[A-Za-z_][A-Za-z0-9_]*=|\d+(?:\.\d+)?|#.*$|\/\/.*$|[=+\-*/%<>!&|?:]+|[()[\]{},.]|\s+|[^\s()[\]{},.=+\-*/%<>!&|?:]+)/g;
  const tokens = line.match(tokenPattern) ?? [line];

  return tokens.map((token, index) => {
    if (/^\s+$/.test(token)) {
      return <span key={`code-token-${index}`}>{token}</span>;
    }

    const isFunctionToken = token.endsWith("(") && /^[A-Za-z_][A-Za-z0-9_]*\($/.test(token);
    const normalizedToken = isFunctionToken ? token.slice(0, -1) : token;
    const tokenClass = getCodeTokenClass(normalizedToken);

    if (isFunctionToken) {
      // Split the trailing parenthesis back out so function names can receive their own highlight color without losing punctuation.
      return (
        <span key={`code-token-${index}`}>
          <span className="learn-rich-text-code-token function">{normalizedToken}</span>
          <span className="learn-rich-text-code-token punctuation">(</span>
        </span>
      );
    }

    return <span className={`learn-rich-text-code-token ${tokenClass}`} key={`code-token-${index}`}>{token}</span>;
  });
}

function renderList(block: LessonListBlock, currentSourceUrl: string, keyPrefix: string, depth = 0): ReactNode {
  const ListTag = block.type === "ordered" ? "ol" : "ul";
  const listClassName = block.type === "ordered" ? "learn-rich-text-list ordered" : "learn-rich-text-list";

  return (
    // Emit the nesting depth as data instead of hard-coding per-lesson classes so CSS can switch numbering styles consistently across the catalog.
    <ListTag className={listClassName} data-depth={depth} key={keyPrefix}>
      {block.items.map((item, itemIndex) => (
        <li key={`${keyPrefix}-item-${itemIndex}`}>
          {renderInline(item.text, currentSourceUrl)}
          {/* Recurse through parsed child lists so nested ordered steps keep their own marker sequence and indentation. */}
          {item.children?.map((child, childIndex) => renderList(child, currentSourceUrl, `${keyPrefix}-child-${itemIndex}-${childIndex}`, depth + 1))}
        </li>
      ))}
    </ListTag>
  );
}

export function LessonRichText({
  content,
  sourcePath,
  sourceRepo
}: {
  content: string;
  sourcePath?: string;
  sourceRepo?: string;
}) {
  const blocks = parseLessonMarkdown(content);
  const currentSourceUrl = getCanonicalSourceUrl(sourceRepo, sourcePath);

  return (
    <div className="learn-rich-text" data-testid="lesson-rich-text">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          if (block.level === 1) {
            return (
              <h2 className="learn-rich-text-heading level-1" key={`block-${index}`}>
                {renderInline(block.text, currentSourceUrl)}
              </h2>
            );
          }

          if (block.level === 2) {
            return (
              <h3 className="learn-rich-text-heading level-2" key={`block-${index}`}>
                {renderInline(block.text, currentSourceUrl)}
              </h3>
            );
          }

          if (block.level === 3) {
            return (
              <h4 className="learn-rich-text-heading level-3" key={`block-${index}`}>
                {renderInline(block.text, currentSourceUrl)}
              </h4>
            );
          }

          if (block.level === 4) {
            return (
              <h5 className="learn-rich-text-heading level-4" key={`block-${index}`}>
                {renderInline(block.text, currentSourceUrl)}
              </h5>
            );
          }

          return (
            // Lesson pages already own the document h1, so deeper source headings fall back to an accessible pseudo-heading instead of breaking outline order.
            <p className={`learn-rich-text-heading level-${block.level}`} key={`block-${index}`} role="heading" aria-level={Math.min(block.level + 2, 6)}>
              {renderInline(block.text, currentSourceUrl)}
            </p>
          );
        }

        if (block.type === "unordered" || block.type === "ordered") {
          return renderList(block, currentSourceUrl, `block-${index}`);
        }

        if (block.type === "blockquote") {
          const admonitionLabel = getAdmonitionLabel(block.lines);
          // Render admonition labels separately from the body copy so CSS can give Tip/Warning blocks a stronger visual lead-in.
          const contentLines = admonitionLabel ? block.lines.slice(1) : block.lines;
          return (
            <blockquote className={`learn-rich-text-quote ${admonitionLabel ? "is-admonition" : ""}`.trim()} key={`block-${index}`}>
              {admonitionLabel ? <p className="learn-rich-text-quote-label">{admonitionLabel}</p> : null}
              {contentLines.map((line, lineIndex) => <p key={`line-${lineIndex}`}>{renderInline(line, currentSourceUrl)}</p>)}
            </blockquote>
          );
        }

        if (block.type === "code") {
          return (
            <div className="learn-rich-text-code-shell" key={`block-${index}`}>
              {block.language ? <div className="learn-rich-text-code-language">{block.language}</div> : null}
              <pre className="learn-rich-text-code-block">
                <code>{renderCodeLines(block.code)}</code>
              </pre>
            </div>
          );
        }

        if (block.type === "divider") {
          return <hr className="learn-rich-text-divider" key={`block-${index}`} />;
        }

        if (block.type === "embed") {
          return (
            <figure className="learn-rich-text-embed" key={`block-${index}`}>
              <div className="learn-rich-text-embed-frame">
                {/* Render only provider-normalized embed URLs so lesson content cannot inject arbitrary iframe destinations. */}
                <iframe
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  src={block.embedUrl}
                  title="Embedded YouTube video"
                />
              </div>
              <figcaption>
                <a className="learn-rich-text-link" href={block.url} rel="noreferrer noopener" target="_blank">
                  Watch on YouTube
                </a>
              </figcaption>
            </figure>
          );
        }

        if (block.type === "table") {
          const [header, ...rows] = block.rows;
          return (
            <div className="learn-rich-text-table-wrap" key={`block-${index}`}>
              {/* Keep tables horizontally scrollable so upstream lesson content can stay intact on narrow mobile layouts. */}
              <table className="learn-rich-text-table">
                <thead>
                  <tr>
                    {header.map((cell, cellIndex) => <th key={`head-${cellIndex}`}>{renderInline(cell, currentSourceUrl)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`}>
                      {row.map((cell, cellIndex) => <td key={`cell-${rowIndex}-${cellIndex}`}>{renderInline(cell, currentSourceUrl)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <p className="learn-rich-text-paragraph" key={`block-${index}`}>
            {renderInline(block.text, currentSourceUrl)}
          </p>
        );
      })}
    </div>
  );
}
