# Contexto y objetivos

## Propósito

CHASQUI-II — UNI desarrollará una plataforma web educativa para visualizar en tiempo real la telemetría de un CubeSat. La experiencia debe ayudar a estudiantes de ingeniería a comprender el satélite y sus datos, por lo que la claridad visual y el carácter didáctico son objetivos de producto, no solo características estéticas.

## Usuarios

Estudiantes de ingeniería que construyen u operan el CubeSat y el equipo CHASQUI-II que los acompaña.

## Alcance

La plataforma debe:

- Mostrar las lecturas de los sensores y la posición GPS.
- Representar la orientación del CubeSat en 3D.
- Conservar y mostrar series temporales de telemetría.
- Permitir una conexión futura con el hardware mediante backend y WebSocket.
- Ejecutarse desde un navegador moderno, sin instalación de cliente.

## Fuera de alcance

- Controlar o enviar comandos al CubeSat.
- Sustituir software profesional de operación o telemetría.
- Crear una aplicación de escritorio. PyQt5 pertenece al prototipo anterior y no es el destino de esta implementación.

## Antecedente y migración

El prototipo en PyQt5 aporta tres referencias reutilizables: el esquema inicial de SQLite, la lógica de rotación 3D (roll, pitch y yaw) y la simulación de datos con GPS. La migración a una plataforma React + FastAPI se justifica por accesibilidad desde navegador, visualización 3D más adecuada para aprendizaje y una ruta directa para conectar hardware real por WebSocket.

La decisión de frontend está detallada en [ADR-001](../ADR/ADR-001-stack-frontend.md).

## Resultado esperado por etapa

| Etapa | Fuente de telemetría | Objetivo |
| --- | --- | --- |
| Sprint 1 | Simulador en frontend | Validar interfaz, visualizaciones y flujos educativos. |
| Sprint 2 | Serial/radio → FastAPI → WebSocket | Consumir telemetría real y guardar historial. |

Los campos de cada etapa se definen en el [contrato de telemetría](../Arquitectura/telemetria-y-sensores.md).
