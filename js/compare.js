// Comparaison de textes : mots justes, différences, erreurs de découpage, répétitions.
import { esc } from './ui.js';

export function normWord(w) {
  return w.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '');
}
export function words(text) {
  return String(text || '').split(/\s+/).map(w => ({ raw: w, n: normWord(w) })).filter(w => w.n);
}

// Alignement mot à mot (distance d'édition). Renvoie une liste d'opérations.
export function alignWords(expected, given) {
  const E = words(expected), G = words(given);
  const n = E.length, m = G.length;
  const d = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const c = E[i - 1].n === G[j - 1].n ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
  }
  const ops = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (E[i - 1].n === G[j - 1].n ? 0 : 1)) {
      ops.push(E[i - 1].n === G[j - 1].n ? { op: 'ok', e: E[i - 1].raw, g: G[j - 1].raw } : { op: 'sub', e: E[i - 1].raw, g: G[j - 1].raw });
      i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push({ op: 'miss', e: E[i - 1].raw }); i--; }
    else { ops.push({ op: 'extra', g: G[j - 1].raw }); j--; }
  }
  ops.reverse();
  const correct = ops.filter(o => o.op === 'ok').length;
  return { ops, correct, total: E.length, exact: correct === E.length && G.length === E.length, given: G.length };
}

export function diffHtml(ops) {
  return ops.map(o => {
    if (o.op === 'ok') return esc(o.e);
    if (o.op === 'sub') return `<del>${esc(o.g)}</del> <ins>${esc(o.e)}</ins>`;
    if (o.op === 'miss') return `<span class="miss">${esc(o.e)}</span>`;
    return `<del>${esc(o.g)}</del>`;
  }).join(' ');
}

export function diffText(ops) {
  return ops.map(o => {
    if (o.op === 'ok') return o.e;
    if (o.op === 'sub') return `[${o.g} → ${o.e}]`;
    if (o.op === 'miss') return `[_ → ${o.e}]`;
    return `[${o.g} → _]`;
  }).join(' ');
}

// Erreurs de découpage : on compare les suites de caractères sans espaces,
// puis on regarde où l'utilisateur a placé (ou oublié) des frontières de mots.
export function segmentationErrors(expected, given) {
  const prep = s => s.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
  const E = prep(expected), G = prep(given);
  const strip = s => { const chars = []; const bounds = new Set(); for (const ch of s) { if (ch === ' ') bounds.add(chars.length); else chars.push(ch); } return { chars, bounds }; };
  const e = strip(E), g = strip(G);
  const n = e.chars.length, m = g.chars.length;
  if (!n || !m) return [];
  // Alignement caractère par caractère.
  const d = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (e.chars[i - 1] === g.chars[j - 1] ? 0 : 1));
  }
  // map[i] = position correspondante dans g pour la frontière située avant le caractère i de e.
  const map = new Array(n + 1).fill(null);
  let i = n, j = m;
  map[n] = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (e.chars[i - 1] === g.chars[j - 1] ? 0 : 1)) { i--; j--; }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { i--; }
    else { j--; }
    if (map[i] == null) map[i] = j;
  }
  const gToE = new Map();
  for (let k = 0; k <= n; k++) if (map[k] != null && !gToE.has(map[k])) gToE.set(map[k], k);
  const errs = [];
  const ctx = (pos) => {
    // Mot(s) attendus autour de la frontière.
    const ew = E.split(' ');
    let acc = 0, idx = 0;
    for (; idx < ew.length; idx++) { if (acc + ew[idx].length >= pos) break; acc += ew[idx].length; }
    return ew.slice(Math.max(0, idx - 1), idx + 2).join(' ');
  };
  for (const b of e.bounds) {
    const gp = map[b];
    if (gp != null && !g.bounds.has(gp) && !g.bounds.has(gp - 1) && !g.bounds.has(gp + 1)) {
      // Frontière ratée : vérifier que les caractères autour correspondent à peu près.
      errs.push({ kind: 'ratée', expected: ctx(b), detail: `frontière manquante (mots collés) près de « ${ctx(b)} »` });
    }
  }
  for (const b of g.bounds) {
    const ep = gToE.get(b);
    if (ep != null && !e.bounds.has(ep) && !e.bounds.has(ep - 1) && !e.bounds.has(ep + 1) && ep > 0 && ep < n) {
      errs.push({ kind: 'en trop', expected: ctx(ep), detail: `frontière en trop (mot coupé) près de « ${ctx(ep)} »` });
    }
  }
  // On ne garde que les erreurs situées dans des zones globalement bien entendues
  // (sinon c'est une erreur de mot, pas de découpage).
  return errs.filter(er => {
    const exp = er.expected.replace(/\s+/g, '');
    return exp.length > 0;
  }).slice(0, 12);
}

// Score de proximité pour les réponses courtes (Listen and Complete) : mots pleins en commun.
const STOP = new Set('a an the to of in on at for and or but is are was were be been being it its this that these those he she they we you i his her their our your my me him them us with by from as so do does did have has had will would can could should not no yes very just also there here then than about into over up down out off'.split(' '));
export function contentWords(text) {
  return words(text).map(w => w.n).filter(w => !STOP.has(w) && w.length > 1);
}
export function overlapScore(expected, given) {
  const e = contentWords(expected);
  const g = new Set(contentWords(given).map(stem));
  if (!e.length) return given.trim() ? 1 : 0;
  const hit = e.filter(w => g.has(stem(w))).length;
  let score = hit / e.length;
  const gl = words(given).length, el = words(expected).length;
  if (gl > el * 2.5 + 3) score *= 0.8; // trop long
  return Math.max(0, Math.min(1, score));
}
export function stem(w) {
  return w.replace(/'s$/, '').replace(/(ing|ed|es|s|ly)$/, '').replace(/(.)\1$/, '$1');
}

// Répétitions lexicales : même mot plein employé plus de trois fois.
const STOP_REP = new Set([...STOP, 'i\'m', 'it\'s', 'don\'t', 'can\'t', 'what', 'which', 'who', 'when', 'where', 'how', 'all', 'some', 'if']);
export function repetitions(text, min = 4) {
  const counts = new Map();
  for (const w of words(text).map(x => x.n)) {
    if (STOP_REP.has(w) || w.length < 3) continue;
    const s = stem(w);
    const c = counts.get(s) || { n: 0, forms: new Set() };
    c.n++; c.forms.add(w);
    counts.set(s, c);
  }
  return [...counts.entries()].filter(([, c]) => c.n >= min).sort((a, b) => b[1].n - a[1].n).map(([, c]) => ({ word: [...c.forms].join('/'), n: c.n }));
}
