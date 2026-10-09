export function ThinkingIndicator({
  className = "",
  label = "Thinking"
}: {
  className?: string;
  label?: string;
}) {
  // Merge the caller class into the shared loading shell so chat and quiz surfaces can reuse one animation contract.
  const classes = ["chatbot-loading", className].filter(Boolean).join(" ");

  return (
    <div className={classes} role="status" aria-live="polite">
      <span className="chatbot-loading-text">{label}</span>
      <span className="chatbot-loading-wave" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}
