"use client";

import { Lamp } from "@/components/landing-atmosphere";
import { Reveal } from "@/components/reveal";

const seats = [
  "Coordinación",
  "Estación terrena",
  "Estructura 1U",
  "Sensores",
];

export default function EquipoPage() {
  return (
    <main className="relative isolate flex flex-1 flex-col overflow-hidden">
      <Lamp />
      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 py-16 lg:px-10">
        <Reveal>
          <p className="text-sm font-medium tracking-[0.14em] text-muted-foreground uppercase">
            CHASQUI-II
          </p>
        </Reveal>
        <Reveal delay={0.08}>
          <h1 className="mt-5 max-w-3xl text-balance font-display text-[clamp(2.75rem,6vw,4.5rem)] leading-[1.1] font-semibold tracking-[-0.02em]">
            Las personas del proyecto
          </h1>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="mt-6 max-w-[40rem] text-lg leading-8 text-muted-foreground">
            Esta página guarda el lugar de cada integrante. Los nombres reales se
            cargan cuando el grupo los entregue; no se inventan.
          </p>
        </Reveal>
        <ul className="mt-12 max-w-xl space-y-3">
          {seats.map((seat, i) => (
            <Reveal key={seat} delay={0.22 + i * 0.05}>
              <li className="flex items-baseline justify-between gap-6 rounded-md bg-well px-5 py-5">
                <p className="text-xl font-medium">Por confirmar</p>
                <p className="text-sm text-muted-foreground">{seat}</p>
              </li>
            </Reveal>
          ))}
        </ul>
      </section>
    </main>
  );
}
