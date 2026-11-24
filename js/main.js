// DET Coach — navigation et écrans transversaux.
import { h, icon, toast, fmtDate, fmtNum, copyText, downloadText, isTyping, mdInline, esc } from './ui.js';
import { EXERCISES, SKILLS, byId, loadItems, loadConsignes, loadObjectifs, objectiveOf, ORAL } from './registry.js';
import { db, getPref, setPref, saveSession, allSessions, sessionsOf, recordingBlob, unfinishedRecordings, finishRecording, askPersistence } from './db.js';
import { pickItems, markServed, seenCount } from './rotation.js';
import { buildReport, combineReports, fmtDuration } from './report.js';
import { lineChart } from './charts.js';
import { claudeButton } from './claude.js';
import { Recorder, analyzeSpeech, vuMeter, micSupported, releaseMic, getThreshold, DEFAULT_THRESHOLD } from './audio.js';
import { speak, cancelSpeech, pickVoices, voicesReady, getRate, setRate, ttsSupported, srSupported, unlockSpeech } from './speech.js';
import { getAudioCtx } from './audio.js';
import { runExam } from './exam.js';
import { dicteeLevel, itemLevel, criterionText, rangeText, LEVEL_UP_PCT } from './levels.js';

const app = document.getElementById('app');
let keyHandlers = {};
let cleanups = [];
let quitArmed = 0;

// ---------- Utilitaires de navigation ----------
export function setKeys(map) { keyHandlers = map || {}; }
export function onCleanup(fn) { cleanups.push(fn); }
function runCleanups() {
  const list = cleanups; cleanups = [];
  for (const fn of list) { try { fn(); } catch {} }
  cancelSpeech();
}
function mount(view, { exercise = false } = {}) {
  runCleanups();
  setKeys({});
  document.body.classList.toggle('in-exercise', exercise);
  app.replaceChildren(view);
  view.classList.add('view');
  window.scrollTo({ top: 0 });
  app.focus({ preventScroll: true });
}
export function go(route) {
  if (location.hash === '#' + route) router();
  else location.hash = route;
}

document.addEventListener('keydown', e => {
  if (e.isComposing) return;
  let key = e.key;
  if (key === ' ' || key === 'Spacebar') {
    if (isTyping(e) || (e.target && e.target.tagName === 'BUTTON')) return;
    key = 'Space';
  }
  if (key === 'Enter' && e.target && e.target.tagName === 'TEXTAREA' && !(e.ctrlKey || e.metaKey)) return;
  if (key === 'Enter' && e.target && e.target.tagName === 'BUTTON' && !keyHandlers.forceEnter) return;
  const fn = keyHandlers[key] || (key.length === 1 ? keyHandlers[key.toLowerCase()] : null);
  if (fn) { e.preventDefault(); fn(e); }
});

['click', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, () => { unlockSpeech(); }, { once: true, capture: true }));

document.addEventListener('click', e => {
  const b = e.target.closest('[data-nav]');
  if (b) go(b.dataset.nav);
});

