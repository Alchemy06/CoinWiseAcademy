import type { CSSProperties, ReactNode } from "react";

export interface IconProps {
  size?: number;
  stroke?: number;
  fill?: string;
  viewBox?: string;
  className?: string;
  style?: CSSProperties;
  "aria-hidden"?: boolean | "true" | "false";
  "aria-label"?: string;
}

function Icon({
  size = 18,
  stroke = 1.6,
  fill = "none",
  viewBox = "0 0 24 24",
  className,
  style,
  children,
  ...rest
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={`ico ${className ?? ""}`.trim()}
      width={size}
      height={size}
      viewBox={viewBox}
      fill={fill}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={rest["aria-hidden"] ?? true}
      aria-label={rest["aria-label"]}
      style={style}
    >
      {children}
    </svg>
  );
}

type IP = IconProps;

export const IconHome      = (p: IP) => <Icon {...p}><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></Icon>;
export const IconMarket    = (p: IP) => <Icon {...p}><path d="M3 17l5-6 4 3 8-9"/><path d="M14 5h6v6"/></Icon>;
export const IconBook      = (p: IP) => <Icon {...p}><path d="M4 4h9a3 3 0 013 3v13H7a3 3 0 01-3-3V4z"/><path d="M16 4h4v13h-4"/></Icon>;
export const IconQuiz      = (p: IP) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 014.9.7c0 1.6-2.4 1.8-2.4 3.3"/><path d="M12 17h.01"/></Icon>;
export const IconCrash     = (p: IP) => <Icon {...p}><path d="M3 3v18h18"/><path d="M6 17l4-4 3 3 5-7"/><path d="M17 16l-3 3-2-2"/></Icon>;
export const IconShield    = (p: IP) => <Icon {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></Icon>;
export const IconPulse     = (p: IP) => <Icon {...p}><path d="M3 12h4l2-6 4 12 2-6h6"/></Icon>;
export const IconCompass   = (p: IP) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M14.5 9.5L13 13l-3.5 1.5L11 11z"/></Icon>;
export const IconDict      = (p: IP) => <Icon {...p}><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 3H20v18H6.5A2.5 2.5 0 014 18.5v-13A2.5 2.5 0 016.5 3z"/><path d="M8 7h8M8 10h6"/></Icon>;
export const IconTrophy    = (p: IP) => <Icon {...p}><path d="M8 4h8v5a4 4 0 01-8 0V4z"/><path d="M4 6h4M16 6h4M10 15h4M9 19h6M12 15v4"/></Icon>;
export const IconUser      = (p: IP) => <Icon {...p}><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6"/></Icon>;
export const IconChat      = (p: IP) => <Icon {...p}><path d="M4 5h16v11H9l-5 4V5z"/><path d="M8 10h8M8 13h5"/></Icon>;
export const IconSparkle   = (p: IP) => <Icon {...p}><path d="M12 3l1.8 4.4L18 9l-4.2 1.6L12 15l-1.8-4.4L6 9l4.2-1.6z"/><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></Icon>;
export const IconFlame     = (p: IP) => <Icon {...p}><path d="M12 3c2 3 5 5 5 9a5 5 0 11-10 0c0-2 1-3 2-4-.5 2 1 3 3 2 0-3-1-5 0-7z"/></Icon>;
export const IconTarget    = (p: IP) => <Icon {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></Icon>;
export const IconCheck     = (p: IP) => <Icon {...p}><path d="M4 12l5 5L20 6"/></Icon>;
export const IconX         = (p: IP) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18"/></Icon>;
export const IconArrowRight = (p: IP) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6"/></Icon>;
export const IconArrowUp    = (p: IP) => <Icon {...p}><path d="M12 19V5M6 11l6-6 6 6"/></Icon>;
export const IconArrowDown  = (p: IP) => <Icon {...p}><path d="M12 5v14M6 13l6 6 6-6"/></Icon>;
export const IconSearch    = (p: IP) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></Icon>;
export const IconLock      = (p: IP) => <Icon {...p}><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></Icon>;
export const IconPlay      = (p: IP) => <Icon {...p}><path d="M6 4l14 8-14 8V4z"/></Icon>;
export const IconSettings  = (p: IP) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L14 3h-4l-.6 2.6a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 002 1.2L10 21h4l.6-2.6a7 7 0 002-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/></Icon>;
export const IconZap       = (p: IP) => <Icon {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></Icon>;
export const IconBrain     = (p: IP) => <Icon {...p}><path d="M9 4a3 3 0 00-3 3v1a3 3 0 00-2 3v2a3 3 0 002 3v1a3 3 0 003 3h1V4H9z"/><path d="M15 4a3 3 0 013 3v1a3 3 0 012 3v2a3 3 0 01-2 3v1a3 3 0 01-3 3h-1V4h1z"/></Icon>;
export const IconBolt      = IconZap;
export const IconClock     = (p: IP) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>;
export const IconCoin      = (p: IP) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.7-1.5-3-1.5-2 0-3 1-3 2s1 1.7 3 2 3 1 3 2-1 2-3 2c-1.3 0-2.5-.5-3-1.5"/><path d="M12 6v2M12 16v2"/></Icon>;
export const IconWallet    = (p: IP) => <Icon {...p}><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M17 15h.01"/></Icon>;
export const IconGlobe     = (p: IP) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></Icon>;
export const IconEye       = (p: IP) => <Icon {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></Icon>;
export const IconAlert     = (p: IP) => <Icon {...p}><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/></Icon>;
export const IconBadge     = (p: IP) => <Icon {...p}><circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/></Icon>;
export const IconArrowUpRight = (p: IP) => <Icon {...p}><path d="M7 17L17 7M7 7h10v10"/></Icon>;
