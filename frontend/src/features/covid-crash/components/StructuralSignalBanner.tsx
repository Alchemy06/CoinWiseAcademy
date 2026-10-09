/**
 * StructuralSignalBanner.tsx
 *
 * Displays the structural signal warning for a round when one is present.
 * Shown above the chart whenever round.structural_signal_text is non-empty.
 *
 * Phase 5 — Luna Collapse.
 */

interface StructuralSignalBannerProps {
  text: string;
}

export function StructuralSignalBanner({ text }: StructuralSignalBannerProps) {
  if (!text) return null;

  return (
    <div className="cc-signal-banner" role="alert">
      <span className="cc-signal-banner-icon" aria-hidden="true">⚠</span>
      <span className="cc-signal-banner-text">{text}</span>
    </div>
  );
}
