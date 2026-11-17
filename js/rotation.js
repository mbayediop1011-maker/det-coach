// Rotation des items : jamais le même item avant épuisement de la banque,
// jamais deux items de suite avec le même thème principal.
import { db, getPref, setPref } from './db.js';
import { shuffle } from './ui.js';

const mainTag = it => (it.tags && it.tags[0]) || null;

export async function servedMap(type) {
  const rows = await db.byIndex('served', 'type', type);
  const m = new Map();
  for (const r of rows) m.set(r.itemId, r);
  return m;
}

export async function seenCount(type, items) {
  const m = await servedMap(type);
  return items.filter(it => m.has(it.id)).length;
}

// Choisit n items. Ne les marque pas encore comme servis (voir markServed).
export async function pickItems(type, items, n = 1) {
  if (!items.length) return [];
  n = Math.min(n, items.length);
  const served = await servedMap(type);
  let lastTag = await getPref('lastTag:' + type, null);
  const unseen = shuffle(items.filter(it => !served.has(it.id)));
  const seen = items.filter(it => served.has(it.id))
    .sort((a, b) => served.get(a.id).lastServed.localeCompare(served.get(b.id).lastServed));
  // Les jamais vus d'abord (au hasard), puis les plus anciennement vus.
  const pool = [...unseen, ...seen];
  const picked = [];
  while (picked.length < n && pool.length) {
    let idx = pool.findIndex(it => !mainTag(it) || mainTag(it) !== lastTag);
    if (idx === -1) idx = 0; // pas d'autre choix possible
    const [it] = pool.splice(idx, 1);
    picked.push(it);
    lastTag = mainTag(it) || lastTag;
  }
  return picked;
}

export async function markServed(type, picked) {
  const now = new Date().toISOString();
  const served = await servedMap(type);
  for (const it of picked) {
    const prev = served.get(it.id);
    await db.put('served', { key: type + ':' + it.id, type, itemId: it.id, lastServed: now, count: (prev ? prev.count : 0) + 1 });
  }
  const last = picked[picked.length - 1];
  if (last && mainTag(last)) await setPref('lastTag:' + type, mainTag(last));
}
