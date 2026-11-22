// Autosparning i Fil: själva ljudfilen sparas i appens egen lagring på telefonen (IndexedDB – inget laddas upp),
// så att låten finns kvar om appen stängs, startas om eller uppdateras. Inställningarna sparas vid varje ändring.
const DB = 'masterlab-fil', STORE = 'kv';

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('ingen lagring')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req?.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}
const put = (k, v) => tx('readwrite', (s) => s.put(v, k));
const get = (k) => tx('readonly', (s) => s.get(k));

/** Sparar låten (filens bytes) – en åt gången, den senaste. */
export async function saveSong(name, bytes) {
  try { await put('song', { name, bytes, savedAt: Date.now() }); return true; } catch { return false; }
}
/** { name, bytes } eller null. */
export async function loadSong() {
  try { return (await get('song')) || null; } catch { return null; }
}
export async function forgetSong() {
  try { await tx('readwrite', (s) => s.delete('song')); } catch { /* */ }
}

let stateTimer = 0;
/** Inställningarna för låten (sparas lite fördröjt medan man drar). */
export function saveFileState(state) {
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => { put('state', state).catch(() => {}); }, 400);
}
export async function loadFileState() {
  try { return (await get('state')) || null; } catch { return null; }
}
