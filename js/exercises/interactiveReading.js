// Interactive Reading — un texte, cinq tâches enchaînées, 7 ou 8 minutes au total. (Guide 2026 §3.5)
import { h, Timer, fmtNum, pct, choiceList, esc } from './common.js';
import { shuffle } from '../ui.js';

const STEP_NAMES = ['Complete the Sentences', 'Complete the Passage', 'Highlight the Answer', 'Highlight the Answer', 'Identify the Idea', 'Title the Passage'];

function parseChoices(text) {
  // {correct|faux1|faux2|faux3}
  const parts = [];
  const re = /\{([^}]+)\}/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: 'text', v: text.slice(last, m.index) });
    const opts = m[1].split('|').map(s => s.trim());
    parts.push({ t: 'blank', answer: opts[0], options: shuffle(opts) });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ t: 'text', v: text.slice(last) });
  return parts;
}

export async function run(ctx, items) {
  const item = items[0];
  const parts = parseChoices(item.sentences);
  const blanks = parts.filter(p => p.t === 'blank');
  const seconds = blanks.length >= 7 ? 480 : 420;
  const timer = new Timer({ seconds, label: 'Temps total' });
  const dots = h('div', { class: 'step-dots' }, STEP_NAMES.map(() => h('i')));
  const area = h('div', {});
  ctx.root.replaceChildren(h('div', {}, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, dots, timer.el), area));
  const part1Filled = parts.map(p => p.t === 'text' ? p.v : p.answer).join('');
  const fullText = `${part1Filled.trim()} ${item.passage.answer.trim()} ${item.after.trim()}`;
  const t0 = performance.now();
  let timeUp = false;
  let resolveTimeUp;
  const timeUpP = new Promise(r => { resolveTimeUp = r; });
  timer.onEnd = () => { timeUp = true; resolveTimeUp(); };
  ctx.onCleanup(() => timer.stop());
  timer.start();

  const results = { sentences: [], passage: null, highlight: [], idea: null, title: null };
  const setStep = i => { [...dots.children].forEach((d, k) => { d.classList.toggle('on', k === i); d.classList.toggle('done', k < i); }); ctx.setProgress(STEP_NAMES[i]); };
  const nextBtn = (label = 'Suivant') => h('button', { class: 'btn go', html: `<span>${label}</span> <kbd>Entrée</kbd>` });
  const waitNext = btn => Promise.race([new Promise(r => { btn.addEventListener('click', r); ctx.setKeys({ Enter: r }); }), timeUpP]);

  // 1. Complete the Sentences
  setStep(0);
  const selects = [];
  const para = h('div', { class: 'passage' });
  for (const p of parts) {
    if (p.t === 'text') para.append(document.createTextNode(p.v));
    else {
      const s = h('select', { class: 'blank' }, h('option', { value: '' }, 'Select a word'), p.options.map(o => h('option', { value: o }, o)));
      selects.push({ el: s, p });
      para.append(s);
    }
  }
  let btn = nextBtn();
  area.replaceChildren(h('div', { class: 'panel' }, h('div', { class: 'instruction' }, 'Select the best option for each missing word.'), para, h('div', { class: 'row end mt' }, btn)));
  await waitNext(btn);
  results.sentences = selects.map(({ el, p }) => ({ answer: p.answer, given: el.value || null, ok: el.value === p.answer }));

  // 2. Complete the Passage
  if (!timeUp && !ctx.aborted) {
    setStep(1);
    const opts = shuffle([item.passage.answer, ...item.passage.distractors]);
    const cl = choiceList(opts);
    btn = nextBtn();
    area.replaceChildren(h('div', { class: 'panel' }, h('div', { class: 'instruction' }, 'Select the best sentence to fill in the blank in the passage.'),
      h('div', { class: 'passage', style: { fontSize: '17px', lineHeight: 1.7 } }, part1Filled, h('span', { class: 'missing-slot' }, '[ missing sentence ]'), item.after), cl.el, h('div', { class: 'row end mt' }, btn)));
    ctx.setKeys({});
    await waitNext(btn);
    results.passage = { answer: item.passage.answer, given: cl.selected == null ? null : opts[cl.selected], ok: cl.selected != null && opts[cl.selected] === item.passage.answer };
  }

  // 3-4. Highlight the Answer (×2)
  const tokens = tokenize(fullText);
  for (let q = 0; q < item.highlight.length && q < 2; q++) {
    if (timeUp || ctx.aborted) break;
    setStep(2 + q);
    const hl = item.highlight[q];
    const target = findSpan(tokens, fullText, hl.answer);
    const sel = highlighter(tokens);
    btn = nextBtn();
    area.replaceChildren(h('div', { class: 'panel' }, h('div', { class: 'instruction' }, 'Click and drag text to highlight the answer to the question below.'),
      h('div', { class: 'cover-note', style: { fontWeight: 800, color: 'var(--text)', marginBottom: '12px' } }, hl.question),
      sel.el, h('p', { class: 'small faint' }, 'Sur téléphone : touche le premier mot, puis le dernier.'),
      h('div', { class: 'row mt' }, h('button', { class: 'btn ghost', onclick: () => sel.clear() }, 'Effacer'), h('span', { class: 'spacer' }), btn)));
    ctx.setKeys({});
    await waitNext(btn);
    const s = sel.range();
    const score = overlap(s, target);
    results.highlight.push({ question: hl.question, answer: hl.answer, given: s ? tokens.slice(s[0], s[1] + 1).map(t => t.w).join(' ') : null, score });
  }

  // 5. Identify the Idea
  for (const [key, stepIdx, instr, data] of [['idea', 4, 'Select the idea that is expressed in the passage.', item.idea], ['title', 5, 'Select the best title for the passage.', item.title]]) {
    if (timeUp || ctx.aborted) break;
    setStep(stepIdx);
    const opts = shuffle([data.answer, ...data.distractors]);
    const cl = choiceList(opts);
    btn = nextBtn(key === 'title' ? 'Terminer' : 'Suivant');
    area.replaceChildren(h('div', { class: 'panel' }, h('div', { class: 'instruction' }, instr),
      h('div', { class: 'passage', style: { fontSize: '16px', lineHeight: 1.65, maxHeight: '38vh', overflow: 'auto', marginBottom: '14px' } }, fullText), cl.el, h('div', { class: 'row end mt' }, btn)));
    ctx.setKeys({});
    await waitNext(btn);
    results[key] = { answer: data.answer, given: cl.selected == null ? null : opts[cl.selected], ok: cl.selected != null && opts[cl.selected] === data.answer };
  }
  timer.stop();
  if (ctx.aborted) return null;

  // Score : une question = un point (Highlight en crédit partiel), comme le guide 2026.
  const groups = {
    'Complete the Sentences': results.sentences.map(r => r.ok ? 1 : 0),
    'Complete the Passage': [results.passage && results.passage.ok ? 1 : 0],
    'Highlight the Answer': [0, 1].map(i => results.highlight[i] ? results.highlight[i].score : 0),
    'Identify the Idea': [results.idea && results.idea.ok ? 1 : 0],
    'Title the Passage': [results.title && results.title.ok ? 1 : 0],
  };
  let sum = 0, n = 0;
  const byType = Object.entries(groups).map(([k, arr]) => { const s = arr.reduce((a, b) => a + b, 0); sum += s; n += arr.length; return { k, s, n: arr.length }; });
  const p = pct(sum, n);

  const view = h('div', {},
    h('div', { class: 'panel' }, h('h3', {}, 'Score par type de question'),
      h('div', { class: 'metrics' }, byType.map(b => h('div', { class: 'metric' }, h('div', { class: 'v' }, `${fmtNum(b.s, b.s % 1 ? 1 : 0)}/${b.n}`), h('div', { class: 'k' }, b.k))))),
    h('div', { class: 'panel mt' }, h('h3', {}, 'Complete the Sentences'),
      h('div', { class: 'items' }, results.sentences.map(r => h('div', { class: 'item ' + (r.ok ? 'ok' : r.given ? 'bad' : 'empty') }, h('div', { class: 'lbl' }, r.ok ? 'juste' : r.given ? 'faux' : 'vide'), h('b', {}, r.answer), r.ok ? '' : ` · ta réponse : ${r.given || '—'}`)))),
    qView('Complete the Passage', results.passage),
    ...results.highlight.map((r, i) => h('div', { class: 'panel mt' }, h('h3', {}, `Highlight the Answer ${i + 1} — ${Math.round(r.score * 100)} %`),
      h('p', { class: 'muted' }, r.question), h('div', { class: 'item ok' }, h('div', { class: 'lbl' }, 'attendu'), r.answer), h('div', { class: 'item ' + (r.score > .8 ? 'ok' : r.given ? 'bad' : 'empty') }, h('div', { class: 'lbl' }, 'ta sélection'), r.given || '—'))),
    qView('Identify the Idea', results.idea),
    qView('Title the Passage', results.title));

  const md = [];
  md.push(`- Texte : ${item.id} · chrono ${seconds / 60} min · ${timeUp ? 'temps écoulé avant la fin' : `terminé avec ${Math.round(timer.remaining)} s restantes`}`);
  for (const b of byType) md.push(`- ${b.k} : ${fmtNum(b.s, b.s % 1 ? 2 : 0)}/${b.n}`);
  const missed = [];
  results.sentences.forEach(r => { if (!r.ok) missed.push(`- Complete the Sentences : attendu « ${r.answer} », donné ${r.given ? '« ' + r.given + ' » (faux)' : 'vide'}`); });
  for (const [k, r] of [['Complete the Passage', results.passage], ['Identify the Idea', results.idea], ['Title the Passage', results.title]]) {
    if (!r) missed.push(`- ${k} : non atteint (temps écoulé)`);
    else if (!r.ok) missed.push(`- ${k} : attendu « ${r.answer} », donné ${r.given ? '« ' + r.given + ' » (faux)' : 'vide'}`);
  }
  results.highlight.forEach((r, i) => { if (r.score < 1) missed.push(`- Highlight ${i + 1} (${Math.round(r.score * 100)} %) : « ${r.question} » — attendu « ${r.answer} », sélection ${r.given ? '« ' + r.given + ' »' : 'vide'}`); });
  return {
    durationMs: performance.now() - t0,
    score: { text: `${fmtNum(sum, sum % 1 ? 1 : 0)} / ${n} points (${fmtNum(p, 0)} %)`, pct: p / 100 },
    primary: p,
    sections: [{ title: 'Score par type de question', body: md.join('\n') }, { title: 'Items ratés', body: missed.join('\n') || 'Aucun.' }],
    view,
  };
}

