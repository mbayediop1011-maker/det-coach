// Échelle de longueur de la Dictée longue.
// Niveau 1 = phrases de 6 à 8 mots, niveau 2 = 9 à 11, niveau 3 = 12 à 16.
// On commence au niveau 1 et on monte d'un niveau après une séance entière à 80 % de mots justes
// ou plus au premier passage. Le niveau se recalcule à partir de l'historique (rien à régler).
import { sessionsOf } from './db.js';

export const DICTEE_LEVELS = { 1: [6, 8], 2: [9, 11], 3: [12, 16] };
export const MAX_LEVEL = 3;
export const LEVEL_UP_PCT = 80;

export const wordCount = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;

export function itemLevel(item) {
  const n = wordCount(item.sentence);
  for (const [l, [a, b]] of Object.entries(DICTEE_LEVELS)) if (n >= a && n <= b) return Number(l);
  return null;
}

export async function dicteeLevel() {
  const list = (await sessionsOf('dictee-longue')).filter(s => !s.recovered && s.data && s.data.level);
  let level = 1, lastPct = null, sessionsAtLevel = 0;
  for (const s of list) {
    if (s.data.level !== level) continue;
    sessionsAtLevel++;
    lastPct = s.data.firstWordsPct;
    if (lastPct >= LEVEL_UP_PCT && level < MAX_LEVEL) { level++; lastPct = null; sessionsAtLevel = 0; }
  }
  return { level, range: DICTEE_LEVELS[level], lastPct, sessionsAtLevel, max: level === MAX_LEVEL };
}

export const rangeText = level => `${DICTEE_LEVELS[level][0]} à ${DICTEE_LEVELS[level][1]} mots`;

export function criterionText(L) {
  if (L.max) return `Niveau maximal (phrases de ${rangeText(L.level)}).`;
  return `Pour passer au niveau ${L.level + 1} (${rangeText(L.level + 1)}) : au moins ${LEVEL_UP_PCT} % de mots justes au premier passage sur une séance entière.`;
}
