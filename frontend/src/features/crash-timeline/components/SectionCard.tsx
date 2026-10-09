interface SectionCardProps {
  variant: "red" | "amber" | "green";
  title: string;
  children: React.ReactNode;
}

export function SectionCard({ variant, title, children }: SectionCardProps) {
  return (
    // Variant stays on the wrapper so copy, spacing, and any future accent treatment can change together per lesson type.
    <article className={`ct-section ct-section--${variant}`}>
      <div className="ct-section-head">
        <span className="ct-section-title">{title}</span>
      </div>
      <div className="ct-section-body">{children}</div>
    </article>
  );
}
