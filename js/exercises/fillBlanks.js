// Fill in the Blanks — une phrase, un mot inachevé, 20 secondes. (Guide 2026 §3.2)
import { h, Timer, fmtNum, pct, itemsView, itemRow, parseGapped, letterGaps, sleep } from './common.js';

export async function run(ctx, items) {
  const results = [];
  const t0 = performance.now();
  for (let i = 0; i < items.length; i++) {
    if (ctx.aborted) return null;
    ctx.setProgress(`${i + 1} / ${items.length}`);
    results.push(await one(ctx, items[i]));
    await sleep(650);
  }
  const ok = results.filter(r => r.status === 'ok').length;
  const p = pct(ok, results.length);
  const view = itemsView('Correction', results.map(r => itemRow(r.status,
    `${r.status === 'ok' ? 'juste' : r.status === 'empty' ? 'vide' : 'faux'} · ${fmtNum(r.rt / 1000, 1)} s`,
    h('div', { html: r.sentenceHtml }),
    r.status !== 'ok' ? h('div', { class: 'small' }, `Attendu : `, h('b', {}, r.word), r.status === 'bad' ? ` · donné : ${r.given}` : '') : null,
    r.note ? h('div', { class: 'small muted' }, r.note) : null)));
  const quick = results.filter(r => !r.timedOut && r.rt < 10000);
  const avgRt = results.reduce((a, r) => a + r.rt, 0) / results.length;
  const reminders = quick.length ? [`Validé en moins de 10 s sur ${quick.length} question(s) sur ${results.length} (temps moyen ${fmtNum(avgRt / 1000, 1)} s sur 20 s).`] : [];
  return {
    durationMs: performance.now() - t0,
    reminders,
    score: { text: `${ok} / ${results.length} justes (${fmtNum(p, 0)} %)`, pct: p / 100 },
    primary: p,
    sections: [
      { title: 'Items ratés', body: results.filter(r => r.status !== 'ok').map(r => `- ${r.plain} — attendu « ${r.word} », donné ${r.status === 'empty' ? 'vide' : '« ' + r.given + ' » (faux)'} — ${fmtNum(r.rt / 1000, 1)} s`).join('\n') || 'Aucun.' },
      { title: 'Temps par item', body: `Temps moyen : ${fmtNum(avgRt / 1000, 1)} s sur 20 s · validées en moins de 10 s : ${quick.length}/${results.length}\n` + results.map(r => `- ${r.word} : ${fmtNum(r.rt / 1000, 1)} s${r.timedOut ? ' (20 s écoulées)' : ''} — ${r.status === 'ok' ? 'juste' : r.status === 'empty' ? 'vide' : 'faux'}`).join('\n') },
    ],
    view,
  };
}

function one(ctx, item) {
  return new Promise(resolve => {
    const timer = new Timer({ seconds: 20, label: 'Temps restant' });
    const passage = h('div', { class: 'passage' });
    const parts = parseGapped(item.text);
    const lg = letterGaps(passage, parts, { onAnyInput: () => {} });
    const next = h('button', { class: 'btn go', html: '<span>Suivant</span> <kbd>Entrée</kbd>' });
    ctx.root.replaceChildren(h('div', { class: 'panel' },
      h('div', { class: 'instruction' }, 'Type the missing letters to complete the text below.'),
      timer.el, passage, h('div', { class: 'row end mt' }, next)));
    setTimeout(() => lg.focusFirst(), 60);
    const start = performance.now();
    let done = false;
    const finish = timedOut => {
      if (done) return; done = true;
      timer.stop();
      const [g] = lg.grade();
      lg.lock([g]);
      const plain = item.text.replace(/\[([^\]|]*)\|([^\]]+)\]/g, (m, a, w) => a + '___');
      const sentenceHtml = item.text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/\[([^\]|]*)\|([^\]]+)\]/g, (m, a, w) => `<b style="color:var(--c1)">${w}</b>`);
      resolve({ ...g, rt: performance.now() - start, timedOut, plain, sentenceHtml, note: item.note || '' });
    };
    next.addEventListener('click', () => finish(false));
    timer.onEnd = () => finish(true);
    ctx.onCleanup(() => timer.stop());
    ctx.setKeys({ Enter: () => finish(false) });
    timer.start();
  });
}
