"use client";

import Link from "next/link";
import { IconLayoutNavbarCollapse } from "@tabler/icons-react";
import {
  AnimatePresence,
  motion,
  type MotionValue,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type FloatingDockItem = {
  title: string;
  icon: ReactNode;
  href: string;
  active?: boolean;
};

export function FloatingDock({
  items,
  desktopClassName,
  mobileClassName,
}: {
  items: FloatingDockItem[];
  desktopClassName?: string;
  mobileClassName?: string;
}) {
  return (
    <>
      <FloatingDockDesktop items={items} className={desktopClassName} />
      <FloatingDockMobile items={items} className={mobileClassName} />
    </>
  );
}

function FloatingDockMobile({
  items,
  className,
}: {
  items: FloatingDockItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "pointer-events-auto fixed bottom-4 left-4 z-30 block md:hidden",
        className
      )}
    >
      <AnimatePresence>
        {open ? (
          <motion.div
            layoutId="station-nav"
            className="absolute inset-x-0 bottom-full mb-2 flex flex-col gap-2"
          >
            {items.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  y: 10,
                  transition: { delay: index * 0.05 },
                }}
                transition={{ delay: (items.length - 1 - index) * 0.05 }}
              >
                <Link
                  href={item.href}
                  aria-label={item.title}
                  aria-current={item.active ? "page" : undefined}
                  className={cn(
                    "flex size-10 items-center justify-center rounded-lg bg-surface text-muted-foreground",
                    item.active && "bg-foreground text-primary-foreground"
                  )}
                >
                  <span className="size-5">{item.icon}</span>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Cerrar navegación" : "Abrir navegación"}
        aria-expanded={open}
        className="flex size-10 items-center justify-center rounded-lg bg-surface text-muted-foreground"
      >
        <IconLayoutNavbarCollapse className="size-5" />
      </button>
    </div>
  );
}

function FloatingDockDesktop({
  items,
  className,
}: {
  items: FloatingDockItem[];
  className?: string;
}) {
  const mouseY = useMotionValue(Infinity);
  const reducedMotion = useReducedMotion();

  return (
    <motion.nav
      onMouseMove={(event) => mouseY.set(event.pageY)}
      onMouseLeave={() => mouseY.set(Infinity)}
      aria-label="Estación"
      className={cn(
        "pointer-events-auto absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-xl bg-well px-2 py-4 md:flex",
        className
      )}
    >
      {items.map((item) => (
        <IconContainer
          key={item.title}
          mouseY={mouseY}
          reducedMotion={Boolean(reducedMotion)}
          {...item}
        />
      ))}
    </motion.nav>
  );
}

function IconContainer({
  mouseY,
  title,
  icon,
  href,
  active = false,
  reducedMotion,
}: FloatingDockItem & {
  mouseY: MotionValue<number>;
  reducedMotion: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const distance = useTransform(mouseY, (value) => {
    const bounds = ref.current?.getBoundingClientRect() ?? {
      y: 0,
      height: 0,
    };
    return value - bounds.y - bounds.height / 2;
  });

  const sizeTarget = useTransform(
    distance,
    [-120, 0, 120],
    reducedMotion ? [44, 44, 44] : [44, 58, 44]
  );
  const iconTarget = useTransform(
    distance,
    [-120, 0, 120],
    reducedMotion ? [20, 20, 20] : [20, 28, 20]
  );
  const size = useSpring(sizeTarget, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  const iconSize = useSpring(iconTarget, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  return (
    <Link
      href={href}
      aria-label={title}
      aria-current={active ? "page" : undefined}
    >
      <motion.div
        ref={ref}
        style={{ width: size, height: size }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "relative flex aspect-square items-center justify-center rounded-lg bg-surface text-muted-foreground",
          active && "bg-foreground text-primary-foreground"
        )}
      >
        <AnimatePresence>
          {hovered ? (
            <motion.span
              initial={{ opacity: 0, x: 2, y: "-50%" }}
              animate={{ opacity: 1, x: 10, y: "-50%" }}
              exit={{ opacity: 0, x: 2, y: "-50%" }}
              className="absolute top-1/2 left-full w-fit whitespace-pre rounded-md bg-surface px-2 py-0.5 text-xs text-foreground"
            >
              {title}
            </motion.span>
          ) : null}
        </AnimatePresence>
        <motion.span
          style={{ width: iconSize, height: iconSize }}
          className="flex items-center justify-center [&_svg]:size-full"
        >
          {icon}
        </motion.span>
      </motion.div>
    </Link>
  );
}

export default FloatingDock;
