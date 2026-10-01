import { TrendChart } from "@/components/visor/trend-chart";

export function formatValue(value: number, digits: number) {
  return value.toFixed(digits);
}

export function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  return (
    <TrendChart
      className={className}
      series={[{ id: "value", values, color: "currentColor" }]}
    />
  );
}
