export const PULSE_CHART_COLORS = {
  accent: "oklch(0.544 0.1704 253.5)",
  success: "oklch(0.7329 0.1935 150.81)",
  danger: "oklch(0.6532 0.2328 25.74)",
  warning: "oklch(0.7819 0.1585 72.33)",
  muted: "oklch(0.5517 0 253.83)",
  series: [
    "oklch(0.544 0.1704 253.5)",
    "oklch(0.7329 0.1935 150.81)",
    "oklch(0.6532 0.2328 25.74)",
    "oklch(0.7819 0.1585 72.33)",
    "oklch(0.55 0.15 300)",
  ],
} as const

export const CHART_CONTAINER_CLASS =
  "aspect-auto h-[280px] w-full min-h-[280px] [&_.recharts-surface]:outline-none"

export const CHART_CONTAINER_SM_CLASS =
  "aspect-auto h-[220px] w-full min-h-[220px] [&_.recharts-surface]:outline-none"
