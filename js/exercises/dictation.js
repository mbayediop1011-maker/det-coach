// Dictée longue (hors test) — dix phrases, exactement deux écoutes imposées.
// On écrit après la première écoute, on corrige après la seconde. Score du premier passage séparé.
import { h, fmtNum, speak, cancelSpeech, icon, sleep } from './common.js';
import { alignWords, diffHtml, diffText, segmentationErrors } from '../compare.js';
import { getRate, setRate } from '../speech.js';

export async function run(ctx, items) {
  const results = [];
  const t0 = performance.now();
  for (let i = 0; i < items.length; i++) {
    if (ctx.aborted) return null;
    ctx.setProgress(`Phrase ${i + 1} / ${items.length}`);
    results.push(await one(ctx, items[i], i));
    await sleep(250);
  }
  const first = results.filter(r => r.a1.exact).length;
  const second = results.filter(r => r.a2.exact).length;
  const w1 = results.reduce((a, r) => a + r.a1.correct, 0);
  const w2 = results.reduce((a, r) => a + r.a2.correct, 0);
  const wt = results.reduce((a, r) => a + r.a1.total, 0);
  const segs = results.flatMap((r, i) => r.seg1.map(s => ({ ...s, i })));

  const view = h('div', {},
    h('div', { class: 'panel' },
      h('div', { class: 'metrics' },
        h('div', { class: 'metric' }, h('div', { class: 'v' }, `${first}/10`), h('div', { class: 'k' }, 'phrases exactes — 1er passage')),
        h('div', { class: 'metric' }, h('div', { class: 'v' }, `${second}/10`), h('div', { class: 'k' }, 'phrases exactes — 2e passage')),
        h('div', { class: 'metric' }, h('div', { class: 'v' }, `${fmtNum(w1 / wt * 100)} %`), h('div', { class: 'k' }, 'mots justes — 1er passage')),
        h('div', { class: 'metric' }, h('div', { class: 'v' }, `${fmtNum(w2 / wt * 100)} %`), h('div', { class: 'k' }, 'mots justes — 2e passage')),
        h('div', { class: 'metric' }, h('div', { class: 'v' }, segs.length), h('div', { class: 'k' }, 'erreurs de découpage (1er passage)')))),
    h('div', { class: 'panel mt' }, h('h3', {}, 'Correction phrase par phrase'),
      h('div', { class: 'items' }, results.map((r, i) => h('div', { class: 'item ' + (r.a2.exact ? 'ok' : 'bad') },
        h('div', { class: 'lbl' }, `Phrase ${i + 1} · 1er passage ${r.a1.correct}/${r.a1.total} · 2e passage ${r.a2.correct}/${r.a2.total}`),
        h('div', { style: { fontWeight: 800, margin: '4px 0' } }, r.sentence),
        h('div', { class: 'small muted' }, '1er passage :'), h('div', { class: 'diff', html: diffHtml(r.a1.ops) }),
        h('div', { class: 'small muted mt' }, '2e passage :'), h('div', { class: 'diff', html: diffHtml(r.a2.ops) }),
        r.seg1.length ? h('div', { class: 'small', style: { color: 'var(--warn)', marginTop: '6px' } }, 'Découpage : ' + r.seg1.map(s => s.detail).join(' ; ')) : null,
        r.item.features ? h('div', { class: 'small faint' }, 'Enchaînements : ' + r.item.features) : null)))));

  return {
    durationMs: performance.now() - t0,
    score: { text: `1er passage : ${first}/10 exactes · 2e passage : ${second}/10`, pct: first / 10 },
    primary: first,
    sections: [
      { title: 'Scores', body: `- Premier passage : ${first}/10 phrases exactes · ${w1}/${wt} mots justes (${fmtNum(w1 / wt * 100, 1)} %)\n- Deuxième passage : ${second}/10 phrases exactes · ${w2}/${wt} mots justes (${fmtNum(w2 / wt * 100, 1)} %)\n- Erreurs de découpage au premier passage : ${segs.length}` },
      { title: 'Détail par phrase', body: results.map((r, i) => `${i + 1}. ${r.sentence}${r.item.features ? ` _(${r.item.features})_` : ''}\n   - 1er passage (${r.a1.correct}/${r.a1.total}) : ${r.t1.trim() || '(vide)'}${r.a1.exact ? '' : `\n     - Écarts : ${diffText(r.a1.ops)}`}\n   - 2e passage (${r.a2.correct}/${r.a2.total}) : ${r.t2.trim() || '(vide)'}${r.a2.exact ? '' : `\n     - Écarts : ${diffText(r.a2.ops)}`}${r.seg1.length ? `\n   - Découpage : ${r.seg1.map(s => s.detail).join(' ; ')}` : ''}`).join('\n') },
    ],
    view,
    data: { firstPass: first, secondPass: second, firstWordsPct: w1 / wt * 100, secondWordsPct: w2 / wt * 100, segErrors: segs.length },
  };
}

