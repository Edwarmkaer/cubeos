import type { ComponentType } from "react";
import {
  IconAdjustmentsHorizontal,
  IconCube,
  IconLayoutDashboard,
} from "@tabler/icons-react";

type StationIcon = ComponentType<{
  className?: string;
  stroke?: number;
}>;

export const publicNav = [
  { href: "/", label: "Inicio" },
  { href: "/visor", label: "Visor" },
  { href: "/equipo", label: "Equipo" },
] as const;

export const stationNav: {
  href: string;
  label: string;
  description: string;
  icon: StationIcon;
}[] = [
  {
    href: "/visor",
    label: "Visor",
    description: "Tablero de telemetría",
    icon: IconLayoutDashboard,
  },
  {
    href: "/construccion",
    label: "Construcción",
    description: "Armazón y pasos",
    icon: IconCube,
  },
  {
    href: "/configuracion",
    label: "Configuración",
    description: "Fuente de datos",
    icon: IconAdjustmentsHorizontal,
  },
];

export function isAppPath(pathname: string) {
  return (
    pathname.startsWith("/visor") ||
    pathname.startsWith("/construccion") ||
    pathname.startsWith("/configuracion")
  );
}

export function stationTitle(pathname: string) {
  return (
    stationNav.find((item) => pathname.startsWith(item.href))?.label ?? "Visor"
  );
}

export function isPublicActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  if (href === "/visor") return isAppPath(pathname);
  return pathname.startsWith(href);
}
