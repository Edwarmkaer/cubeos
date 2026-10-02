"use client";

import Image from "next/image";
import { useRef, useState } from "react";

export type CameraFrame = {
  id: string;
  src: string;
  alt: string;
  label?: string;
  timestamp?: string;
};

export function CameraGallery({ frames, onSelect, onNearEnd }: { frames: CameraFrame[]; onSelect?: (id: string) => void; onNearEnd?: () => void }) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const isScrollable = frames.length > 3;

  function updateActiveFrame() {
    if (!isScrollable) return;
    const strip = stripRef.current;
    if (!strip) return;
    if (strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 240) onNearEnd?.();
    const center = strip.scrollLeft + strip.clientWidth / 2;
    const cards = Array.from(strip.children[0]?.children ?? []) as HTMLElement[];
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((card, index) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const distance = Math.abs(center - cardCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    setActiveIndex(closestIndex);
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!isScrollable) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.currentTarget.scrollLeft += event.deltaY;
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!isScrollable) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    event.currentTarget.scrollBy({
      left: direction * event.currentTarget.clientWidth * 0.32,
      behavior: "smooth",
    });
  }

  if (frames.length === 0) {
    return (
      <div
        className="grid min-h-0 flex-1 place-items-center bg-surface/20"
        role="status"
      >
        <p className="text-sm text-muted-foreground">
          Esperando capturas de cámara
        </p>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={stripRef}
        aria-label={
          isScrollable
            ? "Galería de capturas desplazable"
            : "Galería de capturas"
        }
        className={`camera-circular-strip h-full overflow-y-hidden ${
          isScrollable
            ? "snap-x snap-mandatory overflow-x-auto scroll-smooth"
            : "overflow-x-hidden"
        }`}
        onKeyDown={handleKeyDown}
        onScroll={updateActiveFrame}
        onWheel={handleWheel}
        role="region"
        tabIndex={0}
      >
        <div
          className={isScrollable ? "flex h-full min-w-max items-center gap-2 py-1" : "grid h-full gap-2 py-1"}
          style={
            isScrollable
              ? { paddingInline: "calc(50% - 5.5rem)" }
              : { gridTemplateColumns: `repeat(${frames.length}, minmax(0, 1fr))` }
          }
        >
          {frames.map((frame, index) => {
            const offset = isScrollable
              ? Math.max(-2, Math.min(2, index - activeIndex))
              : 0;
            const distance = Math.abs(offset);

            return (
              <figure
                key={frame.id}
                className={`camera-circular-card relative h-[calc(100%-0.5rem)] min-w-0 overflow-hidden rounded-md bg-surface ${
                  isScrollable ? "w-44 shrink-0 snap-center" : "w-full"
                }`}
                style={{
                  transform: `translateY(${distance * 4}px) rotateY(${offset * -3}deg) scale(${1 - distance * 0.035})`,
                  opacity: 1 - distance * 0.16,
                }}
              >
                <Image
                  src={frame.src}
                  alt={frame.alt}
                  fill
                  unoptimized
                  sizes="176px"
                  className="object-cover"
                />
                {onSelect ? <button type="button" aria-label={`Descargar captura original ${index + 1}`} className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground" onClick={() => onSelect(frame.id)} /> : null}
              </figure>
            );
          })}
        </div>
      </div>
    </div>
  );
}
