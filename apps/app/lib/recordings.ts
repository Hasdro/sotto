/**
 * Call recordings on this device (owner, 21 Oct 2026): one WAV file per call, kept in the
 * browser's database (IndexedDB) of the web and desktop apps for 30 days. Signing out deletes
 * them, like the call history. Uploading to the server waits for the owner's storage decision.
 * Anything that fails here only means no recording; it never affects the call.
 */
const DB = "sotto-recordings";
const STORE = "calls";
export const KEEP_MS = 30 * 24 * 3600 * 1000;

type Row = { id: string; at: number; wav: Blob };

function open(): Promise<IDBDatabase | null> {
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!idb) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = idb.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | undefined,
): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(req ? req.result : null);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function saveRecording(
  id: string,
  wav: Uint8Array<ArrayBuffer>,
  now = Date.now(),
): Promise<void> {
  const row: Row = { id, at: now, wav: new Blob([wav], { type: "audio/wav" }) };
  await run("readwrite", (s) => s.put(row));
  // Older than 30 days: deleted.
  const all = (await run("readonly", (s) => s.getAll() as IDBRequest<Row[]>)) ?? [];
  const old = all.filter((r) => now - r.at > KEEP_MS);
  if (old.length) {
    await run("readwrite", (s) => {
      for (const r of old) s.delete(r.id);
      return undefined;
    });
  }
}

export async function recording(id: string): Promise<Blob | null> {
  const row = await run("readonly", (s) => s.get(id) as IDBRequest<Row | undefined>);
  return row?.wav ?? null;
}

export async function clearRecordings(): Promise<void> {
  await run("readwrite", (s) => s.clear());
}