// ---------- Accueil ----------
async function homeView() {
  const [objectifs, sessions] = await Promise.all([loadObjectifs(), allSessions()]);
  const lastBy = {};
  for (const s of sessions) if (!s.recovered) lastBy[s.type] = s;
  const micDone = await getPref('micTested', false);

  const view = h('section', {});
  if (!micDone && micSupported()) {
    view.append(h('div', { class: 'banner' }, h('span', { style: { fontSize: '26px' } }, '🎙️'),
      h('div', { class: 'spacer' }, h('b', {}, 'Teste ton micro une fois avant les épreuves orales.'), h('div', { class: 'small muted' }, '3 secondes de parole : l’application règle la détection des silences sur ta voix.')),
      h('button', { class: 'btn go', 'data-nav': 'mic' }, 'Tester')));
  }

  // Point faible : plus grand écart relatif à l'objectif.
  let weak = null;
  for (const ex of EXERCISES) {
    const o = objectiveOf(objectifs, ex.id);
    const last = lastBy[ex.id];
    if (!o || !last || last.primary == null) continue;
    const gap = (last.primary - o.objectif) / Math.max(1, Math.abs(o.objectif));
    if (gap < 0 && (!weak || gap < weak.gap)) weak = { ex, gap, last, o };
  }
  const neverDone = EXERCISES.filter(ex => !lastBy[ex.id]);

  const hero = h('div', { class: 'hero' },
    h('div', { class: 'hero-main' },
      h('h1', {}, 'On s’entraîne ', h('span', { class: 'grad-text' }, 'maintenant\u00a0?')),
      h('p', {}, 'Choisis une épreuve : consignes, chrono, correction. Tout est fidèle au vrai Duolingo English Test 2026.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => go('exam/full'), html: `${icon('exam')}<span>Examen blanc complet <small style="opacity:.8">~1 h</small></span>` }),
        h('button', { class: 'btn', onclick: () => go('exam/mini'), html: `<span>Mini examen <small class="muted">~20 min</small></span>` }))),
    h('div', { class: 'hero-side' },
      weak
        ? h('button', { class: 'mini-card ' + SKILLS[weak.ex.skill].cls, onclick: () => go('brief/' + weak.ex.id) },
          h('span', { class: 'label', html: `🎯 Ton point faible` }),
          h('span', { class: 'big' }, weak.ex.name),
          h('span', { class: 'muted small' }, `Dernier résultat ${fmtNum(weak.last.primary, weak.last.primary % 1 ? 1 : 0)} — objectif ${fmtNum(weak.o.objectif)} · Travailler maintenant →`))
        : h('div', { class: 'mini-card' },
          h('span', { class: 'label' }, '🎯 Ton point faible'),
          h('span', { class: 'muted small' }, 'Il apparaîtra ici quand tu auras des résultats sur des exercices qui ont un objectif fixé par ton professeur.')),
      neverDone.length
        ? h('button', { class: 'mini-card', onclick: () => go('brief/' + neverDone[0].id) },
          h('span', { class: 'label' }, '🧭 Jamais essayé'),
          h('span', { class: 'big' }, neverDone[0].name),
          h('span', { class: 'muted small' }, `${neverDone.length} épreuve${neverDone.length > 1 ? 's' : ''} encore jamais faite${neverDone.length > 1 ? 's' : ''}`))
        : h('button', { class: 'mini-card', 'data-nav': 'history' },
          h('span', { class: 'label' }, '📈 Historique'),
          h('span', { class: 'big' }, `${sessions.length} séances`),
          h('span', { class: 'muted small' }, 'Voir la progression et exporter pour le prof →'))));
  view.append(hero);

  for (const [skill, meta] of Object.entries(SKILLS)) {
    const list = EXERCISES.filter(e => e.skill === skill);
    if (!list.length) continue;
    view.append(h('div', { class: 'skill-title ' + meta.cls },
      h('span', { class: 'dot', style: { background: 'linear-gradient(135deg,var(--c1),var(--c2))' } }),
      h('h2', {}, meta.name)));
    const grid = h('div', { class: 'grid' });
    for (const ex of list) {
      const card = h('button', { class: 'card ' + (ex.extra ? SKILLS.extra.cls : meta.cls), onclick: () => openExercise(ex.id) },
        h('span', { class: 'chip', 'data-chip': ex.id }, ex.extra ? 'hors test · ' + ex.time : ex.time),
        h('span', { class: 'ico', html: icon(ex.icon) }),
        h('span', { class: 'name' }, ex.name),
        h('span', { class: 'fr' }, ex.fr),
        h('span', { class: 'stats' },
          h('span', { class: 'last' }, lastLabel(ex, lastBy[ex.id], objectiveOf(objectifs, ex.id))),
          h('span', { class: 'seen', 'data-seen': ex.id }, '…')));
      grid.append(card);
    }
    view.append(grid);
  }
  view.append(h('p', { class: 'kbd-hint mt' }, 'Clavier : Entrée pour commencer et valider · Espace pour écouter ou enregistrer · Échap pour revenir'));
  mount(view);

  // Compteurs « items vus sur N » (asynchrones pour ne pas retarder l'affichage).
  for (const ex of EXERCISES) {
    loadItems(ex).then(async items => {
      let prefix = '';
      if (ex.id === 'dictee-longue') {
        const L = await dicteeLevel();
        items = items.filter(it => itemLevel(it) === L.level);
        prefix = `Niv. ${L.level} · `;
        const chip = view.querySelector(`[data-chip="${ex.id}"]`);
        if (chip) chip.textContent = `hors test · niveau ${L.level}/3`;
      }
      const n = await seenCount(ex.id, items);
      const el = view.querySelector(`[data-seen="${ex.id}"]`);
      if (el) el.textContent = `${prefix}${n} vus sur ${items.length}`;
    }).catch(() => {
      const el = view.querySelector(`[data-seen="${ex.id}"]`);
      if (el) el.textContent = 'contenu introuvable';
    });
  }
  setKeys({ Escape: () => {} });
}

function lastLabel(ex, last, o) {
  if (!last) return 'Pas encore fait';
  const v = fmtNum(last.primary, last.primary % 1 ? 1 : 0);
  return o ? `${v}${ex.unit} · obj. ${fmtNum(o.objectif)}` : `Dernier : ${v}${ex.unit}`;
}

async function openExercise(id) {
  const hidden = await getPref('hideBrief:' + id, false);
  go(hidden ? 'run/' + id : 'brief/' + id);
}

