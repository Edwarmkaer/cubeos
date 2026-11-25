# CubeOS — glosario

Una definición por término. Sin detalles de implementación.

**CubeOS**: la aplicación web. _Evitar_: interface_cubesat, dashboard.

**Placa**: el hardware del usuario que envía datos (ESP32, Arduino…). _Evitar_: CubeSat cuando no lo es.

**Fuente**: de dónde llegan los datos: DEMO o una placa conectada. _Evitar_: API, provider.

**DEMO**: fuente sintética integrada. Sus valores no son mediciones reales. _Evitar_: mock, dummy.

**Perfil**: configuración que dice cómo leer una fuente: formato, campos, nombres, unidades y widget. Se exporta como JSON.

**Campo**: una magnitud dentro de cada lectura (p. ej. `temp`). _Evitar_: key, columna.

**Lectura**: el conjunto de campos recibido en un instante (una línea serial). _Evitar_: paquete, frame.

**Visor**: superficie que muestra las lecturas en vivo. _Evitar_: home, main.

**Armado**: superficie que guía el ensamblaje de un modelo 3D por pasos. _Evitar_: builder, wizard.

**Guía**: archivo (JSON o Markdown) con piezas, pasos y conceptos de un armado.

**Paso**: unidad de la Guía. Nombra las piezas del modelo que intervienen.

**Pieza**: componente físico listado en la Guía; puede mapear a uno o más meshes del modelo.
