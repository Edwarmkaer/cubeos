import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AnimatedCircularProgressBarProps = {
  value?: number;
  className?: string;
  gaugePrimaryColor?: string;
  gaugeSecondaryColor?: string;
  children?: ReactNode;
  label: string;
};

export function AnimatedCircularProgressBar({
  value,
  className,
  gaugePrimaryColor = "var(--chart-roll)",
  gaugeSecondaryColor = "rgb(232 232 240 / 0.1)",
  children,
  label,
}: AnimatedCircularProgressBarProps) {
  const normalizedValue = Number.isFinite(value)
    ? Math.min(100, Math.max(0, value ?? 0))
    : 0;
  const circumference = 2 * Math.PI * 45;
  const dash = (normalizedValue / 100) * circumference;
  const trackDash =
    (Math.max(0, 90 - normalizedValue) / 100) * circumference;

  return (
    <div
      className={cn("relative grid size-20 shrink-0 place-items-center", className)}
      role="img"
      aria-label={label}
    >
      <svg
        aria-hidden
        className="absolute inset-0 size-full -rotate-90"
        fill="none"
        viewBox="0 0 100 100"
      >
        <circle
          cx="50"
          cy="50"
          r="45"
          stroke={gaugeSecondaryColor}
          strokeDasharray={`${trackDash} ${circumference}`}
          strokeDashoffset={-dash}
          strokeLinecap="round"
          strokeWidth="9"
        />
        {Number.isFinite(value) ? (
          <circle
            cx="50"
            cy="50"
            r="45"
            stroke={gaugePrimaryColor}
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            strokeWidth="9"
            className="transition-[stroke-dasharray] duration-700 ease-out"
          />
        ) : null}
      </svg>
      <span className="relative font-mono text-base font-medium tabular-nums text-foreground">
        {children ?? `${Math.round(normalizedValue)}%`}
      </span>
    </div>
  );
}