function one(ctx, item, idx) {
  return new Promise(async resolve => {
    const rate = await getRate();
    const slider = h('input', { type: 'range', min: '0.7', max: '1.2', step: '0.05', value: String(rate) });
    slider.addEventListener('input', () => setRate(+slider.value));
    const playBtn = h('button', { class: 'playbtn', html: icon('play'), 'aria-label': 'Écouter' });
    const caption = h('div', { class: 'small muted', style: { fontWeight: 800 } });
    const dots = h('div', { class: 'plays' }, h('i'), h('i'));
    const ta = h('textarea', { class: 'answer', placeholder: 'Écris ce que tu as entendu…', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'sentences', lang: 'en', style: { minHeight: '110px' }, disabled: true });
    const action = h('button', { class: 'btn go' });
    ctx.root.replaceChildren(h('div', { class: 'panel' },
      h('div', { class: 'instruction' }, 'Deux écoutes imposées : écris après la première, corrige après la seconde.'),
      h('div', { class: 'listen-zone' }, playBtn, dots, caption), ta,
      h('div', { class: 'row mt' }, h('div', { class: 'speed' }, 'Vitesse', slider), h('span', { class: 'spacer' }), action)));

    let stage = 0; // 0 : avant écoute 1 · 1 : écriture · 2 : écoute 2 en cours · 3 : correction
    let t1 = '';
    const setStage = s => {
      stage = s;
      if (s === 0) { caption.textContent = 'Écoute 1 sur 2 — appuie pour lancer'; action.innerHTML = '<span>Écoute 1</span> <kbd>Espace</kbd>'; action.disabled = false; }
      if (s === 1) { caption.textContent = 'Écris ce que tu as entendu'; action.innerHTML = '<span>J’ai écrit → écoute 2</span> <kbd>Ctrl+Entrée</kbd>'; action.disabled = false; ta.disabled = false; ta.focus(); }
      if (s === 2) { caption.textContent = 'Écoute 2 sur 2…'; action.disabled = true; }
      if (s === 3) { caption.textContent = 'Corrige ta phrase, puis valide'; action.innerHTML = '<span>Valider</span> <kbd>Ctrl+Entrée</kbd>'; action.disabled = false; ta.disabled = false; ta.focus(); }
    };
    const play = async n => {
      playBtn.disabled = true; playBtn.classList.add('playing'); action.disabled = true; ta.disabled = true;
      dots.children[n - 1].classList.add('used');
      caption.textContent = `Écoute ${n} sur 2…`;
      try { await speak(item.sentence); } catch { caption.textContent = 'Lecture impossible sur cet appareil.'; }
      playBtn.classList.remove('playing');
    };
    const step = async () => {
      if (action.disabled && stage !== 0) return;
      if (stage === 0) { action.disabled = true; await play(1); setStage(1); }
      else if (stage === 1) { t1 = ta.value; setStage(2); await play(2); setStage(3); }
      else if (stage === 3) {
        cancelSpeech();
        const t2 = ta.value;
        resolve({ item, sentence: item.sentence, t1, t2, a1: alignWords(item.sentence, t1), a2: alignWords(item.sentence, t2), seg1: segmentationErrors(item.sentence, t1) });
      }
    };
    playBtn.addEventListener('click', () => { if (stage === 0) step(); });
    action.addEventListener('click', step);
    ctx.setKeys({ Space: () => { if (stage === 0) step(); }, Enter: () => { if (stage === 1 || stage === 3) step(); } });
    setStage(0);
    playBtn.disabled = false;
  });
}
