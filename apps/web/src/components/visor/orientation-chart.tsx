import type { TelemetrySample } from "@cubeos/telemetry";

import { formatValue } from "@/components/visor/sparkline";
import { TrendChart } from "@/components/visor/trend-chart";

const axes = [
  {
    label: "Roll",
    key: "gyro_roll",
    color: "var(--chart-roll)",
  },
  {
    label: "Pitch",
    key: "gyro_pitch",
    color: "var(--chart-pitch)",
  },
  {
    label: "Yaw",
    key: "gyro_yaw",
    color: "var(--chart-yaw)",
  },
] as const;

export function OrientationChart({
  sample,
  history,
}: {
  sample: TelemetrySample;
  history: TelemetrySample[];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <dl className="grid grid-cols-3 gap-4 text-center">
        {axes.map(({ label, key, color }) => (
          <div key={key} className="min-w-0">
            <dt className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: color }}
                aria-hidden
              />
              {label}
            </dt>
            <dd className="mt-0.5 truncate font-mono text-lg tabular-nums">
              {formatValue(sample[key], 1)}°
            </dd>
          </div>
        ))}
      </dl>
      <TrendChart
        className="mt-3 min-h-0 w-full flex-1 text-foreground"
        series={axes.map(({ key, color }) => ({
          id: key,
          color,
          values: history.map((row) => row[key]),
        }))}
      />
    </div>
  );
}
