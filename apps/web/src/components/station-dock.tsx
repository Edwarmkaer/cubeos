"use client";

import { usePathname } from "next/navigation";

import { FloatingDock } from "@cubeos/ui";
import { stationNav } from "@/components/station-nav";

export function StationDock() {
  const pathname = usePathname();

  return (
    <div className="relative h-full w-full">
      <FloatingDock
        items={stationNav.map((item) => {
          return {
            title: item.label,
            href: item.href,
            active: pathname.startsWith(item.href),
            icon: <item.icon className="size-full" stroke={1.7} />,
          };
        })}
      />
    </div>
  );
}
