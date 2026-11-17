import Link from "next/link";
import { cn } from "@/lib/utils";

/*
 * The official Globify Tech mark: a graduation cap on a "G" with rising bars
 * and a growth arrow. Generated from the mobile app's
 * src/components/brand/logoGeometry.ts (traced from the master artwork) —
 * regenerate rather than hand-editing the paths.
 */
const P = {
  ring: "M537.5 320.5A155 155 0 1 0 440 596C530 597 600 549 594 470L594 447L525 447L525 483L547 485L547 510C540 524 515 536 490 539A110 110 0 1 1 501.5 349.8Z",
  foldOuter: "M466.9 288.4A155 155 0 0 0 330.4 550.6A163.7 163.7 0 0 1 466.9 288.4Z",
  foldInner: "M381.7 534.3A110 110 0 0 0 524.3 511.7A76.5 76.5 0 0 1 381.7 534.3Z",
  capBand: "M361 264Q434 228 505 259L505 300.3A153 153 0 0 0 361 307.6Z",
  capBoard: "M312 241L432 194L557 235L512 254Q435 222 358 256Z",
  tasselCord: "M320 243L320 270",
  tassel: "M317 270L323 270L328 300L312 300ZM320 263A5 5 0 1 1 320 273A5 5 0 1 1 320 263Z",
  barLow: "M415 450L459 436L459 560L415 560Z",
  barHigh: "M471 408L515 391L515 560L471 560Z",
  arrowGap: "M591.6 391.6C533 476 438 549 316 545L316 556C438 563 533 492 593 407Z",
  arrow: "M316 545C428 514 502 465 572 379.4L556 369L611 342L607 402L591.6 391.6C533 476 438 549 316 545Z",
} as const;

/**
 * Inline so it needs no request. The arrow takes the current text colour
 * (black on light pages, white in dark mode) and the gap under it is cut out,
 * so any background shows through.
 */
export function LogoMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="236 184 420 420" fill="none" aria-hidden className={className}>
      <defs>
        <linearGradient id="gl-ring" gradientUnits="userSpaceOnUse" x1="285" y1="420" x2="598" y2="470">
          <stop offset="0" stopColor="#0B85F8" />
          <stop offset="0.28" stopColor="#0A7EF7" />
          <stop offset="0.5" stopColor="#4F63F4" />
          <stop offset="0.7" stopColor="#7D49F0" />
          <stop offset="1" stopColor="#9427E7" />
        </linearGradient>
        <linearGradient id="gl-foldOuter" gradientUnits="userSpaceOnUse" x1="290" y1="500" x2="470" y2="290">
          <stop offset="0" stopColor="#0A5FE9" />
          <stop offset="0.6" stopColor="#0D5FEC" />
          <stop offset="1" stopColor="#4A55EE" />
        </linearGradient>
        <linearGradient id="gl-foldInner" gradientUnits="userSpaceOnUse" x1="380" y1="560" x2="530" y2="530">
          <stop offset="0" stopColor="#0F74F4" />
          <stop offset="0.35" stopColor="#3049E2" />
          <stop offset="0.7" stopColor="#4A3EDE" />
          <stop offset="1" stopColor="#7434E0" />
        </linearGradient>
        <linearGradient id="gl-capBoard" gradientUnits="userSpaceOnUse" x1="312" y1="220" x2="557" y2="220">
          <stop offset="0" stopColor="#3A7FF3" />
          <stop offset="0.45" stopColor="#11A7F6" />
          <stop offset="0.6" stopColor="#1E98F4" />
          <stop offset="1" stopColor="#6A5AE7" />
        </linearGradient>
        <linearGradient id="gl-capBand" gradientUnits="userSpaceOnUse" x1="361" y1="280" x2="505" y2="280">
          <stop offset="0" stopColor="#2A8CF5" />
          <stop offset="0.5" stopColor="#08A9FA" />
          <stop offset="1" stopColor="#4479FB" />
        </linearGradient>
        <linearGradient id="gl-bars" gradientUnits="userSpaceOnUse" x1="0" y1="392" x2="0" y2="550">
          <stop offset="0" stopColor="#139CF9" />
          <stop offset="1" stopColor="#1F56E4" />
        </linearGradient>
        <clipPath id="gl-ringClip">
          <path d={P.ring} />
        </clipPath>
        <mask id="gl-cut" maskUnits="userSpaceOnUse" x="236" y="184" width="420" height="420">
          <rect x="236" y="184" width="420" height="420" fill="#fff" />
          <path d={P.arrowGap} fill="#000" stroke="#000" strokeWidth={5} strokeLinejoin="round" />
          <path d={P.arrow} fill="#000" stroke="#000" strokeWidth={5} strokeLinejoin="round" />
        </mask>
      </defs>
      <g mask="url(#gl-cut)">
        <path d={P.capBand} fill="url(#gl-capBand)" />
        <path d={P.capBoard} fill="url(#gl-capBoard)" />
        <path d={P.tasselCord} stroke="#5666F7" strokeWidth={2.6} strokeLinecap="round" />
        <path d={P.tassel} fill="#5666F7" />
        <path d={P.barLow} fill="url(#gl-bars)" />
        <path d={P.barHigh} fill="url(#gl-bars)" />
        <path d={P.ring} fill="url(#gl-ring)" />
        <g clipPath="url(#gl-ringClip)">
          <path d={P.foldOuter} fill="url(#gl-foldOuter)" />
          <path d={P.foldInner} fill="url(#gl-foldInner)" />
        </g>
      </g>
      <path d={P.arrow} fill="currentColor" />
    </svg>
  );
}

export function Logo({ className, href = "/", wordmark = true, size = 28 }: { className?: string; href?: string; wordmark?: boolean; size?: number }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight text-fg", className)} aria-label="Globify Tech home">
      <LogoMark size={size} />
      {wordmark ? (
        <span className="text-[17px] leading-none">
          Globify<span className="text-fg-muted"> Tech</span>
        </span>
      ) : null}
    </Link>
  );
}
