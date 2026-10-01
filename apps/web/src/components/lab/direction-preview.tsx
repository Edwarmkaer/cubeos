"use client";

import Image from "next/image";
import { ArrowRight, Box, Compass, Satellite } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

import { type DirectionId, themes } from "./directions";

const STARS = Array.from({ length: 56 }, (_, i) => ({
  left: `${(i * 47) % 100}%`,
  top: `${(i * 29) % 100}%`,
  size: 1 + (i % 3),
  opacity: 0.2 + (i % 5) * 0.12,
}));

const regions = [
  { title: "Orientación", reading: "—", unit: "roll / pitch / yaw" },
  { title: "Ambiente", reading: "—", unit: "°C · UV · HR" },
  { title: "Posición", reading: "—", unit: "lat / lon / alt" },
];

function QuietOrbit({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <div className={cn("relative grid place-items-center", className)}>
      {[1, 2, 3].map((ring) => (
        <motion.span
          key={ring}
          className="absolute rounded-full border border-white/12"
          style={{
            width: `${6 + ring * 4}rem`,
            height: `${6 + ring * 4}rem`,
          }}
          animate={reduce ? undefined : { rotate: ring % 2 === 0 ? 360 : -360 }}
          transition={
            reduce
              ? undefined
              : {
                  duration: 22 + ring * 10,
                  repeat: Infinity,
                  ease: "linear",
                }
          }
        >
          {ring === 2 ? (
            <span className="absolute top-0 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 bg-foreground" />
          ) : null}
        </motion.span>
      ))}
      <span className="relative size-3 bg-foreground/80" />
    </div>
  );
}

function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.11] mix-blend-overlay"
      style={{
        backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
          `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`
        )}")`,
      }}
    />
  );
}

function Stars() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {STARS.map((star, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
          }}
        />
      ))}
    </div>
  );
}

function LabHeader({
  id,
  onPhoto,
}: {
  id: DirectionId;
  onPhoto?: boolean;
}) {
  return (
    <header
      className={cn(
        "relative z-10 flex items-center justify-between gap-4 px-6 py-4",
        id === "tinta" && "border-b border-white/8",
        id === "carta" && "border-b border-white/8"
      )}
    >
      <div className="flex items-center gap-3">
        <Image
          src="/chasqui-ii-logo.png"
          alt="CHASQUI-II"
          width={36}
          height={36}
          className="size-9"
        />
        <span className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight">CubeOS</span>
          <span className="mt-1 text-[11px] text-[color:var(--muted)]">
            CHASQUI-II · UNI
          </span>
        </span>
      </div>
      <nav className="hidden items-center gap-6 text-sm text-[color:var(--muted)] sm:flex">
        <span className="text-foreground">Inicio</span>
        <span>Visor</span>
        <span>Equipo</span>
      </nav>
      <p
        className={cn(
          "font-mono text-[11px] tracking-wide text-[color:var(--muted)]",
          onPhoto && "text-white/70"
        )}
      >
        Simulado
      </p>
    </header>
  );
}

function LandingCopy({
  id,
  stacked,
}: {
  id: DirectionId;
  stacked?: boolean;
}) {
  const ctaClass =
    id === "pozo"
      ? "inline-flex h-10 items-center gap-2 text-sm font-medium"
      : "inline-flex h-10 items-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-[color:var(--primary-foreground)]";

  return (
    <div className={cn("max-w-xl", stacked && "relative z-10")}>
      <p className="font-mono text-[11px] tracking-[0.22em] text-[color:var(--muted)] uppercase">
        Universidad Nacional de Ingeniería
      </p>
      <h2
        className={cn(
          "mt-5 text-balance font-semibold tracking-tight",
          id === "limbo" ? "text-5xl sm:text-6xl" : "text-4xl sm:text-5xl"
        )}
      >
        Estación terrena para leer el CubeSat
      </h2>
      <p className="mt-5 max-w-prose text-base leading-7 text-[color:var(--muted)]">
        CubeOS muestra orientación, ambiente y posición en el navegador. Lo
        construye el grupo CHASQUI-II. No envía comandos al satélite.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-5">
        <span className={ctaClass}>
          Entrar al Visor
          {id === "pozo" ? <ArrowRight className="size-4" /> : null}
        </span>
        <span className="text-sm text-[color:var(--muted)]">Ver el Equipo</span>
      </div>
    </div>
  );
}

