import { Tile } from "@/components/visor/tile";

export function SettingsView() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <Tile title="Fuente de datos" className="h-full">
        <dl className="max-w-md space-y-5">
          <div>
            <dt className="text-sm text-muted-foreground">Origen</dt>
            <dd className="text-lg">Simulador</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Cadencia</dt>
            <dd className="font-mono text-lg">2 Hz</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">WebSocket</dt>
            <dd className="text-lg text-muted-foreground">
              Se define con D-006. No se rellena por comodidad.
            </dd>
          </div>
        </dl>
      </Tile>
    </div>
  );
}
