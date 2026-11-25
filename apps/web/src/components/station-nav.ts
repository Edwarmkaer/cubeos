import type { ComponentType } from "react";
import {
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
  { href: "/construccion", label: "Armado" },
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
    label: "Armado",
    description: "Modelo 3D paso a paso",
    icon: IconCube,
  },
];

export function isAppPath(pathname: string) {
  return (
    pathname.startsWith("/visor") ||
    pathname.startsWith("/construccion")
  );
}

export function stationTitle(pathname: string) {
  return (
    stationNav.find((item) => pathname.startsWith(item.href))?.label ?? "Visor"
  );
}

export function isPublicActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}
