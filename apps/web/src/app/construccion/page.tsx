import { AppShell } from "@/components/app-shell";
import { AssemblyPage } from "@/components/assembly/assembly-page";

export default function ConstruccionPage() {
  return (
    <AppShell>
      <h1 className="sr-only">Armado 3D</h1>
      <AssemblyPage />
    </AppShell>
  );
}