// ---------- Écran de consignes ----------
// Consignes propres à une étape d'un exercice (clé dédiée dans consignes.json).
const SUB_STEPS = {
  'interactive-listening': [['summarize-the-conversation', 'Étape 3 · Summarize the Conversation']],
};
function subSteps(id, consignes, block) {
  const out = [];
  for (const [key, title] of SUB_STEPS[id] || []) {
    const c = consignes[key];
    if (!c) continue;
    out.push(h('h2', { class: 'mt', style: { margin: '14px 0 2px' } }, title),
      block('1 · Ce que c’est', c.format),
      block('2 · Ce que ça mesure vraiment', c.mesure),
      block('3 · La méthode', c.methode),
      block('4 · Ton piège', c.piege, 'trap'));
  }
  return out;
}
async function briefView(id) {
  const ex = byId(id);
  if (!ex) return go('home');
  const [consignes, objectifs, sessions] = await Promise.all([loadConsignes(), loadObjectifs(), sessionsOf(id)]);
  const c = consignes[id] || {};
  const o = objectiveOf(objectifs, id);
  const last = sessions.filter(s => !s.recovered).pop();
  const hasText = v => Array.isArray(v) ? v.filter(x => String(x).trim()).length > 0 : !!(v && String(v).trim());
  const block = (title, content, cls = '') => {
    const empty = !hasText(content);
    const b = h('div', { class: 'block ' + cls + (empty ? ' empty' : '') }, h('div', { class: 'bt' }, title));
    if (empty) b.append(h('div', {}, 'Consignes pas encore écrites par ton professeur.'));
    else if (Array.isArray(content)) {
      const list = content.filter(x => String(x).trim());
      // Si le professeur numérote lui-même (« 1. OBLIGATOIRE… »), on n'ajoute pas nos numéros.
      const own = list.some(x => /(^|\s)\d+\.\s/.test(x));
      b.append(h(own ? 'ul' : 'ol', { class: own ? 'own-num' : '' }, list.map(x => h('li', { html: mdInline(x) }))));
    }
    else b.append(h('div', { html: mdInline(content) }));
    return b;
  };
  const goal = h('div', { class: 'block' }, h('div', { class: 'bt' }, '5 · Ton objectif'),
    o
      ? h('div', { class: 'goal' },
        h('div', { class: 'g target' }, h('div', { class: 'v' }, fmtNum(o.objectif)), h('div', { class: 'k' }, 'objectif · ' + (o.metrique || ex.metric))),
        h('div', { class: 'g' }, h('div', { class: 'v' }, last ? fmtNum(last.primary, last.primary % 1 ? 1 : 0) : '—'), h('div', { class: 'k' }, 'ton dernier résultat')),
        h('div', { class: 'g' }, h('div', { class: 'v' }, o.actuel == null ? '—' : fmtNum(o.actuel)), h('div', { class: 'k' }, 'niveau relevé par ton prof')))
      : h('div', { class: 'muted', style: { fontStyle: 'italic' } }, `Objectif pas encore fixé par ton professeur. Mesure suivie : ${ex.metric}. Dernier résultat : ${last ? fmtNum(last.primary, last.primary % 1 ? 1 : 0) + ex.unit : '—'}.`));

  const hiddenNow = await getPref('hideBrief:' + id, false);
  const start = h('button', { class: 'btn go big', onclick: () => go('run/' + id), html: `${icon('play')}<span>Commencer</span> <kbd>Entrée</kbd>` });
  const toggle = h('button', { class: 'btn ghost small', onclick: async () => {
    const v = !(await getPref('hideBrief:' + id, false));
    await setPref('hideBrief:' + id, v);
    toggle.textContent = v ? 'Consignes masquées la prochaine fois (cliquer pour réafficher)' : 'Masquer les consignes';
    toast(v ? 'La prochaine fois, l’exercice démarrera directement.' : 'Les consignes s’afficheront à nouveau.');
  } }, hiddenNow ? 'Consignes masquées la prochaine fois (cliquer pour réafficher)' : 'Masquer les consignes');

  const view = h('section', { class: 'brief ' + SKILLS[ex.skill].cls },
    h('div', { class: 'brief-head' }, h('div', { class: 'ico', html: icon(ex.icon) }),
      h('div', {}, h('div', { class: 'muted small', style: { fontWeight: 800 } }, SKILLS[ex.skill].name + ' · ' + ex.time), h('h1', {}, ex.name))),
    id === 'dictee-longue' ? await levelPanel() : null,
    h('div', { class: 'blocks' },
      ...([c.format, c.mesure, c.methode, c.piege].some(hasText)
        ? [block('1 · Ce que c’est', c.format),
          block('2 · Ce que ça mesure vraiment', c.mesure),
          block('3 · La méthode', c.methode),
          block('4 · Ton piège', c.piege, 'trap')]
        : [h('div', { class: 'block empty' }, h('div', { class: 'bt' }, '1 à 4 · Consignes'), h('div', {}, 'Consignes pas encore écrites par ton professeur.'))]),
      ...subSteps(id, consignes, block),
      goal),
    h('div', { class: 'brief-actions' }, start, toggle,
      h('button', { class: 'btn ghost', 'data-nav': 'home' }, 'Retour')));
  mount(view);
  setKeys({ Enter: () => go('run/' + id), Escape: () => go('home'), forceEnter: true });
}

