type TrendSeries = {
  id: string;
  values: number[];
  color: string;
};

export function TrendChart({
  series,
  className,
}: {
  series: TrendSeries[];
  className?: string;
}) {
  const paths = series
    .filter(({ values }) => values.length > 1)
    .map(({ id, values, color }) => {
      const points = toNormalizedPoints(values);

      return {
        id,
        color,
        path: buildSmoothPath(points),
      };
    });

  return (
    <svg
      className={className}
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      aria-hidden
    >
      {paths.map(({ id, color, path }) => (
        <path
          key={id}
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

type Point = { x: number; y: number };

function toNormalizedPoints(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  return values.map((value, index) => ({
    x: (index / (values.length - 1)) * 100,
    y: 22 - ((value - min) / span) * 20,
  }));
}

function buildSmoothPath(points: Point[]) {
  const clampY = (value: number) => Math.max(1, Math.min(23, value));
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const following = points[index + 2] ?? next;
    const controlAX = current.x + (next.x - previous.x) / 6;
    const controlAY = clampY(current.y + (next.y - previous.y) / 6);
    const controlBX = next.x - (following.x - current.x) / 6;
    const controlBY = clampY(next.y - (following.y - current.y) / 6);

    path += ` C ${controlAX.toFixed(2)} ${controlAY.toFixed(2)}, ${controlBX.toFixed(2)} ${controlBY.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }

  return path;
}
