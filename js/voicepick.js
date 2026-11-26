// Choix des voix anglaises (fonctions pures, testables sans navigateur).
// Priorité à la clarté : on écarte les voix robotiques ou « fantaisie » d'Apple et les vieilles voix
// de synthèse, et on préfère les voix naturelles (Premium, Enhanced, Natural, Google, Microsoft Online).

// Voix à ne jamais utiliser : effets, voix « Eloquence » et anciennes voix MacinTalk, mot à mot et peu intelligibles.
const ROBOTIC = /\b(Fred|Ralph|Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Junior|Kathy|Organ|Pipe Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Hysterical|Deranged|Princess|Agnes|Bruce|Vicki|Victoria|eSpeak|espeak)\b/i;

// Voix naturelles connues (iOS, macOS, Windows/Edge, Chrome, Android).
const GOOD_FEMALE = ['Ava', 'Samantha', 'Allison', 'Susan', 'Zoe', 'Joelle', 'Noelle', 'Nicky', 'Aria', 'Jenny', 'Michelle', 'Emma', 'Ana', 'Google US English'];
const GOOD_MALE = ['Evan', 'Nathan', 'Tom', 'Aaron', 'Alex', 'Guy', 'Christopher', 'Eric', 'Andrew', 'Brian', 'Davis', 'Roger', 'Steffan', 'Tony'];

const isUS = v => /^en[-_]US/i.test(v.lang);
const has = (v, list) => list.some(n => new RegExp(`\\b${n}\\b`, 'i').test(v.name));

export function voiceScore(v) {
  if (ROBOTIC.test(v.name)) return -1000;
  let s = 0;
  if (/premium/i.test(v.name)) s += 100;
  if (/enhanced|natural|neural|online/i.test(v.name)) s += 80;
  if (/^google/i.test(v.name)) s += 60;
  if (has(v, GOOD_FEMALE) || has(v, GOOD_MALE)) s += 40;
  if (/compact/i.test(v.name)) s -= 20;
  if (isUS(v)) s += 10;
  return s;
}

// Renvoie la voix principale (a) et celle du second interlocuteur (b).
// Si aucune seconde voix claire n'existe, b = a : mieux vaut la même voix nette qu'une voix robotique.
export function chooseVoices(all) {
  let pool = all.filter(isUS);
  if (!pool.length) pool = all.filter(v => /^en/i.test(v.lang));
  const ok = pool.filter(v => voiceScore(v) > -1000);
  const ranked = ok.slice().sort((x, y) => voiceScore(y) - voiceScore(x) || (y.localService - x.localService));
  const a = ranked[0] || pool[0] || null;
  const others = ranked.filter(v => v !== a && v.name !== (a && a.name) && voiceScore(v) >= 40);
  const male = others.filter(v => has(v, GOOD_MALE));
  const b = male[0] || others[0] || a;
  return { a, b, sameVoice: !b || b === a, hasUS: all.some(isUS) };
}
