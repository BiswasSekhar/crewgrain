import type { OutboxRow } from "../domain/types";
let connection: Promise<IDBDatabase> | undefined;
function db() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("crewgrain-production-outbox", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("entries", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () =>
      reject(
        new Error(
          "Could not open device storage. Enable browser storage before recording work.",
        ),
      );
  });
  return connection;
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("entries", mode);
    const r = run(tx.objectStore("entries"));
    let result: T;
    r.onsuccess = () => {
      result = r.result;
    };
    tx.oncomplete = () => resolve(result!);
    tx.onerror = () =>
      reject(tx.error ?? new Error("Could not save to this device."));
    tx.onabort = () =>
      reject(tx.error ?? new Error("Device save was interrupted."));
  });
}
export async function putOutbox(row: OutboxRow) {
  await transaction("readwrite", (s) => s.put(row));
}
export async function listOutbox(): Promise<OutboxRow[]> {
  return transaction("readonly", (s) => s.getAll());
}
export async function removeOutbox(id: string) {
  await transaction("readwrite", (s) => s.delete(id));
}
