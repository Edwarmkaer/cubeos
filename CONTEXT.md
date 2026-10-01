# CubeOS

Plataforma educativa de estación terrena para un CubeSat. Este archivo es el glosario: la única definición de cada término de dominio. Sin detalles de implementación.

## Language

**CubeSat**:
Satélite cúbico 1U (10 × 10 × 10 cm) cuya telemetría se observa en esta plataforma.
_Avoid_: nanosat, payload, el modelo 3D

**CubeOS**:
La plataforma web. Es la marca que ve el estudiante.
_Avoid_: CHASQUI-II, InterfaceOS, interface_cubesat, Cubesat_Dashboard, dashboard

**CHASQUI-II**:
Grupo de la UNI dueño del CubeSat y de CubeOS. No es el nombre del producto.
_Avoid_: usarlo como marca de la app, Chasqui II, el proyecto (cuando se habla de la interfaz)

**Estación terrena**:
Lado en tierra donde se recibe y se muestra la telemetría. CubeOS es su interfaz web educativa, no el radio ni el hardware de recepción.
_Avoid_: ground station software, consola de misión, backend

**Visor**:
Superficie principal. Muestra la última Muestra, su historial breve, la orientación y la posición.
_Avoid_: dashboard, home, tablero, main

**Construcción**:
Superficie que guía el ensamblaje del CubeSat por pasos. No opera el hardware.
_Avoid_: builder, wizard, tutorial, onboarding

**Configuración**:
Superficie para elegir la fuente de telemetría y leer el estado de Conexión.
_Avoid_: settings como cajón de opciones sueltas, admin, preferencias de tema

**Muestra**:
Una medición de un sensor o grupo en un instante. La cadencia depende del grupo; la muestra plana del simulador anterior no define la telemetría del hardware.
_Avoid_: paquete, frame, reading, datapoint, payload JSON

**Telemetría**:
El conjunto de mediciones, estados y eventos recibidos del CubeSat. No incluye comandos hacia el CubeSat.
_Avoid_: telemetría y telecomando juntos, TM/TC, stream genérico

**Sensor**:
Magnitud física del CubeSat (aceleración, orientación, GPS, ambiente). No es el widget que la pinta.
_Avoid_: tarjeta, card, chart

**Orientación**:
Actitud del CubeSat expresada como roll, pitch y yaw. Es distinta de la velocidad angular medida por el giroscopio; no se obtiene renombrando sus ejes.
_Avoid_: gyro a secas, rotación 3D, IMU

**Conexión**:
Estado de la fuente de datos: `simulated`, `connecting`, `connected`, `disconnected` o `error`.
_Avoid_: online, status verde, heartbeat

**Simulador**:
Fuente de tramas y muestras sintéticas para probar la plataforma sin hardware. Sus datos no representan mediciones de un CubeSat físico.
_Avoid_: mock, faker, demo mode, dummy data

**Fuente de telemetría**:
Origen de las mediciones que muestra el Visor, real o simulado. Es distinto del enlace físico entre el CubeSat y el receptor de tierra.
_Avoid_: API, servicio, store, provider de React

**Equipo**:
Personas de CHASQUI-II mostradas en Landing. No es un rol de la app ni un usuario de telemetría.
_Avoid_: about, team grid, contributors

**Landing**:
Cara pública de CubeOS. Presenta el proyecto y lleva al Visor. No muestra Muestras en vivo.
_Avoid_: home del Visor, marketing genérico, dashboard

**Paso**:
Unidad de la Construcción. Tiene piezas requeridas y un lugar en la secuencia.
_Avoid_: slide, pantalla, lección

**Dispositivo**:
CubeSat físico registrado por un estudiante, con un nombre visible elegido por él. Su identificador de vuelo puede coincidir con el de otro estudiante.
_Avoid_: usuario, fuente, receptor

**Receptor de tierra**:
Hardware de la estación terrena que recibe el enlace del CubeSat y entrega sus tramas a la plataforma.
_Avoid_: backend, cuenta, CubeSat de vuelo

**Fuente de recepción**:
Origen autorizado que entrega tramas de un dispositivo a la plataforma.
_Avoid_: propietario, sesión de estudiante

**Trama**:
Mensaje compacto de vuelo identificado por tipo, secuencia y tiempo de encendido. Puede contener solo un grupo de mediciones.
_Avoid_: muestra completa, snapshot

**Snapshot**:
Estado combinado que conserva las últimas mediciones válidas de cada grupo de un dispositivo. Sus grupos pueden tener antigüedades distintas.
_Avoid_: lectura simultánea, trama

**Progreso de construcción**:
Pasos del armado completados para un CubeSat del estudiante. No depende de que el dispositivo esté conectado.
_Avoid_: telemetría, estado de misión

**Fotografía**:
Captura asociada a un CubeSat, cuyo original se conserva con su fecha conocida de captura y fecha de importación. Su recepción es independiente de las tramas de telemetría.
_Avoid_: estado de cámara, muestra, miniatura como original
