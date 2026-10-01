"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal } from "@/components/reveal";

export function LandingHero() {
  return (
    <div className="max-w-3xl">
      <Reveal>
        <p className="text-sm font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Universidad Nacional de Ingeniería
        </p>
      </Reveal>
      <Reveal delay={0.08}>
        <h1 className="mt-6 text-balance font-display text-[clamp(3rem,7vw,5.25rem)] leading-[1.08] font-semibold tracking-[-0.02em]">
          Estación terrena para leer el CubeSat
        </h1>
      </Reveal>
      <Reveal delay={0.16}>
        <p className="mt-7 max-w-[40rem] text-lg leading-8 text-muted-foreground">
          CubeOS muestra orientación, ambiente y posición en el navegador. Lo
          construye el grupo CHASQUI-II. No envía comandos al satélite.
        </p>
      </Reveal>
      <Reveal delay={0.24}>
        <div className="mt-10 flex flex-wrap items-center gap-8">
          <Link
            href="/visor"
            className="pointer-events-auto group inline-flex items-center gap-2 text-lg font-medium"
          >
            Entrar al Visor
            <ArrowRight className="size-5 transition-transform duration-200 ease-out group-hover:translate-x-1" />
          </Link>
          <Link
            href="/equipo"
            className="pointer-events-auto text-lg text-muted-foreground transition-colors hover:text-foreground"
          >
            Ver el Equipo
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
