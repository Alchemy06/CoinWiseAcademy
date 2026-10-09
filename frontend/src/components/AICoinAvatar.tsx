import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import avatarGlyph from "../assets/chatgpt-pound-glyph.png";

type AICoinAvatarProps = {
  className?: string;
  interactive?: boolean;
  label?: string;
  size?: number;
};

const IDLE_FLIP_INTERVAL_MS = 15_000;
const MOTION_DURATION_MS = 1980;

export function AICoinAvatar({
  className = "",
  interactive = true,
  label = "AI assistant pound avatar",
  size = 56
}: AICoinAvatarProps) {
  const [isHovered, setHovered] = useState(false);
  const symbolRef = useRef<HTMLSpanElement | null>(null);
  const glyphRef = useRef<HTMLImageElement | null>(null);

  const triggerFlip = useEffectEvent(() => {
    const symbol = symbolRef.current;
    const glyph = glyphRef.current;

    if (symbol) {
      symbol.getAnimations().forEach((animation) => animation.cancel());

      const animation = symbol.animate(
        [
          { transform: "translateY(0) rotateZ(0deg) scale(1)" },
          { offset: 0.18, transform: "translateY(-3%) rotateZ(-3.4deg) scale(1.02)" },
          { offset: 0.42, transform: "translateY(-5.6%) rotateZ(2.2deg) scale(1.048)" },
          { offset: 0.64, transform: "translateY(-2.4%) rotateZ(-1.4deg) scale(1.024)" },
          { offset: 0.84, transform: "translateY(-1.2%) rotateZ(0.6deg) scale(1.01)" },
          { transform: "translateY(0) rotateZ(0deg) scale(1)" }
        ],
        {
          duration: MOTION_DURATION_MS,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards"
        }
      );

      animation.onfinish = () => {
        symbol.style.transform = "translateY(0) rotateZ(0deg) scale(1)";
      };
    }

    if (glyph) {
      glyph.getAnimations().forEach((animation) => animation.cancel());

      // The imported pound glyph is optically left-heavy, so keep a small x-offset while animating it.
      const animation = glyph.animate(
        [
          {
            transform: "translateX(4%) translateY(0) rotate(0deg) scale(1)",
            filter: "drop-shadow(0 3px 5px rgba(15, 15, 15, 0.12))"
          },
          {
            offset: 0.18,
            transform: "translateX(4%) translateY(-2.2%) rotate(-2deg) scale(1.024)"
          },
          {
            offset: 0.42,
            transform: "translateX(4%) translateY(-5.2%) rotate(2.4deg) scale(1.08)",
            filter: "drop-shadow(0 12px 16px rgba(15, 15, 15, 0.16))"
          },
          {
            offset: 0.64,
            transform: "translateX(4%) translateY(-2.4%) rotate(-1.4deg) scale(1.032)"
          },
          {
            offset: 0.82,
            transform: "translateX(4%) translateY(-1%) rotate(0.8deg) scale(1.012)"
          },
          {
            transform: "translateX(4%) translateY(0) rotate(0deg) scale(1)",
            filter: "drop-shadow(0 3px 5px rgba(15, 15, 15, 0.12))"
          }
        ],
        {
          duration: MOTION_DURATION_MS,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards"
        }
      );

      animation.onfinish = () => {
        glyph.style.transform = "translateX(4%) translateY(0) rotate(0deg) scale(1)";
        glyph.style.filter = "drop-shadow(0 3px 5px rgba(15, 15, 15, 0.12))";
      };
    }
  });

  useEffect(() => {
    if (isHovered) {
      return;
    }

    const intervalId = window.setInterval(() => {
      triggerFlip();
    }, IDLE_FLIP_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isHovered]);

  useEffect(() => {
    if (!symbolRef.current) {
      return;
    }

    symbolRef.current.style.transform = "translateY(0) rotateZ(0deg) scale(1)";
  }, []);

  const style = {
    "--ai-coin-size": `${size}px`
  } as CSSProperties;

  const classes = ["ai-coin-avatar", className].filter(Boolean).join(" ");

  return (
    <div
      aria-hidden={!interactive}
      aria-label={interactive ? label : undefined}
      className={classes}
      onBlur={() => setHovered(false)}
      onFocus={interactive ? () => triggerFlip() : undefined}
      onPointerEnter={() => {
        setHovered(true);
        triggerFlip();
      }}
      onPointerLeave={() => setHovered(false)}
      role={interactive ? "img" : undefined}
      style={style}
      tabIndex={interactive ? 0 : undefined}
    >
      <span className="ai-coin-symbol-wrap" aria-hidden="true" ref={symbolRef}>
        <img alt="" aria-hidden="true" className="ai-coin-glyph-image" ref={glyphRef} src={avatarGlyph} />
      </span>
    </div>
  );
}
