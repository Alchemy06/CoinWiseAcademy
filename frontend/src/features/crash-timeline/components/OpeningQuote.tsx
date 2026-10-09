interface OpeningQuoteProps {
  text: string;
}

export function OpeningQuote({ text }: OpeningQuoteProps) {
  return <blockquote className="ct-quote">{text}</blockquote>;
}
