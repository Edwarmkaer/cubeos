// Guía de armado de un CubeSat 1U (100 × 100 × 113,5 mm). Unidades de escena: 1 = 10 mm.
// Cada pieza declara la dirección por la que entra al ensamble; la vista
// explosionada reutiliza esa misma dirección.

export type PartId =
  | "estructura"
  | "eps"
  | "bateria"
  | "obc"
  | "sensores"
  | "comms"
  | "camara"
  | "antenas"
  | "paneles";

export type TelemetryChannel = "actitud" | "ambiente" | "gps" | "enlace" | "camara";

export type AssemblyPart = {
  id: PartId;
  name: string;
  role: string;
  specs: string[];
  /** Dirección en la vista explosionada (los paneles se separan hacia afuera de su cara). */
  direction: [number, number, number];
  /** Distancia en vista explosionada. */
  spread: number;
  telemetry?: TelemetryChannel[];
};

export type AssemblyStep = {
  id: string;
  title: string;
  instructions: string;
  parts: PartId[];
};

export const parts: Record<PartId, AssemblyPart> = {
  estructura: {
    id: "estructura",
    name: "Estructura 1U",
    role: "Rieles y marcos de aluminio que sostienen la pila de tarjetas y fijan el satélite al desplegador.",
    specs: ["Aluminio 6061-T6", "100 × 100 × 113,5 mm", "Varillas M3 para la pila PC/104"],
    direction: [0, 0, 0],
    spread: 0,
  },
  eps: {
    id: "eps",
    name: "EPS",
    role: "Sistema de potencia: recibe la energía de los paneles, regula los rieles de 3,3 V y 5 V y protege la batería.",
    specs: ["MPPT por panel", "Rieles 3,3 V / 5 V", "Conector PC/104"],
    direction: [0, -1, 0],
    spread: 8,
  },
  bateria: {
    id: "bateria",
    name: "Banco de baterías",
    role: "Almacena energía para los eclipses y los picos de consumo del enlace de radio.",
    specs: ["2 × celdas 18650 Li-ion", "7,4 V nominal", "Termistor de protección"],
    direction: [0, -1, 0],
    spread: 4.5,
  },
  obc: {
    id: "obc",
    name: "Computadora de a bordo",
    role: "ESP32-C3 que ejecuta el firmware de vuelo, lee la IMU y arma los paquetes de telemetría.",
    specs: ["ESP32-C3 RISC-V 160 MHz", "IMU MPU6050 de 6 ejes", "Muestreo a 2 Hz"],
    direction: [0, 0, 1],
    spread: 7,
    telemetry: ["actitud"],
  },
  sensores: {
    id: "sensores",
    name: "Sensores y GPS",
    role: "Mide el ambiente y la posición: temperatura, humedad, luz, radiación UV y coordenadas GPS.",
    specs: ["BME680 (temperatura, humedad, presión)", "BH1750 (luz) y GUVA-S12SD (UV)", "Receptor GNSS"],
    direction: [0, 1, 0],
    spread: 2,
    telemetry: ["ambiente", "gps"],
  },
  comms: {
    id: "comms",
    name: "Radio LoRa",
    role: "Transmite los paquetes de telemetría a la estación terrena y recibe comandos.",
    specs: ["LoRa 915 MHz", "Blindaje RF", "Salida SMA a las antenas"],
    direction: [0, 1, 0],
    spread: 4,
    telemetry: ["enlace"],
  },
  camara: {
    id: "camara",
    name: "Carga útil: cámara",
    role: "Captura imágenes que se guardan en la galería de la estación.",
    specs: ["Sensor de 2 MP", "Lente apuntando a +Y", "Bus SPI"],
    direction: [0, 1, 0],
    spread: 6,
    telemetry: ["camara"],
  },
  antenas: {
    id: "antenas",
    name: "Módulo de antenas",
    role: "Cuatro antenas de cinta que se despliegan en órbita al cortar el hilo de retención.",
    specs: ["Cinta métrica de acero", "Despliegue por hilo térmico", "Dipolo cruzado"],
    direction: [0, 1, 0],
    spread: 9,
  },
  paneles: {
    id: "paneles",
    name: "Paneles solares",
    role: "Cuatro paneles laterales que alimentan al EPS mientras el satélite está iluminado.",
    specs: ["2 celdas por cara", "Triple unión GaAs", "≈ 2 W por cara al sol"],
    direction: [1, 0, 0],
    spread: 6,
  },
};

export const partOrder: PartId[] = [
  "estructura",
  "eps",
  "bateria",
  "obc",
  "sensores",
  "comms",
  "camara",
  "antenas",
  "paneles",
];

export const assemblySteps: AssemblyStep[] = [
  {
    id: "estructura",
    title: "Preparar la estructura",
    instructions: "Revisa los cuatro rieles y los marcos. Enrosca las varillas M3 en el marco inferior: sobre ellas se apila cada tarjeta.",
    parts: ["estructura"],
  },
  {
    id: "eps",
    title: "Montar el EPS",
    instructions: "Baja la tarjeta de potencia por las varillas hasta el marco inferior. El conector PC/104 queda hacia arriba.",
    parts: ["eps"],
  },
  {
    id: "bateria",
    title: "Instalar las baterías",
    instructions: "Coloca el banco de 18650 sobre el EPS con espaciadores de 15 mm. Conecta el termistor antes de cerrar.",
    parts: ["bateria"],
  },
  {
    id: "obc",
    title: "Insertar la computadora de a bordo",
    instructions: "Encaja la tarjeta del ESP32-C3 en el bus PC/104. La flecha de la IMU apunta a +Z: es el eje de referencia de la actitud.",
    parts: ["obc"],
  },
  {
    id: "sensores",
    title: "Agregar sensores y GPS",
    instructions: "Monta la tarjeta con el BME680, el BH1750, el GUVA-S12SD y el receptor GNSS. Deja libre la ventana de los sensores de luz.",
    parts: ["sensores"],
  },
  {
    id: "comms",
    title: "Conectar la radio",
    instructions: "Instala la tarjeta LoRa con su blindaje. Lleva el cable SMA hacia el marco superior para las antenas.",
    parts: ["comms"],
  },
  {
    id: "camara",
    title: "Montar la cámara",
    instructions: "Fija la carga útil en la parte superior de la pila con la lente hacia +Y. Limpia la óptica antes de cerrar.",
    parts: ["camara"],
  },
  {
    id: "antenas",
    title: "Cerrar con el módulo de antenas",
    instructions: "Atornilla el módulo de antenas sobre el marco superior y conecta el SMA. En órbita las cintas se despliegan solas.",
    parts: ["antenas"],
  },
  {
    id: "paneles",
    title: "Fijar los paneles solares",
    instructions: "Atornilla un panel por cara lateral y conecta cada arnés al EPS. El CubeSat queda listo para pruebas.",
    parts: ["paneles"],
  },
];

/** Índice del paso en que aparece cada pieza. */
export const partStep: Record<PartId, number> = Object.fromEntries(
  assemblySteps.flatMap((step, index) => step.parts.map((part) => [part, index])),
) as Record<PartId, number>;
