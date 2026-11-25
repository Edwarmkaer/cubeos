import { AppShell } from "@/components/app-shell";
import { ConnectView } from "@/components/connect-view";

export default function ConectarPage() {
  return (
    <AppShell>
      <h1 className="sr-only">Conectar fuente de datos</h1>
      <ConnectView />
    </AppShell>
  );
}
