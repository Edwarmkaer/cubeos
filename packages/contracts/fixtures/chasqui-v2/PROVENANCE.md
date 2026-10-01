# Procedencia de la entrega Chasqui II v2

Entrega del equipo CHASQUI-II, corte 2026-09-25, inspeccionada 2026-10-01.
Origen local: `Entrega_CubeSat_Chasqui_II_JSON_v2_20260925 (2)/Entrega_CubeSat_Chasqui_II_JSON_v2_20260925/`.
Los tres JSON suministrados se conservan byte a byte. Solo el esquema se renombra
de `uplink-schema-v2.json` a `../../schemas/uplink-v2.json`.
El título y `$id` originales mencionan LoRa como procedencia documental;
CubeOS integra la salida de la ESP32 receptora sin depender de software LoRa.

| Archivo fuente | SHA-256 | Archivo conservado |
| --- | --- | --- |
| uplink-schema-v2.json | `3548bb695d5ab9cd9aaabf50903379ccf2c8807dd6de60ec050109ce2df6fdfd` | [uplink-v2.json](../../schemas/uplink-v2.json) |
| uplink-examples-v2.json | `41bd786a97099c61a7f7bedf1197175368241cccd715f9aa61d06cfe698caf70` | [uplink-examples-v2.json](uplink-examples-v2.json) |
| backend-snapshot-example-v2.json | `2652ab55dfd369278eb566dcca33c99a17dea68e5369cb520f92f6630da55710` | [backend-snapshot-example-v2.json](backend-snapshot-example-v2.json) |
| Guia_comunicaciones_Chasqui_II_v2.docx | `aed1c630e7f369200554e6e305e822781450ed0315dbaccc886c6b150808382a` | Referencia local; no publicada |
| Inventario_CubeSat_corregido_y_JSON_v2.xlsx | `2d7745b538b2f0246ea8ee7d1afb34ddcfa16246b8c4ee25facd23cfb570da78` | Referencia local; no publicada |

La guía y el diccionario Excel se inspeccionaron para unidades, estados de misión,
despliegue y flags. No se presume licencia de redistribución de Word/Excel.
Los tests verifican checksums de los JSON. `normalization-cases.json` es un
derivado de prueba creado en CubeOS: sus expectativas numéricas fueron calculadas
independientemente. Go debe consumir estos mismos casos, no generar sus propios
esperados a partir de su normalizador. El caso de energía sobre E también prueba
que el esquema permite claves conocidas fuera de su tipo habitual.

Las discrepancias detectadas y su tratamiento están en
[telemetry.md](../../../../docs/telemetry.md) y las preguntas pendientes en
[open-questions.md](../../../../docs/open-questions.md).
