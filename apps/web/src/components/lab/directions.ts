export const directions = [
  {
    id: "tinta",
    name: "Tinta",
    claim: "Negro de espacio. El navy del logo deja de ser la página.",
    how: "Grano de película, tipo grande, reglas horizontales. El CTA es claro, no rojo.",
  },
  {
    id: "pozo",
    name: "Pozo",
    claim: "Las regiones se cavan, no se recuadran.",
    how: "El fondo es un peldaño más claro que el contenido. Sin borde: el tono hace el límite.",
  },
  {
    id: "carta",
    name: "Carta",
    claim: "Cielo, no cuaderno milimetrado.",
    how: "Estrellas dispersas y un riel izquierdo. La órbita es el objeto, no un anillo rojo.",
  },
  {
    id: "limbo",
    name: "Limbo",
    claim: "La Tierra es el interés. La UI se apaga.",
    how: "Foto del limbo terrestre. Copy y CTA sobre tinta. El Visor sigue siendo producto, no póster.",
  },
] as const;

export type DirectionId = (typeof directions)[number]["id"];

export const themes: Record<
  DirectionId,
  {
    background: string;
    surface: string;
    well: string;
    foreground: string;
    muted: string;
    primary: string;
    primaryForeground: string;
    border: string;
  }
> = {
  tinta: {
    background: "#08080C",
    surface: "#101016",
    well: "#050508",
    foreground: "#ECEAF2",
    muted: "#9A9AA8",
    primary: "#ECEAF2",
    primaryForeground: "#08080C",
    border: "transparent",
  },
  pozo: {
    background: "#16161E",
    surface: "#1C1C26",
    well: "#0A0A10",
    foreground: "#E8E8F0",
    muted: "#9C9CAA",
    primary: "#E8E8F0",
    primaryForeground: "#0A0A10",
    border: "transparent",
  },
  carta: {
    background: "#05050A",
    surface: "#0C0C14",
    well: "#05050A",
    foreground: "#F1F0F6",
    muted: "#A0A0B0",
    primary: "#F1F0F6",
    primaryForeground: "#05050A",
    border: "rgb(241 240 246 / 0.08)",
  },
  limbo: {
    background: "#040406",
    surface: "#0C0C12",
    well: "#07070C",
    foreground: "#F4F2F8",
    muted: "#B4B4C0",
    primary: "#F4F2F8",
    primaryForeground: "#040406",
    border: "transparent",
  },
};
