"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { DirectionPreview } from "@/components/lab/direction-preview";
import { type DirectionId, directions } from "@/components/lab/directions";
import { cn } from "@/lib/utils";

function isDirection(value: string | null): value is DirectionId {
  return directions.some((item) => item.id === value);
}

function LabExplorer() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("d");
  const id: DirectionId = isDirection(raw) ? raw : "tinta";
  const current = directions.find((item) => item.id === id)!;

  return (
    <div className="relative min-h-svh bg-[#08080C] text-[#ECEAF2]">
      <div className="sticky top-0 z-30 border-b border-white/8 bg-[#08080C]/90 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[11px] tracking-wide text-white/50 uppercase">
              Exploración · no es el producto
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {directions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => router.replace(`/lab?d=${item.id}`)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm",
                    id === item.id
                      ? "bg-white text-[#08080C]"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>
          <p className="max-w-sm text-sm text-white/60">
            {current.claim} {current.how}{" "}
            <Link href="/" className="text-white underline-offset-4 hover:underline">
              Volver a lo actual
            </Link>
          </p>
        </div>
      </div>
      <DirectionPreview id={id} />
    </div>
  );
}

export default function LabPage() {
  return (
    <Suspense>
      <LabExplorer />
    </Suspense>
  );
}