function VisorTinta() {
  return (
    <div className="flex min-h-[22rem] flex-1">
      <aside className="flex w-14 flex-col items-center gap-4 py-5">
        <Satellite className="size-4 text-foreground" />
        <Box className="size-4 text-[color:var(--muted)]" />
        <Compass className="size-4 text-[color:var(--muted)]" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col px-6 py-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-sm font-medium">Visor</h3>
          <p className="font-mono text-[11px] text-[color:var(--muted)]">
            2026-09-02T18:00:00Z
          </p>
        </div>
        <div className="mt-8 grid gap-10 sm:grid-cols-3">
          {regions.map((region) => (
            <section key={region.title}>
              <p className="font-mono text-[11px] tracking-wide text-[color:var(--muted)] uppercase">
                {region.unit}
              </p>
              <p className="mt-3 font-mono text-3xl tracking-tight">
                {region.reading}
              </p>
              <p className="mt-2 text-sm">{region.title}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function VisorPozo() {
  return (
    <div className="flex min-h-[22rem] flex-1 gap-3 p-3">
      <aside className="flex w-14 flex-col items-center gap-2 rounded-md bg-[color:var(--well)] py-4">
        <span className="grid size-9 place-items-center rounded-md bg-foreground text-[color:var(--primary-foreground)]">
          <Satellite className="size-4" />
        </span>
        <span className="grid size-9 place-items-center text-[color:var(--muted)]">
          <Box className="size-4" />
        </span>
        <span className="grid size-9 place-items-center text-[color:var(--muted)]">
          <Compass className="size-4" />
        </span>
      </aside>
      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-3">
        {regions.map((region) => (
          <section
            key={region.title}
            className="flex flex-col justify-between rounded-md bg-[color:var(--well)] px-5 py-5"
          >
            <p className="text-sm text-[color:var(--muted)]">{region.title}</p>
            <div>
              <p className="font-mono text-3xl tracking-tight">{region.reading}</p>
              <p className="mt-2 font-mono text-[11px] text-[color:var(--muted)]">
                {region.unit}
              </p>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function VisorCarta() {
  return (
    <div className="relative flex min-h-[22rem] flex-1">
      <div className="absolute top-5 bottom-5 left-6 w-px bg-white/12" />
      <div className="flex min-w-0 flex-1 flex-col py-5 pr-6 pl-10">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-sm font-medium">Visor</h3>
          <p className="font-mono text-[11px] text-[color:var(--muted)]">
            Simulado · 18:00:00Z
          </p>
        </div>
        <ol className="mt-8 space-y-0">
          {regions.map((region) => (
            <li
              key={region.title}
              className="grid grid-cols-[1fr_auto] items-baseline gap-4 border-t border-white/8 py-4"
            >
              <span>{region.title}</span>
              <span className="font-mono text-sm text-[color:var(--muted)]">
                {region.unit}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function DirectionPreview({ id }: { id: DirectionId }) {
  const theme = themes[id];

  return (
    <div
      className="min-h-full"
      style={
        {
          background: theme.background,
          color: theme.foreground,
          "--background": theme.background,
          "--foreground": theme.foreground,
          "--surface": theme.surface,
          "--muted": theme.muted,
          "--primary": theme.primary,
          "--primary-foreground": theme.primaryForeground,
          "--well": theme.well,
          "--color-background": theme.background,
          "--color-foreground": theme.foreground,
        } as React.CSSProperties
      }
    >
      <section className="relative isolate min-h-[min(70vh,40rem)] overflow-hidden">
        {id === "tinta" ? <Grain /> : null}
        {id === "carta" ? <Stars /> : null}
        {id === "pozo" ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 50% at 50% -10%, rgb(255 255 255 / 0.06), transparent 55%)",
            }}
          />
        ) : null}
        {id === "limbo" ? (
          <>
            <Image
              src="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1600&q=80"
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
            />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg, rgb(4 4 6 / 0.92) 0%, rgb(4 4 6 / 0.55) 48%, rgb(4 4 6 / 0.15) 100%)",
              }}
            />
          </>
        ) : null}

        <LabHeader id={id} onPhoto={id === "limbo"} />

        <div
          className={cn(
            "relative z-10 mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-16 lg:px-10",
            id !== "limbo" && "lg:grid-cols-[minmax(0,1fr)_18rem]"
          )}
        >
          <LandingCopy id={id} stacked={id === "limbo"} />
          {id === "carta" ? (
            <QuietOrbit className="mx-auto hidden h-72 w-72 lg:grid" />
          ) : null}
          {id === "tinta" ? (
            <QuietOrbit className="mx-auto hidden h-64 w-64 opacity-70 lg:grid" />
          ) : null}
        </div>
      </section>

      <section className="relative">
        {id === "tinta" ? (
          <div className="mx-6 border-t border-white/8" />
        ) : null}
        {id === "tinta" || id === "limbo" ? <VisorTinta /> : null}
        {id === "pozo" ? <VisorPozo /> : null}
        {id === "carta" ? <VisorCarta /> : null}
      </section>
    </div>
  );
}
