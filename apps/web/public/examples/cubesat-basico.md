# CubeSat básico 1U

## Piezas
- estructura: Estructura 1U (4 rieles y 2 marcos) x1
- eps: Tarjeta de potencia (EPS) x1
- baterias: Celda 18650 x2
- obc: Computadora de a bordo (ESP32) x1
- sensores: Tarjeta de sensores con GPS x1
- radio: Radio LoRa con blindaje x1
- antenas: Módulo de antenas x1
- paneles: Panel solar x4
- tornillos: Tornillo M3 x16

## Paso: Preparar la estructura
piezas: estructura, tornillos
meshes: Riel_*, Marco_Inferior
> Concepto: los rieles son el único contacto con el desplegador; deben quedar limpios y sin rebabas.

Une los cuatro rieles al marco inferior con tornillos M3. Aprieta en cruz para no torcer el marco.

## Paso: Montar la EPS
piezas: eps
meshes: EPS_*
> Concepto: la EPS va abajo para acortar los cables de potencia y bajar el centro de masa.

Baja la tarjeta de potencia hasta el marco inferior. El conector queda hacia +Z.

## Paso: Instalar las baterías
piezas: baterias
meshes: Bateria_*

Coloca las dos celdas sobre la EPS y conecta el termistor antes de seguir.

## Paso: Insertar la computadora de a bordo
piezas: obc
meshes: OBC_*
> Concepto: la IMU de la OBC define los ejes de la orientación que verás en el Visor.

Encaja la OBC en el bus. La flecha de la IMU apunta a +Z.

## Paso: Agregar sensores y GPS
piezas: sensores
meshes: Sensores_*

Monta la tarjeta de sensores y deja libre la ventana de luz.

## Paso: Conectar la radio
piezas: radio
meshes: Radio_*

Instala la radio con su blindaje y lleva el cable hacia el marco superior.

## Paso: Cerrar la estructura
piezas: antenas, tornillos
meshes: Marco_Superior, Antena_Modulo

Atornilla el marco superior y encima el módulo de antenas.

## Paso: Fijar los paneles solares
piezas: paneles
meshes: Panel_*
> Concepto: cada panel alimenta la EPS por separado; si uno falla, los demás siguen cargando.

Atornilla un panel por cara lateral y conecta cada arnés a la EPS.
