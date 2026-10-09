import type { ReactNode } from "react";
import { toMessageBlocks } from "../../utils/chatMessageFormat";

function renderInlineFormatting(text: string): ReactNode[] {
  // Support only the inline formatting patterns the prompt is allowed to emit reliably.
  const nodes: ReactNode[] = [];
  let index = 0;
  let key = 0;
  const pattern = /(\*\*(.+?)\*\*|`(.+?)`)/g;
  let match = pattern.exec(text);

  while (match) {
    if (match.index > index) {
      // Preserve the untouched text between formatting markers as plain string nodes.
      nodes.push(text.slice(index, match.index));
    }

    if (match[2]) {
      // Render **bold** spans as semantic strong elements for CSS-driven emphasis.
      nodes.push(<strong key={`strong-${key}`}>{match[2]}</strong>);
    } else if (match[3]) {
      // Render `code` spans separately so commands and paths stay visually distinct in prose.
      nodes.push(
        <code className="chatbot-message-code" key={`code-${key}`}>
          {match[3]}
        </code>
      );
    }

    key += 1;
    index = match.index + match[0].length;
    match = pattern.exec(text);
  }

  if (index < text.length) {
    nodes.push(text.slice(index));
  }

  return nodes;
}

export function AssistantRichText({ content }: { content: string }) {
  // Convert raw assistant text into semantic blocks before rendering so long replies stay scannable.
  const blocks = toMessageBlocks(content);

  return (
    <div className="chatbot-message-content">
      {blocks.map((block, blockIndex) => {
        if (block.type === "heading") {
          // Map parsed heading depth onto the only two heading sizes supported by the chat UI.
          const Tag = block.level === 2 ? "h4" : "h5";
          return (
            <Tag className={`chatbot-message-heading level-${block.level}`} key={`block-${blockIndex}`}>
              {renderInlineFormatting(block.text)}
            </Tag>
          );
        }

        if (block.type === "unordered") {
          return (
            <ul className="chatbot-message-list" key={`block-${blockIndex}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`item-${itemIndex}`}>{renderInlineFormatting(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "ordered") {
          return (
            <ol className="chatbot-message-list ordered" key={`block-${blockIndex}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`item-${itemIndex}`}>{renderInlineFormatting(item)}</li>
              ))}
            </ol>
          );
        }

        if (block.type === "callout") {
          // Classify caution-heavy copy as warning so the same parsed block can render with stronger styling.
          const tone = /^(warning|risk|caution|watch out|be careful|remember)\b/i.test(block.lines[0] ?? "")
            ? "warning"
            : "info";
          return (
            <div className={`chatbot-message-callout ${tone}`} key={`block-${blockIndex}`}>
              {block.lines.map((line, lineIndex) => (
                <p className="chatbot-message-callout-line" key={`line-${lineIndex}`}>
                  {renderInlineFormatting(line)}
                </p>
              ))}
            </div>
          );
        }

        if (block.type === "divider") {
          return <hr className="chatbot-message-divider" key={`block-${blockIndex}`} />;
        }

        return (
          <p className="chatbot-message-paragraph" key={`block-${blockIndex}`}>
            {renderInlineFormatting(block.text)}
          </p>
        );
      })}
    </div>
  );
}