async function levelPanel() {
  const L = await dicteeLevel();
  const steps = [1, 2, 3].map(k => h('div', { class: 'lvl-step' + (k < L.level ? ' done' : k === L.level ? ' on' : '') },
    h('b', {}, `Niveau ${k}`), h('span', {}, rangeText(k))));
  return h('div', { class: 'level-panel' },
    h('div', { class: 'lvl-steps' }, steps),
    h('p', { style: { margin: '10px 0 0', fontWeight: 700 } }, `Tu es au niveau ${L.level} : phrases de ${rangeText(L.level)}.`),
    h('p', { class: 'muted', style: { margin: '4px 0 0' } }, criterionText(L) + (L.lastPct != null && !L.max ? ` Dernière séance à ce niveau : ${fmtNum(L.lastPct, 1)} %.` : '')));
}

// ---------- Lancement d'un exercice ----------
const MODULES = {};
async function loadModule(name) {
  if (!MODULES[name]) MODULES[name] = await import(`./exercises/${name}.js`);
  return MODULES[name];
}

export function exerciseShell(ex, { onQuit } = {}) {
  const progress = h('span', { class: 'progress' });
  const quit = h('button', { class: 'btn ghost quit small', type: 'button', html: `${icon('back')}<span>Quitter</span>` });
  const body = h('div', {});
  const shell = h('section', { class: 'ex ' + SKILLS[ex.skill].cls },
    h('div', { class: 'ex-top' }, h('span', { class: 'tag' }, ex.name), progress, quit), body);
  const tryQuit = () => {
    const now = Date.now();
    if (now - quitArmed < 2500) { quitArmed = 0; onQuit ? onQuit() : go('home'); }
    else { quitArmed = now; toast('Appuie encore pour quitter (la séance ne sera pas enregistrée)'); }
  };
  quit.addEventListener('click', tryQuit);
  return { shell, body, progress, tryQuit };
}

// Contexte passé à chaque module d'exercice.
function makeCtx(ex, body, progress, { exam = false, tryQuit }) {
  const ctx = {
    ex, root: body, exam, aborted: false,
    setProgress: t => { progress.textContent = t; },
    onCleanup,
    setKeys: map => setKeys({ Escape: tryQuit, ...map }),
    toast,
  };
  onCleanup(() => { ctx.aborted = true; });
  return ctx;
}

export async function runOne(ex, { exam = false, count = null, onQuit = null, tryQuitOverride = null } = {}) {
  let items = await loadItems(ex);
  const meta = {};
  if (ex.id === 'dictee-longue') {
    meta.level = await dicteeLevel();
    items = items.filter(it => itemLevel(it) === meta.level.level);
  }
  const n = count || ex.perRun;
  const picked = await pickItems(ex.id, items, n);
  if (!picked.length) throw new Error('Aucun item disponible pour ' + ex.name);
  await markServed(ex.id, picked);
  const mod = await loadModule(ex.module);
  const { shell, body, progress, tryQuit } = exerciseShell(ex, { onQuit });
  mount(shell, { exercise: true });
  const ctx = makeCtx(ex, body, progress, { exam, tryQuit: tryQuitOverride || tryQuit });
  ctx.meta = meta;
  ctx.setKeys({});
  const t0 = Date.now();
  const res = await mod.run(ctx, picked);
  if (ctx.aborted || !res) return null;
  const objectifs = await loadObjectifs();
  const objective = objectiveOf(objectifs, ex.id);
  const session = {
    type: ex.id,
    date: new Date(t0).toISOString(),
    durationMs: res.durationMs ?? (Date.now() - t0),
    exam,
    itemIds: picked.map(p => p.id),
    score: res.score,
    primary: res.primary,
    reminders: res.reminders || [],
    sections: res.sections || [],
    audio: res.audio || [],
    claude: res.claude || [],
    data: res.data || {},
    viewHtml: res.view ? res.view.outerHTML : '',
  };
  session.report = buildReport(ex, session, objective);
  session.id = await saveSession(session);
  releaseMic();
  return session;
}

async function runView(id) {
  const ex = byId(id);
  if (!ex) return go('home');
  try {
    const s = await runOne(ex);
    if (s) go('result/' + s.id);
  } catch (err) {
    console.error(err);
    mount(h('section', { class: 'panel' }, h('h2', {}, 'Oups'), h('p', {}, String(err.message || err)), h('button', { class: 'btn', 'data-nav': 'home' }, 'Accueil')));
  }
}

