// Listen and Type — une phrase, jusqu'à 3 écoutes, 1 minute. Le texte n'apparaît qu'après validation. (Guide 2026 §3.4)
import { h, Timer, fmtNum, listenButton, speak, cancelSpeech, sleep } from './common.js';
import { alignWords, diffHtml, diffText } from '../compare.js';
import { getRate, setRate } from '../speech.js';

export async function run(ctx, items) {
  const results = [];
  const t0 = performance.now();
  for (let i = 0; i < items.length; i++) {
    if (ctx.aborted) return null;
    ctx.setProgress(`${i + 1} / ${items.length}`);
    results.push(await one(ctx, items[i]));
    await sleep(300);
  }
  const exact = results.filter(r => r.al.exact).length;
  const wordsOk = results.reduce((a, r) => a + r.al.correct, 0);
  const wordsTot = results.reduce((a, r) => a + r.al.total, 0);
  const omitted = results.reduce((a, r) => a + r.al.omitted, 0);
  const omittedWords = results.flatMap(r => r.al.ops.filter(o => o.op === 'miss').map(o => o.e.show));
  const notAll = results.filter(r => r.plays < 3);
  const late = results.filter(r => r.typedDuring === false);
  const early = results.filter(r => r.leftSec >= 10);
  // Rappels de méthode, seulement quand c'est mécaniquement détectable.
  const reminders = [];
  if (notAll.length) reminders.push(`Moins de 3 écoutes sur ${notAll.length} phrase(s) sur ${results.length} (${notAll.map(r => r.plays).join(', ')} écoute(s)).`);
  if (late.length) reminders.push(`Saisie commencée après la fin de la première écoute sur ${late.length} phrase(s) sur ${results.length}.`);
  if (early.length) reminders.push(`Validé avec 10 s ou plus au chrono sur ${early.length} phrase(s).`);

  const view = h('div', { class: 'panel' }, h('h3', {}, 'Correction'),
    h('p', { class: 'small muted' }, 'Barré rouge : ce que tu as écrit de faux · vert : le mot attendu · souligné jaune : mot oublié.'),
    h('div', { class: 'items' }, results.map(r => h('div', { class: 'item ' + (r.al.exact ? 'ok' : r.text.trim() ? 'bad' : 'empty') },
      h('div', { class: 'lbl' }, `${r.al.exact ? 'phrase exacte' : `${r.al.correct}/${r.al.total} mots`}${r.al.omitted ? ` · ${r.al.omitted} omis` : ''} · ${r.plays} écoute(s) · ${fmtNum(r.secs, 0)} s · ${r.plays === 0 ? 'aucune écoute' : r.typedDuring == null ? 'rien écrit' : r.typedDuring ? 'écrit pendant l’audio' : 'écrit après l’audio'}`),
      h('div', { class: 'diff', html: diffHtml(r.al.ops) }),
      r.al.exact ? null : h('div', { class: 'small muted' }, 'Attendu : ' + r.sentence)))));

  return {
    durationMs: performance.now() - t0,
    score: { text: `${exact} / ${results.length} phrases exactes · ${wordsOk}/${wordsTot} mots`, pct: results.length ? exact / results.length : 0 },
    primary: exact,
    reminders,
    sections: [
      { title: 'Synthèse', body: `- Phrases exactes : ${exact}/${results.length} · mots justes : ${wordsOk}/${wordsTot}\n- Omissions : ${omitted}${omittedWords.length ? ` (${omittedWords.join(', ')})` : ''}\n- Écoutes utilisées : ${results.map(r => r.plays).join(', ')}\n- Saisie commencée pendant la première écoute : ${results.filter(r => r.typedDuring).length}/${results.length}\n- Temps restant à la validation : ${results.map(r => Math.round(r.leftSec) + ' s').join(', ')}` },
      { title: 'Détail par phrase', body: results.map((r, i) => `${i + 1}. ${r.al.exact ? 'EXACTE' : `${r.al.correct}/${r.al.total} mots`} — ${r.al.omitted} omis — ${r.plays} écoute(s) — ${r.plays === 0 ? 'aucune écoute' : r.typedDuring == null ? 'rien écrit' : r.typedDuring ? 'écrit pendant l’audio' : 'écrit après l’audio'} — ${fmtNum(r.secs, 1)} s\n   - Attendu : ${r.sentence}\n   - Donné : ${r.text.trim() || '(vide)'}${r.al.exact ? '' : `\n   - Écarts : ${diffText(r.al.ops)}`}`).join('\n') },
    ],
    view,
    data: { wordsPct: wordsTot ? wordsOk / wordsTot * 100 : 0, omitted },
  };
}

function one(ctx, item) {
  return new Promise(async resolve => {
    const timer = new Timer({ seconds: 60, label: 'Temps restant' });
    const ta = h('textarea', { class: 'answer', placeholder: 'Type the statement that you heard.', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'sentences', lang: 'en', style: { minHeight: '110px' } });
    // On note si la saisie commence pendant la première écoute (règle de méthode).
    let firstPlayEnd = null, firstInput = null;
    const lb = listenButton({ maxPlays: 3, onPlay: async n => { const p = speak(item.sentence); if (n === 1) setTimeout(() => ta.focus(), 100); await p; if (n === 1) firstPlayEnd = performance.now(); } });
    ta.addEventListener('input', () => { if (firstInput == null) firstInput = performance.now(); });
    const submit = h('button', { class: 'btn go', html: '<span>Valider</span> <kbd>Ctrl+Entrée</kbd>' });
    const rate = await getRate();
    const slider = h('input', { type: 'range', min: '0.7', max: '1.2', step: '0.05', value: String(rate) });
    slider.addEventListener('input', () => setRate(+slider.value));
    ctx.root.replaceChildren(h('div', { class: 'panel' },
      h('div', { class: 'instruction' }, 'Type the statement that you hear.'),
      timer.el, lb.el, ta,
      h('div', { class: 'row mt' }, h('div', { class: 'speed' }, 'Vitesse', slider), h('span', { class: 'spacer' }), submit),
      h('p', { class: 'kbd-hint' }, 'Espace (hors zone de texte) : écouter')));
    const start = performance.now();
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      timer.stop(); cancelSpeech();
      const text = ta.value;
      // null = pas mesurable (rien écrit, ou aucune écoute lancée).
      const typedDuring = firstInput == null || lb.used === 0 ? null : (firstPlayEnd == null || firstInput < firstPlayEnd);
      resolve({ sentence: item.sentence, text, plays: lb.used, secs: (performance.now() - start) / 1000, leftSec: timer.remaining, typedDuring, al: alignWords(item.sentence, text) });
    };
    submit.addEventListener('click', finish);
    timer.onEnd = finish;
    ctx.onCleanup(() => timer.stop());
    ctx.setKeys({ Enter: finish, Space: () => lb.play() });
    timer.start();
  });
}
