/**
 * Call recordings on this device (owner, 21 Oct 2026): one WAV file per call, kept in the
 * browser's database (IndexedDB) of the web and desktop apps for 30 days. Signing out deletes
 * them, like the call history. When no call is on, each one is uploaded to the Sotto server
 * (owner, 22 Oct), where the company's admins and managers can play it for 30 days.
 * Anything that fails here only means no recording; it never affects the call.
 */
import { cloudActive, cloudApi } from "./cloud";

const DB = "sotto-recordings";
const STORE = "calls";
export const KEEP_MS = 30 * 24 * 3600 * 1000;

type Row = { id: string; at: number; wav: Blob; uploaded?: boolean };

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

export async function saveRecording(id: string, audio: Blob, now = Date.now()): Promise<void> {
  const row: Row = { id, at: now, wav: audio };
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

// --- upload when idle ----------------------------------------------------------------------
let busy = false;
let uploading = false;
const IDLE_MS = 30_000;
let timer: ReturnType<typeof setTimeout> | null = null;

/** The call screen says when a call is on: nothing uploads during a call. */
export function setCallBusy(on: boolean): void {
  busy = on;
  if (!on) uploadSoon();
}

/** Uploads waiting recordings once the app has been free of calls for a little while. */
export function uploadSoon(delay = IDLE_MS): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void uploadPending(), delay);
  (timer as { unref?: () => void }).unref?.(); // never keeps a test run or app exit waiting
}

/** Uploads every recording not on the server yet, one at a time; stops at the first call or
 * failure and tries again later. Returns how many went up. */
export async function uploadPending(): Promise<number> {
  if (uploading || busy || !cloudActive()) return 0;
  uploading = true;
  let sent = 0;
  try {
    const rows = (await run("readonly", (s) => s.getAll() as IDBRequest<Row[]>)) ?? [];
    for (const row of rows.filter((r) => !r.uploaded)) {
      if (busy) break;
      try {
        await cloudApi(`/api/v1/recordings/${encodeURIComponent(row.id)}`, {
          method: "PUT",
          raw: row.wav,
        });
      } catch {
        break; // offline, not reported yet, or the server is full: next idle moment
      }
      await run("readwrite", (s) => s.put({ ...row, uploaded: true }));
      sent += 1;
    }
  } finally {
    uploading = false;
  }
  return sent;
}