// ---------- Résultat d'une séance ----------
export async function resultView(sessionId, { embedded = false } = {}) {
  const s = await db.get('sessions', Number(sessionId));
  if (!s) return go('home');
  const ex = byId(s.type) || { name: s.type, skill: 'read', unit: '', metric: '' };
  const objective = objectiveOf(await loadObjectifs(), s.type);
  const pct = s.score && s.score.pct != null ? s.score.pct : (objective && s.primary != null ? Math.min(1, s.primary / objective.objectif) : 0);
  const gap = objective && s.primary != null ? s.primary - objective.objectif : null;
  const dec = v => (v % 1 ? 1 : 0);

  const view = h('section', { class: 'ex ' + SKILLS[ex.skill].cls });
  view.append(h('div', { class: 'ex-top' }, h('span', { class: 'tag' }, ex.name), h('span', { class: 'progress' }, fmtDate(s.date) + (s.exam ? ' · examen blanc' : ''))));
  const ring = h('div', { class: 'score-ring', style: { '--p': 0 } }, h('div', { class: 'in' },
    h('div', { class: 'v' }, s.primary == null ? '—' : fmtNum(s.primary, dec(s.primary))),
    h('div', { class: 'k' }, (objective && objective.metrique) || ex.metric)));
  requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.transition = '--p 1s'; ring.style.setProperty('--p', Math.max(0, Math.min(1, pct)).toFixed(3)); }));
  view.append(h('div', { class: 'result-hero' }, ring,
    h('div', {},
      h('h2', {}, s.score ? s.score.text : 'Séance terminée'),
      h('p', { class: 'muted' }, `Durée réelle : ${fmtDuration(s.durationMs)}`),
      h('div', { class: 'cmp' },
        h('div', { class: 'g' }, h('div', { class: 'v' }, objective ? fmtNum(objective.objectif) : '—'), h('div', { class: 'k' }, 'objectif')),
        h('div', { class: 'g' }, h('div', { class: 'v' }, s.primary == null ? '—' : fmtNum(s.primary, dec(s.primary))), h('div', { class: 'k' }, 'résultat')),
        h('div', { class: 'g' }, h('div', { class: 'v ' + (gap == null ? '' : gap >= 0 ? 'pos' : 'neg') }, gap == null ? '—' : (gap >= 0 ? '+' : '−') + fmtNum(Math.abs(gap), dec(gap))), h('div', { class: 'k' }, 'écart'))),
      objective ? null : h('p', { class: 'small faint mt' }, 'Objectif pas encore fixé par ton professeur.'))));

  for (const r of s.reminders || []) view.append(h('div', { class: 'reminder' }, '↻ Règle de méthode non appliquée : ' + r));

  if (s.viewHtml) {
    const holder = h('div', { html: s.viewHtml });
    view.append(holder);
    // Brancher les lecteurs audio sur les enregistrements stockés.
    for (const slot of holder.querySelectorAll('[data-rec]')) {
      const blob = await recordingBlob(slot.dataset.rec);
      if (blob) {
        const url = URL.createObjectURL(blob);
        slot.replaceChildren(h('audio', { controls: true, src: url, preload: 'metadata' }));
        onCleanup(() => URL.revokeObjectURL(url));
      } else slot.textContent = 'Enregistrement introuvable.';
    }
  }

  for (const c of s.claude || []) view.append(claudeButton(c));

  const md = s.report || '';
  view.append(h('div', { class: 'panel mt' },
    h('h3', {}, '📄 Rapport pour ton professeur'),
    h('p', { class: 'muted small' }, 'Chiffres bruts, sans commentaire. Copie-le et colle-le au début du cours.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: async () => toast(await copyText(md) ? 'Rapport copié' : 'Copie impossible'), html: `${icon('copy')}<span>Copier le rapport</span>` }),
      h('button', { class: 'btn ghost', onclick: () => downloadText(`rapport-${s.type}-${s.date.slice(0, 16).replace(/[:T]/g, '-')}.md`, md), html: `${icon('dl')}<span>Télécharger (.md)</span>` })),
    h('details', { class: 'fold' }, h('summary', {}, 'Voir le rapport'), h('pre', { class: 'md' }, md))));

  if (!embedded) {
    const hidden = await getPref('hideBrief:' + s.type, false);
    view.append(h('div', { class: 'brief-actions' },
      byId(s.type) ? h('button', { class: 'btn go big', onclick: () => openExercise(s.type), html: `${icon('refresh')}<span>Encore un (nouvel item)</span> <kbd>Entrée</kbd>` }) : null,
      hidden ? h('button', { class: 'btn ghost', onclick: async () => { await setPref('hideBrief:' + s.type, false); go('brief/' + s.type); } }, 'Réafficher les consignes') : null,
      h('button', { class: 'btn ghost', 'data-nav': 'home' }, 'Accueil')));
    mount(view);
    setKeys({ Enter: () => byId(s.type) && openExercise(s.type), Escape: () => go('home') });
  }
  return view;
}

