import { AppShell } from "@/components/app-shell";
import { ConstructionView } from "@/components/construction-view";

export default function ConstruccionPage() {
  return (
    <AppShell>
      <h1 className="sr-only">Construcción del CubeSat</h1>
      <ConstructionView />
    </AppShell>
  );
}
