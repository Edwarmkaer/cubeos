# Cliente CubeOS

`APIClient` consume REST tipado y SSE con fetch. Contrato y operación:
[realtime](../../docs/realtime.md), [visor](../../docs/visor-telemetry.md) y
[construcción](../../docs/construction-progress.md).

```ts
import { APIClient } from "@cubeos/api-client";

const api = new APIClient("http://127.0.0.1:8080");
const controller = new AbortController();
await api.subscribeTelemetry(deviceId, {
  getToken: () => null, // perfil local offline
  onSnapshot: event => consume(event.snapshot, event.freshnessByGroup),
  onConnection: state => showAPIConnection(state),
  signal: controller.signal,
});
```

El consumidor aborta al cambiar sesión/dispositivo o desmontarse. Los errores
terminales rechazan la promesa; cancelación la resuelve y emite `closed`.
`revisionId` conserva int64 exacto; `revision` retiene el tipo number del contrato
original. REST ofrece dispositivos, fuentes, snapshot e historial paginado;
solo snapshot/SSE se validan semánticamente en runtime, otras rutas tienen tipos
estáticos y validación JSON/Content-Type/límite de tamaño. No incorpora Clerk.
