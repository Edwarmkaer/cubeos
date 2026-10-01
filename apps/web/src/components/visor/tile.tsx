import { cn } from "@/lib/utils";

export function Tile({
  title,
  children,
  className,
}: {
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md bg-well px-4 py-3",
        className
      )}
    >
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="mt-2 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export function PendingNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-auto text-sm text-muted-foreground">{children}</p>
  );
}
