// Adaptador Web Serial: abre un puerto USB y entrega líneas de texto.

export type LineSource = { close: () => Promise<void> };

export function serialSupported() {
  return typeof navigator !== "undefined" && "serial" in navigator && !!navigator.serial;
}

const MAX_BUFFER = 64 * 1024;

export async function openSerial(
  baudRate: number,
  onLine: (line: string) => void,
  onEnd: (error: Error | null) => void,
): Promise<LineSource> {
  if (!navigator.serial) throw new Error("Este navegador no soporta Web Serial. Usa Chrome o Edge.");
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate });

  let closing = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const decoder = new TextDecoder();
  let buffer = "";

  void (async () => {
    let failure: Error | null = null;
    try {
      let ended = false;
      // Un error no fatal reemplaza `readable`; un stream terminado cierra la lectura.
      while (port.readable && !closing && !ended) {
        reader = port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) {
              ended = true;
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            if (buffer.length > MAX_BUFFER) buffer = "";
            for (const line of lines) onLine(line.replace(/\r$/, ""));
          }
        } finally {
          reader.releaseLock();
        }
      }
    } catch (error) {
      if (!closing) failure = error instanceof Error ? error : new Error(String(error));
    }
    if (!closing) {
      await port.close().catch(() => {});
      onEnd(failure ?? new Error("El dispositivo se desconectó."));
    }
  })();

  return {
    close: async () => {
      closing = true;
      await reader?.cancel().catch(() => {});
      await port.close().catch(() => {});
      onEnd(null);
    },
  };
}