function qView(title, r) {
  if (!r) return h('div', { class: 'panel mt' }, h('h3', {}, title), h('p', { class: 'muted' }, 'Non atteint (temps écoulé).'));
  if (r.ok) return h('div', { class: 'panel mt' }, h('h3', {}, title), h('div', { class: 'item ok' }, h('div', { class: 'lbl' }, 'juste'), r.answer));
  return h('div', { class: 'panel mt' }, h('h3', {}, title),
    h('div', { class: 'item ok' }, h('div', { class: 'lbl' }, 'bonne réponse'), r.answer),
    h('div', { class: 'item ' + (r.given ? 'bad' : 'empty'), style: { marginTop: '8px' } }, h('div', { class: 'lbl' }, r.given ? 'ta réponse (fausse)' : 'pas de réponse'), r.given || '—'));
}

function tokenize(text) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) out.push({ w: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}
function findSpan(tokens, text, answer) {
  const idx = text.toLowerCase().indexOf(answer.toLowerCase().trim());
  if (idx < 0) return null;
  const end = idx + answer.trim().length;
  const a = tokens.findIndex(t => t.end > idx);
  let b = a;
  while (b + 1 < tokens.length && tokens[b + 1].start < end) b++;
  return [a, b];
}
function overlap(sel, target) {
  if (!sel || !target) return 0;
  const inter = Math.max(0, Math.min(sel[1], target[1]) - Math.max(sel[0], target[0]) + 1);
  if (!inter) return 0;
  const prec = inter / (sel[1] - sel[0] + 1), rec = inter / (target[1] - target[0] + 1);
  return Math.round((2 * prec * rec / (prec + rec)) * 100) / 100;
}

function highlighter(tokens) {
  const el = h('div', { class: 'passage', style: { fontSize: '17px', lineHeight: 1.8, userSelect: 'none', WebkitUserSelect: 'none' } });
  const spans = tokens.map((t, i) => { const s = h('span', { class: 'tok', 'data-i': i }, t.w); el.append(s, ' '); return s; });
  let a = null, b = null, dragging = false, moved = false;
  const paint = () => {
    const [x, y] = a == null ? [-1, -2] : b == null ? [a, a] : [Math.min(a, b), Math.max(a, b)];
    spans.forEach((s, i) => { s.classList.toggle('hl', i >= x && i <= y); s.classList.toggle('anchor', a != null && b == null && i === a); });
  };
  const idxOf = e => { const t = e.target.closest && e.target.closest('.tok'); return t ? +t.dataset.i : null; };
  el.addEventListener('mousedown', e => { const i = idxOf(e); if (i == null) return; dragging = true; moved = false; a = i; b = i; paint(); e.preventDefault(); });
  el.addEventListener('mouseover', e => { if (!dragging) return; const i = idxOf(e); if (i != null) { b = i; moved = true; paint(); } });
  window.addEventListener('mouseup', () => { dragging = false; });
  // Tactile : touche le premier mot, puis le dernier.
  el.addEventListener('touchend', e => {
    const i = idxOf(e); if (i == null) return;
    e.preventDefault();
    if (a == null || b != null) { a = i; b = null; } else { b = i; }
    paint();
  }, { passive: false });
  return {
    el,
    clear() { a = b = null; paint(); },
    range() { if (a == null) return null; const y = b == null ? a : b; return [Math.min(a, y), Math.max(a, y)]; },
  };
}
