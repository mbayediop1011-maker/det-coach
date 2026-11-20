// Comparaison de textes : mots justes, différences, erreurs de découpage, répétitions.
import { esc } from './ui.js';

export function normWord(w) {
  return w.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '');
}
export function words(text) {
  return String(text || '').split(/\s+/).map(w => ({ raw: w, n: normWord(w) })).filter(w => w.n);
}

// ---------- Contractions ----------
// Une contraction et sa forme développée sont équivalentes : ni faute de mot, ni faute de frontière.
const CONTR = {
  "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are',
  "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not',
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'can not', cannot: 'can not',
  "won't": 'will not', "wouldn't": 'would not', "shouldn't": 'should not', "couldn't": 'could not',
  "mustn't": 'must not', "haven't": 'have not', "hasn't": 'has not', "hadn't": 'had not', "needn't": 'need not',
  "i've": 'i have', "you've": 'you have', "we've": 'we have', "they've": 'they have', "could've": 'could have', "would've": 'would have', "should've": 'should have',
  "i'll": 'i will', "you'll": 'you will', "he'll": 'he will', "she'll": 'she will', "it'll": 'it will', "we'll": 'we will', "they'll": 'they will', "that'll": 'that will', "there'll": 'there will',
  "let's": 'let us', "ain't": 'is not',
};
const S_PRON = new Set(['he', 'she', 'it', 'that', 'there', 'here', 'what', 'where', 'who', 'how', 'when', 'why']); // X's = X is / X has
const D_PRON = new Set(['i', 'you', 'he', 'she', 'it', 'we', 'they', 'that', 'there', 'who']); // X'd = X would / X had

