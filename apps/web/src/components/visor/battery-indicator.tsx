import { AnimatedCircularProgressBar } from "@/components/magicui/animated-circular-progress-bar";

export function BatteryIndicator({
  voltage,
  levelPercent,
  demo = false,
}: {
  voltage?: number;
  levelPercent?: number;
  demo?: boolean;
}) {
  const hasVoltage = Number.isFinite(voltage);
  const hasLevel = Number.isFinite(levelPercent);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1">
      <AnimatedCircularProgressBar
        value={hasLevel ? levelPercent : undefined}
        label={
          hasLevel
            ? `Nivel de batería: ${Math.round(levelPercent ?? 0)} por ciento`
            : "Nivel de batería pendiente de calibración"
        }
      >
        {hasLevel ? Math.round(levelPercent ?? 0) : "—"}
      </AnimatedCircularProgressBar>
      <p className="font-mono text-sm tabular-nums text-muted-foreground">
        {hasVoltage ? `${voltage?.toFixed(2)} V` : "— V"}
        {demo ? <span className="ml-1 text-[10px]">· prueba</span> : null}
      </p>
    </div>
  );
}
