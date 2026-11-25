// Tipos mínimos de la Web Serial API (aún no incluidos en lib.dom de TypeScript).
interface SerialPortInfo { usbVendorId?: number; usbProductId?: number }
interface SerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}
interface Serial extends EventTarget {
  requestPort(options?: { filters?: SerialPortInfo[] }): Promise<SerialPort>;
}
interface Navigator { readonly serial?: Serial }
