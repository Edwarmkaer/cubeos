import { AppShell } from "@/components/app-shell";
import { SettingsView } from "@/components/settings-view";

export default function ConfiguracionPage() {
  return (
    <AppShell>
      <h1 className="sr-only">Configuración de la fuente de telemetría</h1>
      <SettingsView />
    </AppShell>
  );
}
