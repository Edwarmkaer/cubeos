# Reproducción Chasqui v2 sin hardware

Node fijado por `.node-version`. Fuente sintética independiente de la demo web.
El generador no usa reloj real ni red: la misma seed y opciones producen los
mismos bytes. `atMs` es tiempo lógico de recepción; `u` conserva el tiempo de
vuelo incluso al retrasar una trama. La salida NDJSON contiene envelopes v1,
uno por línea; `--format fixture` produce un array JSON de `{atMs, envelope}`.

```bash
pnpm --filter @cubeos/simulator replay --seed 42 --duration-ms 4000
pnpm --filter @cubeos/simulator replay --seed 42 --duration-ms 4000 --gps --format fixture
pnpm --filter @cubeos/simulator replay --seed 42 --duration-ms 4000 --scenario out-of-order
pnpm --filter @cubeos/simulator test
```

Para guardar NDJSON puro (pnpm puede escribir el anuncio de script según versión),
usar desde la raíz `node tools/simulator/src/index.ts --seed 42 --duration-ms 4000 > /tmp/chasqui-v2.ndjson`.
Los tests comparan la salida real de la CLI y validan cada envelope normal.
No se implementa envío HTTP antes de existir la API.

Frecuencias y unidades: [telemetría](../../docs/telemetry.md). G está apagado por
defecto. `--gps` solo habilita un escenario sintético y no afirma instalación de
GPS real. Sin G, `t=0` y el bit GPS no disponible permanece activo.
Rango de duración: 2000..3600000 ms, intervalo final exclusivo; seed uint32.

| Escenario | Evidencia emitida |
| --- | --- |
| normal | H/E/O/I y G opcional con secuencia global creciente |
| duplicate | Repite exactamente el primer envelope sin consumir secuencia |
| out-of-order | Demora I de 500 ms hasta después de I de 1000 ms |
| reboot | Reinicia `n` y `u` en la mitad de duración, redondeada al siguiente tick de 500 ms |
| failures | Desde la mitad activa falla de sensor/cámara; omite `t1` de un E para probar rechazo por esquema |

`failures` contiene deliberadamente una trama inválida: no la normaliza ni la
presenta como válida. El contrato de omitir sensores fallidos contradice los
campos obligatorios por tipo de la entrega; esta reproducción conserva esa
evidencia para los futuros tests de ingestión. No simula autorización, proyección,
wrap de uint32 ni decisión de reinicio vs atraso: esas reglas pertenecen al PR4.