// ---------- Historique ----------
async function historyView(filter) {
  const sessions = (await allSessions()).filter(s => !s.recovered || s.audio?.length);
  const objectifs = await loadObjectifs();
  const types = EXERCISES.filter(ex => sessions.some(s => s.type === ex.id));
  const current = filter && byId(filter) ? filter : (types[0] && types[0].id);
  const view = h('section', {});
  view.append(h('h1', {}, 'Historique'));

  const lastExport = await getPref('lastExport', null);
  const d = lastExport ? new Date(lastExport) : (sessions[0] ? new Date(sessions[0].date) : new Date());
  const dateInput = h('input', { type: 'date', value: d.toISOString().slice(0, 10) });
  const doExport = async (mode) => {
    const since = new Date(dateInput.value + 'T00:00:00');
    const list = (await allSessions()).filter(s => new Date(s.date) >= since && s.report);
    if (!list.length) return toast('Aucune séance depuis cette date');
    const md = combineReports(list, since.toISOString());
    if (mode === 'copy') toast(await copyText(md) ? `${list.length} rapport(s) copiés` : 'Copie impossible');
    else downloadText(`travail-depuis-${dateInput.value}.md`, md);
    await setPref('lastExport', new Date().toISOString());
  };
  view.append(h('div', { class: 'export' },
    h('b', {}, '📤 Exporter depuis la dernière fois'),
    h('span', { class: 'muted small' }, 'depuis le'), dateInput,
    h('button', { class: 'btn primary', onclick: () => doExport('copy'), html: `${icon('copy')}<span>Copier</span>` }),
    h('button', { class: 'btn', onclick: () => doExport('dl'), html: `${icon('dl')}<span>.md</span>` })));

  if (!types.length) {
    view.append(h('p', { class: 'muted' }, 'Aucune séance pour l’instant. Fais un premier exercice !'));
    mount(view);
    setKeys({ Escape: () => go('home') });
    return;
  }
  view.append(h('div', { class: 'chips' }, types.map(ex => h('button', { class: 'chip-btn ' + SKILLS[ex.skill].cls + (ex.id === current ? ' on' : ''), onclick: () => go('history/' + ex.id) }, ex.name))));

  const ex = byId(current);
  const list = sessions.filter(s => s.type === current);
  const o = objectiveOf(objectifs, current);
  const pts = key => list.filter(s => (key ? s.data && s.data[key] != null : s.primary != null)).map(s => ({ x: new Date(s.date).getTime(), y: key ? s.data[key] : s.primary }));
  const charts = h('div', { class: SKILLS[ex.skill].cls });
  if (current === 'dictee-longue') {
    charts.append(h('div', { class: 'chart-card' }, h('h3', {}, 'Mots justes au premier et au deuxième passage (%)'),
      h('div', { html: lineChart({ series: [{ name: '1er passage', color: '#facc15', points: pts('firstWordsPct') }, { name: '2e passage', color: '#fb923c', points: pts('secondWordsPct') }], objective: o ? o.objectif : LEVEL_UP_PCT, objectiveLabel: 'objectif et seuil de niveau', yMin: 0, yMax: 100, unit: ' %' }) })));
    charts.append(h('div', { class: 'chart-card' }, h('h3', {}, 'Position du décrochage — part moyenne de la phrase tenue au 1er passage (%)'),
      h('div', { html: lineChart({ series: [{ name: 'phrase tenue', color: '#22d3ee', points: pts('keptPct1') }], yMin: 0, yMax: 100, unit: ' %' }) })));
    charts.append(h('div', { class: 'chart-card' }, h('h3', {}, 'Taux d’omission au 1er passage (%)'),
      h('div', { html: lineChart({ series: [{ name: 'taux d’omission', color: '#fb7185', points: pts('omissionRate1') }], yMin: 0, unit: ' %' }) })));
  } else {
    charts.append(h('div', { class: 'chart-card' }, h('h3', {}, `${ex.name} — ${(o && o.metrique) || ex.metric}`),
      h('div', { html: lineChart({ series: [{ name: ex.metric, color: 'var(--c1)', points: pts(null) }], objective: o ? o.objectif : null, unit: '' }) })));
  }
  if (ORAL.includes(current)) {
    charts.append(h('div', { class: 'chart-card' }, h('h3', {}, 'Mots par minute'),
      h('div', { html: lineChart({ series: [{ name: 'sur la durée totale', color: '#a3e635', points: pts('wpmTotal') }, { name: 'sur la parole effective', color: '#22d3ee', points: pts('wpmSpeech') }] }) })));
    charts.append(h('div', { class: 'chart-card' }, h('h3', {}, 'Silences de plus d’une seconde'),
      h('div', { html: lineChart({ series: [{ name: 'nombre', color: '#fbbf24', points: pts('silenceCount') }, { name: 'durée totale (s)', color: '#fb7185', points: pts('silenceSec') }] }) })));
  }
  view.append(charts);
  view.append(h('h2', { class: 'mt' }, 'Séances'));
  for (const s of list.slice().reverse()) {
    view.append(h('button', { class: 'sess', onclick: () => go('result/' + s.id) },
      h('span', { class: 'd' }, fmtDate(s.date)),
      h('span', { class: 't' }, (s.exam ? '📝 ' : '') + (s.score ? s.score.text : '')),
      h('span', { class: 's' }, s.primary == null ? '—' : fmtNum(s.primary, s.primary % 1 ? 1 : 0) + ex.unit)));
  }
  mount(view);
  setKeys({ Escape: () => go('home') });
}

