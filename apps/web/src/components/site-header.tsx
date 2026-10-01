"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  isAppPath,
  isPublicActive,
  publicNav,
  stationTitle,
} from "@/components/station-nav";
import { useTelemetryStore } from "@/lib/telemetry-store";
import { cn } from "@/lib/utils";

const connectionLabels = {
  simulated: "Simulado",
  connecting: "Conectando",
  connected: "Conectado",
  disconnected: "Desconectado",
  error: "Error",
} as const;

export function SiteHeader() {
  const pathname = usePathname();
  const connection = useTelemetryStore((state) => state.connection);
  const appPath = isAppPath(pathname);

  if (pathname.startsWith("/lab")) {
    return null;
  }

  return (
    <header className="relative z-20 grid h-16 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 px-3 md:grid-cols-[1fr_auto_1fr] md:px-6 lg:px-10">
      <Link
        href="/"
        className="min-w-0 justify-self-start font-display text-2xl leading-none font-semibold tracking-[-0.02em] md:text-3xl"
      >
        CubeOS
      </Link>
      <nav
        aria-label="Principal"
        className="flex items-center justify-self-center text-sm md:gap-1 md:text-base"
      >
        {publicNav.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isPublicActive(link.href, pathname) ? "page" : undefined}
            className={cn(
              "rounded-md px-2 py-2 text-muted-foreground transition-colors hover:bg-well hover:text-foreground md:px-3",
              isPublicActive(link.href, pathname) && "bg-well text-foreground"
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {appPath ? (
        <p
          className="flex items-center gap-2 justify-self-end text-xs text-muted-foreground md:text-sm"
          role="status"
          aria-live="polite"
        >
          <span className="hidden md:inline">{stationTitle(pathname)}</span>
          <span aria-hidden className="hidden md:inline">
            ·
          </span>
          <span aria-hidden className="size-1.5 rounded-full bg-muted" />
          <span>{connectionLabels[connection]}</span>
        </p>
      ) : (
        <span aria-hidden />
      )}
    </header>
  );
}