// Mots normalisés, contractions développées. `ref` (l'autre texte) sert à lever l'ambiguïté de 's et 'd.
export function canonWords(text, ref = '') {
  const refStr = ' ' + words(ref).map(w => w.n).join(' ') + ' ';
  const out = [];
  words(text).forEach((w, rawIdx) => {
    let exp = CONTR[w.n];
    if (!exp) {
      const m = w.n.match(/^([a-z]+)'(s|d)$/);
      if (m && m[2] === 's' && S_PRON.has(m[1])) exp = refStr.includes(` ${m[1]} has `) ? `${m[1]} has` : `${m[1]} is`;
      else if (m && m[2] === 'd' && D_PRON.has(m[1])) exp = refStr.includes(` ${m[1]} had `) ? `${m[1]} had` : `${m[1]} would`;
    }
    if (exp) exp.split(' ').forEach((n, part) => out.push({ n, raw: w.raw, show: n, rawIdx, part, expanded: true }));
    else out.push({ n: w.n, raw: w.raw, show: w.raw, rawIdx, part: 0, expanded: false });
  });
  return out;
}

// Formes réduites de l'oral écrites en un seul mot : erreur de découpage, pas omission.
const REDUCED = {
  wanna: 'wantto', gonna: 'goingto', gotta: 'gotto', hafta: 'haveto', hasta: 'hasto', oughta: 'oughtto',
  kinda: 'kindof', sorta: 'sortof', lotta: 'lotof', outta: 'outof', dunno: 'dontknow', lemme: 'letme',
  gimme: 'giveme', useta: 'usedto', whatcha: 'whatyou', didja: 'didyou', woulda: 'wouldhave', coulda: 'couldhave',
};
const glue = (...t) => t.map(x => x.n.replace(/'/g, '')).join('');
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Mot mal orthographié mais reconnaissable (l'utilisateur a bien entendu quelque chose de proche).
const nearMiss = (a, b) => a.length >= 3 && lev(a, b) <= Math.max(1, Math.floor(b.length / 3));
// Deux mots attendus écrits en un seul (« pickedit », « setup », « wanna »).
const isMerge = (g, e1, e2) => { const t = glue(e1, e2), x = REDUCED[g.n] || g.n.replace(/'/g, ''); return x === t || (t.length >= 6 && lev(x, t) <= 1); };
// Un mot attendu coupé en deux (« re port »).
const isSplit = (e, g1, g2) => { const t = glue(g1, g2), x = e.n.replace(/'/g, ''); return x === t || (x.length >= 6 && lev(x, t) <= 1); };

// Alignement mot à mot (distance d'édition) sur les mots développés.
// Opérations : ok, sub (mot faux), miss (mot omis), extra (mot en trop),
// merge (deux mots attendus écrits en un), split (un mot attendu écrit en deux).
export function alignWords(expected, given) {
  const E = canonWords(expected, given), G = canonWords(given, expected);
  const n = E.length, m = G.length;
  const d = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const subCost = (i, j) => E[i - 1].n === G[j - 1].n ? 0 : 1;
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + subCost(i, j));
    if (i >= 2 && isMerge(G[j - 1], E[i - 2], E[i - 1])) v = Math.min(v, d[i - 2][j - 1] + 0.9);
    if (j >= 2 && isSplit(E[i - 1], G[j - 2], G[j - 1])) v = Math.min(v, d[i - 1][j - 2] + 0.9);
    d[i][j] = v;
  }
  const ops = [];
  let i = n, j = m;
  const eq = (a, b) => Math.abs(a - b) < 1e-9;
  while (i > 0 || j > 0) {
    if (i >= 2 && j >= 1 && isMerge(G[j - 1], E[i - 2], E[i - 1]) && eq(d[i][j], d[i - 2][j - 1] + 0.9)) {
      ops.push({ op: 'merge', e: E[i - 1], e0: E[i - 2], g: G[j - 1], ei: i - 1, ei0: i - 2 }); i -= 2; j -= 1;
    } else if (i >= 1 && j >= 2 && isSplit(E[i - 1], G[j - 2], G[j - 1]) && eq(d[i][j], d[i - 1][j - 2] + 0.9)) {
      ops.push({ op: 'split', e: E[i - 1], g: G[j - 1], g0: G[j - 2], ei: i - 1 }); i -= 1; j -= 2;
    } else if (i > 0 && j > 0 && eq(d[i][j], d[i - 1][j - 1] + subCost(i, j))) {
      ops.push({ op: subCost(i, j) ? 'sub' : 'ok', e: E[i - 1], g: G[j - 1], ei: i - 1 }); i--; j--;
    } else if (i > 0 && eq(d[i][j], d[i - 1][j] + 1)) { ops.push({ op: 'miss', e: E[i - 1], ei: i - 1 }); i--; }
    else { ops.push({ op: 'extra', g: G[j - 1] }); j--; }
  }
  ops.reverse();
  const correct = ops.filter(o => o.op === 'ok').length;
  const omitted = ops.filter(o => o.op === 'miss').length;
  const rawTotal = words(expected).length;
  return {
    ops, correct, total: E.length, omitted,
    segWords: ops.filter(o => o.op === 'merge' || o.op === 'split').length,
    exact: correct === E.length && G.length === E.length,
    given: G.length,
    collapse: collapsePoint(ops, E, rawTotal),
    rawTotal,
  };
}

// Position du décrochage : rang (dans la phrase écrite) du dernier mot juste avant la première
// série d'au moins COLLAPSE_RUN mots attendus « perdus » d'affilée. Un mot est perdu s'il est omis
// ou remplacé par un mot sans rapport ; une faute d'orthographe proche ou une erreur de découpage
// (mots collés ou coupés) ne fait pas décrocher la phrase. null = la phrase tient jusqu'au bout.
export const COLLAPSE_RUN = 2;
function collapsePoint(ops, E, rawTotal) {
  const kept = new Array(E.length).fill(false), right = new Array(E.length).fill(false);
  for (const o of ops) {
    if (o.op === 'ok') { kept[o.ei] = right[o.ei] = true; }
    else if (o.op === 'merge') { kept[o.ei] = kept[o.ei0] = true; }
    else if (o.op === 'split') kept[o.ei] = true;
    else if (o.op === 'sub') kept[o.ei] = nearMiss(o.g.n, o.e.n);
  }
  for (let k = 0; k + COLLAPSE_RUN <= kept.length; k++) {
    if (kept.slice(k, k + COLLAPSE_RUN).every(v => !v)) {
      let j = k - 1;
      while (j >= 0 && !right[j]) j--;
      const rank = j >= 0 ? E[j].rawIdx + 1 : 0;
      return { rank, of: rawTotal, word: j >= 0 ? E[j].raw : null, ratio: rawTotal ? rank / rawTotal : 0 };
    }
  }
  return null;
}

// Affichage : un mot contracté juste s'affiche tel que l'utilisateur l'a écrit (une seule fois).
function renderOps(ops, fmt) {
  const out = [];
  let lastOkRaw = null;
  for (const o of ops) {
    if (o.op === 'ok') {
      const g = o.g;
      if (g.part > 0 && lastOkRaw === g.rawIdx) continue;
      lastOkRaw = g.rawIdx;
      out.push(fmt.ok(g.part === 0 ? g.raw : g.show));
    } else {
      lastOkRaw = null;
      if (o.op === 'sub') out.push(fmt.sub(o.g.show, o.e.show));
      else if (o.op === 'merge') out.push(fmt.sub(o.g.show, o.e0.show + ' ' + o.e.show));
      else if (o.op === 'split') out.push(fmt.sub(o.g0.show + ' ' + o.g.show, o.e.show));
      else if (o.op === 'miss') out.push(fmt.miss(o.e.show));
      else out.push(fmt.extra(o.g.show));
    }
  }
  return out.join(' ');
}
export function diffHtml(ops) {
  return renderOps(ops, {
    ok: w => esc(w),
    sub: (g, e) => `<del>${esc(g)}</del> <ins>${esc(e)}</ins>`,
    miss: e => `<span class="miss">${esc(e)}</span>`,
    extra: g => `<del>${esc(g)}</del>`,
  });
}
export function diffText(ops) {
  return renderOps(ops, { ok: w => w, sub: (g, e) => `[${g} → ${e}]`, miss: e => `[_ → ${e}]`, extra: g => `[${g} → _]` });
}

// Erreurs de découpage : comparaison des suites de caractères sans espaces (contractions développées).
// Une frontière n'est jugée que là où l'utilisateur a effectivement écrit quelque chose : les lettres
// des deux côtés doivent être alignées sur des lettres écrites, côte à côte. Un mot omis n'est pas
// une frontière ratée (il est compté dans le taux d'omission).
export function segmentationErrors(expected, given) {
  const E = canonWords(expected, given).map(t => t.n).join(' ');
  const G = canonWords(given, expected).map(t => t.n).join(' ');
  const strip = s => { const chars = []; const bounds = new Set(); for (const ch of s) { if (ch === ' ') bounds.add(chars.length); else if (ch !== "'") chars.push(ch); } return { chars, bounds }; };
  const e = strip(E), g = strip(G);
  const n = e.chars.length, m = g.chars.length;
  if (!n || !m) return [];
  const d = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (e.chars[i - 1] === g.chars[j - 1] ? 0 : 1));
  }
  const eToG = new Array(n).fill(-1), gToE = new Array(m).fill(-1), same = new Array(n).fill(false);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (e.chars[i - 1] === g.chars[j - 1] ? 0 : 1)) {
      eToG[i - 1] = j - 1; gToE[j - 1] = i - 1; same[i - 1] = e.chars[i - 1] === g.chars[j - 1]; i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) i--;
    else j--;
  }
  const ew = E.split(' ');
  const ctx = pos => {
    let acc = 0, idx = 0;
    for (; idx < ew.length; idx++) { if (acc + ew[idx].replace(/'/g, '').length >= pos) break; acc += ew[idx].replace(/'/g, '').length; }
    return ew.slice(Math.max(0, idx - 1), idx + 2).join(' ');
  };
  const near = (set, x) => set.has(x) || set.has(x - 1) || set.has(x + 1);
  const errs = [];
  for (const b of e.bounds) {
    const a = eToG[b - 1], c = eToG[b];
    if (a < 0 || c < 0 || c !== a + 1 || !(same[b - 1] || same[b])) continue; // pas écrit des deux côtés
    if (!near(g.bounds, c)) errs.push({ kind: 'ratée', expected: ctx(b), detail: `frontière manquante (mots collés) près de « ${ctx(b)} »` });
  }
  for (const b of g.bounds) {
    const a = gToE[b - 1], c = gToE[b];
    if (a < 0 || c < 0 || c !== a + 1 || !(same[a] || same[c])) continue;
    if (!near(e.bounds, c)) errs.push({ kind: 'en trop', expected: ctx(c), detail: `frontière en trop (mot coupé) près de « ${ctx(c)} »` });
  }
  // Fusions et coupures repérées mot à mot (y compris les formes réduites : wanna, gonna, lotta…).
  const clean = t => t.toLowerCase().replace(/[^a-z' ]/g, '').trim();
  const wordErrs = alignWords(expected, given).ops.filter(o => o.op === 'merge' || o.op === 'split').map(o => o.op === 'merge'
    ? { kind: 'ratée', expected: clean(`${o.e0.show} ${o.e.show}`), detail: `mots collés : « ${o.g.show} » au lieu de « ${o.e0.show} ${o.e.show} »` }
    : { kind: 'en trop', expected: clean(o.e.show), detail: `mot coupé : « ${o.g0.show} ${o.g.show} » au lieu de « ${o.e.show} »` });
  const covered = wordErrs.map(w => w.expected);
  const rest = errs.filter(er => !covered.some(c => er.expected.includes(c)));
  return [...wordErrs, ...rest].slice(0, 12);
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
