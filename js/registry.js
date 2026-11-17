// Catalogue des exercices. Les durées suivent le guide officiel 2026 de Duolingo
// (Scoring Guide for Teachers 2026, §2.6, §3, §4), sauf la dictée longue (hors test).

export const SKILLS = {
  read: { name: 'Lecture', cls: 'sk-read' },
  listen: { name: 'Écoute', cls: 'sk-listen' },
  write: { name: 'Écriture', cls: 'sk-write' },
  speak: { name: 'Oral', cls: 'sk-speak' },
  extra: { name: 'Entraînement en plus', cls: 'sk-extra' },
};

export const EXERCISES = [
  { id: 'read-and-select', name: 'Read and Select', fr: 'Mot réel ou inventé ?', skill: 'read', icon: 'select', file: 'read-and-select.json', perRun: 18, module: 'readSelect', metric: 'pourcentage', unit: '%', time: '5 s par mot' },
  { id: 'fill-in-the-blanks', name: 'Fill in the Blanks', fr: 'Compléter le mot', skill: 'read', icon: 'blanks', file: 'fill-in-the-blanks.json', perRun: 6, module: 'fillBlanks', metric: 'pourcentage', unit: '%', time: '20 s par phrase' },
  { id: 'read-and-complete', name: 'Read and Complete', fr: 'Texte à trous, lettre par lettre', skill: 'read', icon: 'complete', file: 'read-and-complete.json', perRun: 1, module: 'readComplete', metric: 'sur 23', unit: '/23', time: '3 min' },
  { id: 'interactive-reading', name: 'Interactive Reading', fr: 'Un texte, cinq types de questions', skill: 'read', icon: 'ireading', file: 'interactive-reading.json', perRun: 1, module: 'interactiveReading', metric: 'pourcentage', unit: '%', time: '7 ou 8 min' },
  { id: 'listen-and-type', name: 'Listen and Type', fr: 'Écrire la phrase entendue', skill: 'listen', icon: 'ltype', file: 'listen-and-type.json', perRun: 5, module: 'listenType', metric: 'phrases exactes sur 5', unit: '/5', time: '1 min par phrase' },
  { id: 'interactive-listening', name: 'Interactive Listening', fr: 'Scénario, conversation, résumé', skill: 'listen', icon: 'ilisten', file: 'interactive-listening.json', perRun: 1, module: 'interactiveListening', metric: 'pourcentage', unit: '%', time: '6 min 30 + 75 s' },
  { id: 'dictee-longue', name: 'Dictée longue', fr: 'Deux écoutes imposées', skill: 'listen', icon: 'dictee', file: 'dictee-longue.json', perRun: 10, module: 'dictation', metric: 'sur 10 au premier passage', unit: '/10', time: '10 phrases', extra: true },
  { id: 'write-about-the-photo', name: 'Write About the Photo', fr: 'Décrire une photo par écrit', skill: 'write', icon: 'wphoto', file: 'photos', perRun: 3, module: 'writePhoto', metric: 'mots en 60 s', unit: ' mots', time: '1 min par photo' },
  { id: 'interactive-writing', name: 'Interactive Writing', fr: 'Une question, puis une relance', skill: 'write', icon: 'iwriting', file: 'interactive-writing.json', perRun: 1, module: 'interactiveWriting', metric: 'mots en 5 min', unit: ' mots', time: '30 s + 5 min + 3 min' },
  { id: 'writing-sample', name: 'Writing Sample', fr: 'Rédaction longue', skill: 'write', icon: 'wsample', file: 'writing-sample.json', perRun: 1, module: 'writingSample', metric: 'mots en 5 min', unit: ' mots', time: '30 s + 5 min' },
  { id: 'speak-about-the-photo', name: 'Speak About the Photo', fr: 'Décrire une photo à l’oral', skill: 'speak', icon: 'sphoto', file: 'photos', perRun: 1, module: 'speakTasks', metric: 'mots en 90 s', unit: ' mots', time: '20 s + 90 s' },
  { id: 'read-then-speak', name: 'Read Then Speak', fr: 'Lire un sujet, puis parler', skill: 'speak', icon: 'rspeak', file: 'read-then-speak.json', perRun: 1, module: 'speakTasks', metric: 'mots en 90 s', unit: ' mots', time: '20 s + 90 s' },
  { id: 'interactive-speaking', name: 'Interactive Speaking', fr: 'Répondre à des questions orales', skill: 'speak', icon: 'ispeak', file: 'interactive-speaking.json', perRun: 2, module: 'interactiveSpeaking', metric: 'mots par réponse de 35 s', unit: ' mots', time: '6 à 8 × 35 s' },
  { id: 'speaking-sample', name: 'Speaking Sample', fr: 'Parler longuement', skill: 'speak', icon: 'ssample', file: 'speaking-sample.json', perRun: 1, module: 'speakTasks', metric: 'mots par minute sur 3 min', unit: ' mots/min', time: '30 s + 3 min' },
];

export const byId = id => EXERCISES.find(e => e.id === id);
export const ORAL = ['speak-about-the-photo', 'read-then-speak', 'interactive-speaking', 'speaking-sample'];
export const WRITTEN = ['write-about-the-photo', 'interactive-writing', 'writing-sample'];

// Chargement du contenu (JSON écrits à la main).
const cache = new Map();
export async function loadJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(path, { cache: 'no-cache' }).then(r => {
    if (!r.ok) throw new Error(path + ' : ' + r.status);
    return r.json();
  });
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p;
}

export async function loadItems(ex) {
  if (ex.file === 'photos') {
    const list = await loadJSON('content/photos/photos.json');
    return list.photos.map(p => ({ ...p, id: p.file, tags: p.tags || [] }));
  }
  const data = await loadJSON('content/' + ex.file);
  return data.items || [];
}

export async function loadConsignes() {
  try { return await loadJSON('content/consignes.json'); } catch { return {}; }
}
export async function loadObjectifs() {
  try { return await loadJSON('content/objectifs.json'); } catch { return {}; }
}

// Un objectif est « fixé » quand le professeur a mis un nombre.
export function objectiveOf(objectifs, id) {
  const o = objectifs && objectifs[id];
  if (!o || o.objectif == null || o.objectif === '') return null;
  return o;
}
