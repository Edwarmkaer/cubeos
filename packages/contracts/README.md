# Contratos de telemetría

`@cubeos/contracts` exporta `UplinkV2`, `SnapshotV2`, `ReceivedEnvelopeV1`,
`SnapshotProjectionV2` y los validadores JSON Schema draft 2020-12 de sus fronteras.
AJV valida sin coerción, valores por defecto ni eliminación de claves.
`validate*.errors` contiene causas del último intento; un consumidor debe
copiarlas antes de otra validación. La API Go tendrá su propio validador usando
los mismos esquemas y fixtures.

```bash
pnpm --filter @cubeos/contracts test
pnpm --filter @cubeos/contracts typecheck
```

Unidades y políticas: [telemetría](../../docs/telemetry.md).
Origen: [procedencia](fixtures/chasqui-v2/PROVENANCE.md).
El [snapshot-v2](schemas/snapshot-v2.json) es una formalización de CubeOS del
ejemplo entregado, no otro archivo proporcionado por hardware. Estados nuevos
`unavailable`/`unverified` y valores nulos permiten representar ausencia sin
sintetizar lecturas; se conservan todos los nombres y estados originales.

`normalizeUplinkV2` es una referencia de conversiones, no combina snapshots ni
interpreta orden/reinicios o fallas de sensores individuales. Devuelve solo los
valores presentes, manteniendo `fl`; sus patches no son snapshots completos.
La recepción, autorización, selección de la última lectura válida y frescura por
grupo se implementarán en Go. `SnapshotProjectionV2` define el borde futuro con
`revision` y `freshnessByGroup` fuera de `snapshot`; aún no hay endpoint.

El paquete legacy `@cubeos/telemetry` y los widgets actuales se conservan hasta
la migración web del PR7. No debe usarse este normalizador para convertir
velocidades angulares en ángulos de la UI demo.
