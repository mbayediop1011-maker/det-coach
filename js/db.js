// Stockage IndexedDB : séances, enregistrements audio (par morceaux), rotation des items, préférences.
const DB_NAME = 'det-coach';
const DB_VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        s.createIndex('type', 'type');
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chunks')) {
        const c = db.createObjectStore('chunks', { keyPath: ['recId', 'seq'] });
        c.createIndex('recId', 'recId');
      }
      if (!db.objectStoreNames.contains('served')) {
        const v = db.createObjectStore('served', { keyPath: 'key' });
        v.createIndex('type', 'type');
      }
      if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export const db = {
  async put(name, value) { return wrap((await store(name, 'readwrite')).put(value)); },
  async add(name, value) { return wrap((await store(name, 'readwrite')).add(value)); },
  async get(name, key) { return wrap((await store(name)).get(key)); },
  async del(name, key) { return wrap((await store(name, 'readwrite')).delete(key)); },
  async all(name) { return wrap((await store(name)).getAll()); },
  async byIndex(name, index, value) { return wrap((await store(name)).index(index).getAll(value)); },
};

// Préférences
export async function getPref(key, fallback = null) {
  try { const r = await db.get('prefs', key); return r ? r.value : fallback; } catch { return fallback; }
}
export async function setPref(key, value) { return db.put('prefs', { key, value }); }

// Séances
export async function saveSession(s) { return db.add('sessions', s); }
export async function updateSession(s) { return db.put('sessions', s); }
export async function allSessions() {
  const list = await db.all('sessions');
  return list.sort((a, b) => a.date.localeCompare(b.date));
}
export async function sessionsOf(type) {
  const list = await db.byIndex('sessions', 'type', type);
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

// Enregistrements : chaque morceau d'une seconde est écrit dès qu'il arrive.
export async function createRecording(meta) {
  await db.put('recordings', { done: false, createdAt: new Date().toISOString(), ...meta });
}
export async function putChunk(recId, seq, blob) { return db.put('chunks', { recId, seq, blob }); }
export async function finishRecording(recId, extra = {}) {
  const r = await db.get('recordings', recId);
  if (r) await db.put('recordings', { ...r, ...extra, done: true });
}
export async function recordingBlob(recId) {
  const r = await db.get('recordings', recId);
  const chunks = await db.byIndex('chunks', 'recId', recId);
  if (!chunks.length) return null;
  chunks.sort((a, b) => a.seq - b.seq);
  return new Blob(chunks.map(c => c.blob), { type: (r && r.mime) || chunks[0].blob.type || 'audio/webm' });
}
export async function unfinishedRecordings() {
  const list = await db.all('recordings');
  return list.filter(r => !r.done);
}

// Demande au navigateur de ne pas effacer les données (important sur iPhone).
export async function askPersistence() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch {}
  return false;
}
