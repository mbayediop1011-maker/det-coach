// Read and Select — un mot à la fois, 5 secondes, réel ou inventé. (Guide 2026 §3.1)
import { h, Timer, fmtNum, pct, itemsView, itemRow, sleep } from './common.js';

export async function run(ctx, items) {
  const results = [];
  const t0 = performance.now();
  for (let i = 0; i < items.length; i++) {
    if (ctx.aborted) return null;
    ctx.setProgress(`${i + 1} / ${items.length}`);
    results.push(await one(ctx, items[i]));
    await sleep(180);
  }
  const ok = results.filter(r => r.correct).length;
  const p = pct(ok, results.length);
  const rts = results.filter(r => r.answer != null).map(r => r.rt);
  const avg = rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null;
  const slow = results.filter(r => r.answer != null && r.rt > 3000);
  const missed = results.filter(r => !r.correct);
  // Chiffres utilisés par le professeur : vrais / inventés, réponses rapides, temps utilisé.
  const real = results.filter(r => r.real), fake = results.filter(r => !r.real);
  const realOk = real.filter(r => r.correct).length, fakeOk = fake.filter(r => r.correct).length;
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const rejectedReal = real.filter(r => r.answer === false);
  const fast = results.filter(r => r.answer != null && r.rt < 2000);
  const rtRejectReal = mean(rejectedReal.map(r => r.rt));
  const rtCorrect = mean(results.filter(r => r.correct).map(r => r.rt));
  const usedMs = results.reduce((a, r) => a + Math.min(r.rt, 5000), 0);
  const availMs = results.length * 5000;
  const reminders = fast.length ? [`${fast.length} réponse(s) sur ${results.length} données en moins de 2 secondes.`] : [];
  const s1 = n => fmtNum(n / 1000, 2) + ' s';

  const metric = (v, k) => h('div', { class: 'metric' }, h('div', { class: 'v' }, v), h('div', { class: 'k' }, k));
  const view = h('div', {},
    h('div', { class: 'panel' }, h('div', { class: 'metrics' },
      metric(`${realOk}/${real.length}`, 'vrais mots reconnus'),
      metric(`${fakeOk}/${fake.length}`, 'mots inventés repérés'),
      metric(`${rejectedReal.length}`, 'vrais mots rejetés'),
      metric(rtRejectReal == null ? '—' : s1(rtRejectReal), 'temps moyen de ces rejets'),
      metric(rtCorrect == null ? '—' : s1(rtCorrect), 'temps moyen des bonnes réponses'),
      metric(`${fast.length}`, 'réponses en moins de 2 s'),
      metric(`${fmtNum(usedMs / 1000, 0)} s / ${fmtNum(availMs / 1000, 0)} s`, 'temps utilisé / disponible'))),
    h('div', { class: 'panel mt' },
      h('h3', {}, 'Temps de réponse, mot par mot'),
      h('div', { class: 'items' }, results.map(r => itemRow(r.correct ? 'ok' : r.answer == null ? 'empty' : 'bad',
        `${r.correct ? 'juste' : r.answer == null ? 'temps écoulé' : 'faux'} · ${r.answer == null ? '> 5 s' : fmtNum(r.rt / 1000, 1) + ' s'}`,
        h('b', {}, r.word), ` — ${r.real ? 'mot réel' : 'mot inventé'}${r.answer != null ? ` · ta réponse : ${r.answer ? 'réel' : 'inventé'}` : ''}`)))));

  const lines = results.map(r => `- ${r.word} (${r.real ? 'réel' : 'inventé'}) : ${r.answer == null ? 'pas de réponse (5 s écoulées)' : (r.answer ? 'réel' : 'inventé')} — ${r.correct ? 'juste' : 'FAUX'} — ${r.answer == null ? '>5,0' : fmtNum(r.rt / 1000, 2)} s`);
  return {
    durationMs: performance.now() - t0,
    score: { text: `${ok} / ${results.length} justes (${fmtNum(p, 0)} %)`, pct: p / 100 },
    primary: p,
    reminders,
    sections: [
      { title: 'Items ratés', body: missed.length ? missed.map(r => `- ${r.word} : attendu ${r.real ? 'réel' : 'inventé'}, donné ${r.answer == null ? 'vide (temps écoulé)' : (r.answer ? 'réel' : 'inventé') + ' (faux)'}`).join('\n') : 'Aucun.' },
      { title: 'Synthèse', body: `- Vrais mots reconnus : ${realOk}/${real.length} · mots inventés repérés : ${fakeOk}/${fake.length}\n- Vrais mots rejetés : ${rejectedReal.length}${rejectedReal.length ? ` (${rejectedReal.map(r => `${r.word} ${s1(r.rt)}`).join(', ')}) · temps moyen de ces rejets : ${s1(rtRejectReal)}` : ''}\n- Temps moyen des bonnes réponses : ${rtCorrect == null ? '—' : s1(rtCorrect)}\n- Réponses en moins de 2 s : ${fast.length}/${results.length}\n- Temps utilisé : ${fmtNum(usedMs / 1000, 1)} s sur ${fmtNum(availMs / 1000, 0)} s disponibles` },
      { title: 'Temps de réponse', body: `- Moyen : ${avg == null ? '—' : fmtNum(avg / 1000, 2) + ' s'}\n- Hésitations (> 3 s) : ${slow.length ? slow.map(r => `${r.word} ${fmtNum(r.rt / 1000, 1)} s`).join(', ') : 'aucune'}\n\n${lines.join('\n')}` },
    ],
    view,
    data: { avgRt: avg },
  };
}

function one(ctx, item) {
  return new Promise(resolve => {
    const timer = new Timer({ seconds: 5, style: 'bar' });
    const yes = h('button', { class: 'btn rs-yes' }, 'Oui', h('small', { style: { display: 'block', fontSize: '13px', opacity: .8 } }, 'mot réel'));
    const no = h('button', { class: 'btn rs-no' }, 'Non', h('small', { style: { display: 'block', fontSize: '13px', opacity: .8 } }, 'mot inventé'));
    ctx.root.replaceChildren(h('div', { class: 'panel' },
      h('div', { class: 'instruction' }, 'Is this a real English word?'),
      timer.el,
      h('div', { class: 'rs-word' }, item.word),
      h('div', { class: 'rs-buttons' }, yes, no),
      h('p', { class: 'kbd-hint' }, 'Touches : O ou ← pour Oui · N ou → pour Non')));
    const start = performance.now();
    let done = false;
    const answer = a => {
      if (done) return; done = true;
      timer.stop();
      const rt = performance.now() - start;
      const correct = a != null && a === item.real;
      (a === true ? yes : a === false ? no : null)?.classList.add('sel');
      resolve({ word: item.word, real: item.real, answer: a, rt, correct });
    };
    yes.addEventListener('click', () => answer(true));
    no.addEventListener('click', () => answer(false));
    timer.onEnd = () => answer(null);
    ctx.onCleanup(() => timer.stop());
    ctx.setKeys({ o: () => answer(true), y: () => answer(true), ArrowLeft: () => answer(true), n: () => answer(false), ArrowRight: () => answer(false) });
    timer.start();
  });
}