// ---------- Test du micro et de la voix ----------
async function micView(returnTo) {
  const view = h('section', { class: 'mic-test sk-speak' });
  view.append(h('h1', {}, 'Test du micro'));
  const status = h('p', { class: 'muted' }, 'Appuie sur le bouton et parle normalement pendant 3 secondes (par exemple : « Hello, my name is… and I’m preparing the Duolingo English Test »).');
  const zone = h('div', { class: 'panel center' });
  const btn = h('button', { class: 'playbtn', html: icon('mic'), 'aria-label': 'Tester le micro' });
  const out = h('div', { class: 'mt' });
  zone.append(btn, h('div', { class: 'kbd-hint' }, 'Espace pour lancer'), out);
  view.append(status, zone);

  if (!micSupported()) out.append(h('p', { class: 'reminder' }, 'Ce navigateur ne permet pas l’enregistrement. Ouvre l’application dans Chrome (ordinateur) ou Safari (iPhone).'));

  let busy = false;
  const test = async () => {
    if (busy || !micSupported()) return;
    busy = true;
    out.replaceChildren();
    const rec = new Recorder({ kind: 'test', label: 'Test micro' });
    try { await rec.start(); }
    catch (err) {
      busy = false;
      out.append(h('p', { class: 'reminder' }, 'Micro refusé ou indisponible. Autorise le micro pour ce site dans les réglages du navigateur, puis réessaie.'));
      return;
    }
    btn.classList.add('playing');
    const vu = vuMeter(rec, await getThreshold());
    const cd = h('div', { class: 'big-number' }, '3');
    out.append(cd, vu);
    for (let k = 3; k > 0; k--) { cd.textContent = k; await new Promise(r => setTimeout(r, 1000)); }
    const res = await rec.stop();
    vu.stop();
    btn.classList.remove('playing');
    releaseMic();
    const sorted = res.rms.slice().sort((a, b) => a - b);
    const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] || 0;
    const noise = q(0.1), speech = q(0.85), peak = Math.max(...res.rms, 0);
    let msg, ok = true;
    if (speech < 0.01) { msg = 'Niveau très faible : on ne t’entend presque pas. Rapproche-toi du micro.'; ok = false; }
    else if (res.clipCount > 4) { msg = 'Son saturé : éloigne un peu le micro.'; ok = false; }
    else if (speech < noise * 2.2) { msg = 'Trop de bruit autour de toi : la parole se distingue mal du fond sonore.'; ok = false; }
    else msg = 'Niveau correct. La détection des silences est réglée sur ta voix.';
    const thr = Math.max(0.004, Math.min(0.08, Math.sqrt(Math.max(noise, 0.0008) * speech) * 0.9));
    if (ok) { await setPref('silenceThreshold', thr); await setPref('micTested', true); }
    const blob = await recordingBlob(res.recId);
    const url = blob ? URL.createObjectURL(blob) : null;
    out.replaceChildren(
      h('div', { class: ok ? 'cover-note' : 'reminder' }, (ok ? '✅ ' : '⚠️ ') + msg),
      h('div', { class: 'metrics' },
        h('div', { class: 'metric' }, h('div', { class: 'v' }, fmtNum(noise * 1000, 1)), h('div', { class: 'k' }, 'bruit de fond')),
        h('div', { class: 'metric' }, h('div', { class: 'v' }, fmtNum(speech * 1000, 1)), h('div', { class: 'k' }, 'niveau de ta voix')),
        h('div', { class: 'metric' }, h('div', { class: 'v' }, fmtNum(thr * 1000, 1)), h('div', { class: 'k' }, 'seuil de silence'))),
      url ? h('div', {}, h('b', {}, 'Réécoute :'), h('audio', { controls: true, src: url, autoplay: true })) : null,
      h('div', { class: 'row center mt' }, h('button', { class: 'btn', onclick: test }, 'Refaire le test'),
        returnTo ? h('button', { class: 'btn go', onclick: () => go(returnTo) }, 'Continuer') : h('button', { class: 'btn go', 'data-nav': 'home' }, 'Terminé')));
    busy = false;
  };
  btn.addEventListener('click', test);

  // Voix anglaise
  const voiceBox = h('div', { class: 'panel mt sk-listen' });
  view.append(voiceBox);
  const renderVoice = async () => {
    await voicesReady();
    const vs = pickVoices();
    const rate = await getRate();
    const slider = h('input', { type: 'range', min: '0.7', max: '1.2', step: '0.05', value: String(rate) });
    const lab = h('b', {}, fmtNum(rate, 2));
    slider.addEventListener('input', () => { lab.textContent = fmtNum(+slider.value, 2); setRate(+slider.value); });
    voiceBox.replaceChildren(
      h('h3', {}, '🔊 Voix anglaise (américaine)'),
      ttsSupported()
        ? h('p', { class: 'muted small' }, vs.a ? `Voix principale : ${vs.a.name} (${vs.a.lang})${vs.b && !vs.sameVoice ? ` · second interlocuteur : ${vs.b.name}` : ''}` : 'Aucune voix anglaise trouvée sur cet appareil.')
        : h('p', { class: 'reminder' }, 'La synthèse vocale n’est pas disponible dans ce navigateur.'),
      vs.hasUS ? null : h('p', { class: 'reminder' }, 'Aucune voix en-US installée. Sur iPhone : Réglages → Accessibilité → Contenu énoncé → Voix → Anglais (États-Unis).'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => speak('Hello! This is the voice you will hear in the listening exercises. I am going to read at a natural speed.').catch(() => toast('Lecture impossible')) }, '▶ Écouter la voix A'),
        h('button', { class: 'btn', onclick: () => speak('And this is the second speaker, for conversations with a professor or another student.', { voice: 'b' }).catch(() => toast('Lecture impossible')) }, '▶ Voix B')),
      h('div', { class: 'speed' }, 'Vitesse de lecture', slider, lab),
      h('p', { class: 'small faint mt' }, srSupported() ? 'Reconnaissance vocale disponible ✓' : '⚠️ Reconnaissance vocale indisponible dans ce navigateur : le nombre de mots à l’oral ne pourra pas être mesuré. Utilise Chrome sur ordinateur ou Safari sur iPhone.'));
  };
  renderVoice();
  mount(view);
  setKeys({ Space: test, Escape: () => go(returnTo || 'home') });
}

