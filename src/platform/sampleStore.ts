/**
 * Storage for the sample library on this computer: the user's audio files, kept unchanged, with a
 * little information about each (name, length, waveform overview).
 *
 * Browser-specific (IndexedDB) so a desktop build can swap in its own implementation. Two stores:
 * the small descriptions (read all at once for the list) and the file contents (read one at a
 * time, when a sample is played or used).
 */

/** What the library keeps about a sample, besides its file. */
export interface SampleInfo {
  id: string;
  name: string;
  /** Original file name. */
  fileName: string;
  /** Media type of the file, e.g. 'audio/wav'. */
  type: string;
  /** Size of the file in bytes. */
  size: number;
  /** Length in seconds. */
  duration: number;
  sampleRate: number;
  channels: number;
  /** Waveform overview: peak level (0..1) of each of PEAK_COUNT equal parts. */
  peaks: number[];
  /** SHA-256 of the file contents, to recognise the same file added twice. */
  hash: string;
  /** When it was added (ms since 1970). */
  added: number;
}

export interface SampleStore {
  list(): Promise<SampleInfo[]>;
  add(info: SampleInfo, file: Blob): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  file(id: string): Promise<Blob | null>;
}

const DB_NAME = 'sonular-samples';
const DB_VERSION = 1;
const INFO = 'info';
const FILES = 'files';

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(INFO)) db.createObjectStore(INFO, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error ?? new Error('The sample library could not be opened.'));
    };
  });
  return opening;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Saving in the sample library failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Saving in the sample library was stopped (storage full?).'));
  });
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const browserSampleStore: SampleStore = {
  async list() {
    const db = await open();
    return result(db.transaction(INFO).objectStore(INFO).getAll() as IDBRequest<SampleInfo[]>);
  },
  async add(info, file) {
    const db = await open();
    const tx = db.transaction([INFO, FILES], 'readwrite');
    tx.objectStore(FILES).put(file, info.id);
    tx.objectStore(INFO).put(info);
    await done(tx);
  },
  async rename(id, name) {
    const db = await open();
    const tx = db.transaction(INFO, 'readwrite');
    const store = tx.objectStore(INFO);
    const info = (await result(store.get(id) as IDBRequest<SampleInfo | undefined>)) ?? null;
    if (info) store.put({ ...info, name });
    await done(tx);
  },
  async remove(id) {
    const db = await open();
    const tx = db.transaction([INFO, FILES], 'readwrite');
    tx.objectStore(INFO).delete(id);
    tx.objectStore(FILES).delete(id);
    await done(tx);
  },
  async file(id) {
    const db = await open();
    return (await result(db.transaction(FILES).objectStore(FILES).get(id) as IDBRequest<Blob | undefined>)) ?? null;
  },
};

/** Ask the browser to keep the library even when the disk gets full. Returns whether it agreed. */
export async function askPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
