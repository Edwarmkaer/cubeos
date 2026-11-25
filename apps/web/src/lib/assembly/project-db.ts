// Guarda el proyecto de armado del usuario (modelo + guía) en IndexedDB.

export type StoredProject = { model: Blob; modelName: string; guide: string; guideName: string };

const DB = "cubeos";
const STORE = "projects";
const KEY = "current";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const loadProject = () => run<StoredProject | undefined>("readonly", (s) => s.get(KEY)).catch(() => undefined);
export const saveProject = (p: StoredProject) => run("readwrite", (s) => s.put(p, KEY));
export const clearProject = () => run("readwrite", (s) => s.delete(KEY));