// ---------- Examen blanc ----------
async function examView(mode) {
  await runExam(mode, { runOne, mount, go, setKeys, resultView, exerciseShell });
}

// ---------- Récupération d'enregistrements interrompus ----------
async function recoverRecordings() {
  try {
    const list = await unfinishedRecordings();
    for (const r of list) {
      const blob = await recordingBlob(r.id);
      await finishRecording(r.id, { recovered: true });
      if (!blob || r.kind === 'test') continue;
      const ex = byId(r.exercise) || null;
      const session = {
        type: r.exercise || 'enregistrement',
        date: r.createdAt, durationMs: 0, recovered: true,
        score: { text: 'Enregistrement récupéré après interruption', pct: 0 },
        primary: null, reminders: [], sections: [], audio: [{ recId: r.id, label: r.label }], claude: [], data: {},
        viewHtml: `<div class="panel"><h3>🎧 Enregistrement récupéré</h3><p class="muted">L'onglet s'est fermé pendant la prise. Voici l'audio sauvegardé seconde par seconde.</p><div data-rec="${r.id}"></div></div>`,
      };
      session.report = `## Enregistrement récupéré — ${fmtDate(r.createdAt)}\n\n- Exercice : ${ex ? ex.name : r.exercise || 'inconnu'}\n- Séance interrompue avant la fin ; audio conservé.\n`;
      await saveSession(session);
    }
    if (list.some(r => r.kind !== 'test')) toast('Un enregistrement interrompu a été récupéré (voir l’historique)', 4000);
  } catch (e) { console.warn(e); }
}

// ---------- Routeur ----------
async function router() {
  const [route, arg, arg2] = (location.hash.slice(1) || 'home').split('/');
  document.querySelectorAll('.topnav .pill').forEach(p => p.classList.toggle('on', p.dataset.nav === route));
  try {
    if (route === 'brief') return await briefView(arg);
    if (route === 'run') return await runView(arg);
    if (route === 'result') return await resultView(arg);
    if (route === 'history') return await historyView(arg);
    if (route === 'mic') return await micView(arg ? arg + (arg2 ? '/' + arg2 : '') : null);
    if (route === 'exam') return await examView(arg || 'full');
    return await homeView();
  } catch (err) {
    console.error(err);
    mount(h('section', { class: 'panel' }, h('h2', {}, 'Une erreur est survenue'), h('pre', { class: 'md' }, String(err && err.stack || err)), h('button', { class: 'btn', 'data-nav': 'home' }, 'Accueil')));
  }
}

window.addEventListener('hashchange', router);

async function migrate() {
  try {
    for (const s of await sessionsOf('dictee-longue')) {
      if (s.data && s.data.firstWordsPct != null && !s.data.pctPrimary) {
        s.primary = Math.round(s.data.firstWordsPct * 10) / 10;
        s.data.pctPrimary = true;
        await db.put('sessions', s);
      }
    }
  } catch (e) { console.warn(e); }
}

(async function init() {
  askPersistence();
  await migrate();
  await recoverRecordings();
  const first = !(await getPref('launched', false));
  await setPref('launched', true);
  if (first && micSupported() && !location.hash) location.hash = 'mic';
  router();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
