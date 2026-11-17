// Read and Complete — paragraphe, mots amputés, une case par lettre, 3 minutes. (Guide 2026 §3.3)
import { h, Timer, fmtNum, pct, parseGapped, letterGaps } from './common.js';

export async function run(ctx, items) {
  const item = items[0];
  ctx.setProgress(item.title || '');
  const timer = new Timer({ seconds: 180, label: 'Temps restant', big: false });
  const passage = h('div', { class: 'passage' });
  if (item.title) passage.append(h('div', { class: 'ptitle' }, item.title));
  const body = h('div', {});
  passage.append(body);
  const lg = letterGaps(body, parseGapped(item.text));
  const submit = h('button', { class: 'btn go', html: '<span>Valider</span> <kbd>Entrée</kbd>' });
  ctx.root.replaceChildren(h('div', { class: 'panel' },
    h('div', { class: 'instruction' }, 'Type the missing letters to complete the text below.'),
    timer.el, passage, h('div', { class: 'row end mt' }, submit)));
  setTimeout(() => lg.focusFirst(), 80);
  const t0 = performance.now();

  const res = await new Promise(resolve => {
    let done = false;
    const finish = () => { if (done) return; done = true; timer.stop(); resolve(timer.remaining); };
    submit.addEventListener('click', finish);
    timer.onEnd = finish;
    ctx.onCleanup(() => timer.stop());
    ctx.setKeys({ Enter: finish });
    timer.start();
  });
  if (ctx.aborted) return null;
  const remaining = res;
  const graded = lg.grade();
  lg.lock(graded);
  const total = graded.length;
  const ok = graded.filter(g => g.status === 'ok').length;
  const empty = graded.filter(g => g.status === 'empty');
  const bad = graded.filter(g => g.status === 'bad');
  const scaled = total ? Math.round(ok / total * 23 * 10) / 10 : 0;

  // Rappel de méthode, seulement quand c'est mécaniquement détectable.
  const reminders = [];
  const lastThird = graded.slice(Math.floor(total * 2 / 3));
  const emptyEnd = lastThird.filter(g => g.status === 'empty').length;
  if (empty.length && remaining > 5) reminders.push(`${empty.length} case(s) laissée(s) vide(s) alors qu'il restait ${Math.round(remaining)} s au chrono.`);
  else if (emptyEnd >= 2 && emptyEnd >= empty.length * 0.6) reminders.push(`${emptyEnd} mot(s) vide(s) dans le dernier tiers du texte : le chrono s'est arrêté avant la fin.`);

  const lockedView = h('div', { class: 'panel' }, h('h3', {}, 'Correction dans le texte'),
    h('p', { class: 'small muted' }, 'Vert : juste · rouge : faux · jaune : vide (pas eu le temps). Le mot attendu est indiqué au-dessus.'),
    staticPassage(item, graded));
  const chip = (g, cls) => h('span', { class: 'wchip ' + cls }, g.status === 'bad' ? [h('s', {}, g.given), ' → ', h('b', {}, g.word)] : h('b', {}, g.word));
  const list = h('div', { class: 'panel mt' }, h('h3', {}, 'Mots ratés'),
    bad.length ? h('div', { class: 'mb' }, h('div', { class: 'lbl-row bad' }, `Faux — pas su (${bad.length})`), h('div', { class: 'wchips' }, bad.map(g => chip(g, 'bad')))) : null,
    empty.length ? h('div', {}, h('div', { class: 'lbl-row empty' }, `Vides — pas eu le temps (${empty.length})`), h('div', { class: 'wchips' }, empty.map(g => chip(g, 'empty')))) : null,
    !bad.length && !empty.length ? h('p', { class: 'muted' }, 'Aucun mot raté. Bravo !') : null);

  return {
    durationMs: performance.now() - t0,
    score: { text: `${ok} / ${total} mots justes (${fmtNum(pct(ok, total), 0)} %)`, pct: total ? ok / total : 0 },
    primary: total === 23 ? ok : scaled,
    reminders,
    sections: [
      { title: 'Détail', body: `- Texte : ${item.id} — ${item.title || ''}\n- Mots à compléter : ${total} · justes : ${ok} · faux (pas su) : ${bad.length} · vides (pas eu le temps) : ${empty.length}\n- Temps restant à la validation : ${Math.round(remaining)} s${total !== 23 ? `\n- Score ramené sur 23 : ${fmtNum(scaled, 1)}` : ''}` },
      { title: 'Items ratés', body: [...bad.map(g => `- FAUX : attendu « ${g.word} », donné « ${g.given} »`), ...empty.map(g => `- VIDE : attendu « ${g.word} » (préfixe « ${g.pre} »)`)].join('\n') || 'Aucun.' },
    ],
    view: h('div', {}, lockedView, list),
    data: { empty: empty.length, wrong: bad.length },
  };
}

// Version figée (sans champs de saisie) pour le rapport et l'historique.
export function staticPassage(item, graded) {
  const el = h('div', { class: 'passage' });
  if (item.title) el.append(h('div', { class: 'ptitle' }, item.title));
  let k = 0;
  for (const p of parseGapped(item.text)) {
    if (p.t === 'text') { el.append(document.createTextNode(p.v)); continue; }
    const g = graded[k++];
    const boxes = [...g.word.slice(g.pre.length)].map((ch, i) => h('span', { class: 'lbs' }, g.typed[i] || '\u00a0'));
    el.append(h('span', { class: 'gap ' + g.status }, h('span', { class: 'pre' }, g.pre), ...boxes, g.status !== 'ok' ? h('span', { class: 'fix' }, g.word) : null));
  }
  return el;
}
