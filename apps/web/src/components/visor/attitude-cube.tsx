"use client";

import { cn } from "@/lib/utils";

const FACES = [
  { label: "+Z", transform: "rotateY(0deg) translateZ(DEPTH)" },
  { label: "-Z", transform: "rotateY(180deg) translateZ(DEPTH)" },
  { label: "+X", transform: "rotateY(90deg) translateZ(DEPTH)" },
  { label: "-X", transform: "rotateY(-90deg) translateZ(DEPTH)" },
  { label: "+Y", transform: "rotateX(90deg) translateZ(DEPTH)" },
  { label: "-Y", transform: "rotateX(-90deg) translateZ(DEPTH)" },
];

export function AttitudeCube({
  roll,
  pitch,
  yaw,
  large = false,
  className,
}: {
  roll: number;
  pitch: number;
  yaw: number;
  large?: boolean;
  className?: string;
}) {
  const depth = large ? "4.5rem" : "2.5rem";
  const faces = FACES.map((face) => ({
    ...face,
    transform: face.transform.replace("DEPTH", depth),
  }));

  return (
    <div
      className={cn(
        "grid min-h-0 flex-1 place-items-center [perspective:900px]",
        className
      )}
    >
      <div
        className={cn(
          "relative [transform-style:preserve-3d] transition-transform duration-200 ease-out",
          large ? "size-36" : "size-20"
        )}
        style={{
          transform: `rotateX(${pitch}deg) rotateY(${yaw}deg) rotateZ(${roll}deg)`,
        }}
      >
        {faces.map((face) => (
          <span
            key={face.label}
            className="absolute inset-0 grid place-items-center bg-surface font-mono text-xs text-foreground/80"
            style={{ transform: face.transform, backfaceVisibility: "hidden" }}
          >
            {face.label}
          </span>
        ))}
      </div>
    </div>
  );
}
