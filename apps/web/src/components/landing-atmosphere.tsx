"use client";

import { useReducedMotion } from "motion/react";

import Galaxy from "@/components/Galaxy";

export function Lamp() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(ellipse 80% 50% at 50% -10%, rgb(255 255 255 / 0.06), transparent 55%)",
      }}
    />
  );
}

export function GalaxyBackground() {
  const reducedMotion = useReducedMotion();

  return (
    <div
      aria-hidden
      className="pointer-events-auto absolute inset-0 opacity-50"
    >
      <Galaxy
        density={0.8}
        hueShift={225}
        saturation={0.05}
        glowIntensity={0.2}
        twinkleIntensity={0.2}
        speed={0.9}
        mouseInteraction={!reducedMotion}
        mouseRepulsion
        repulsionStrength={2}
        disableAnimation={Boolean(reducedMotion)}
        transparent
      />
    </div>
  );
}
