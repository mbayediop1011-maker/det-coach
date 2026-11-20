// Dictée longue (hors test) — dix phrases, exactement deux écoutes imposées.
// On écrit après la première écoute, on corrige après la seconde. Score du premier passage séparé.
import { h, fmtNum, speak, cancelSpeech, icon, sleep } from './common.js';
import { alignWords, diffHtml, diffText, segmentationErrors, COLLAPSE_RUN } from '../compare.js';
import { LEVEL_UP_PCT, rangeText } from '../levels.js';
import { getRate, setRate } from '../speech.js';

export async function run(ctx, items) {
  const L = ctx.meta && ctx.meta.level ? ctx.meta.level : { level: null };
  const lvlTag = L.level ? `Niveau ${L.level} · ` : '';
  const results = [];
  const t0 = performance.now();
  for (let i = 0; i < items.length; i++) {
    if (ctx.aborted) return null;
    ctx.setProgress(`${lvlTag}Phrase ${i + 1} / ${items.length}`);
    results.push(await one(ctx, items[i], i));
    await sleep(250);
  }
  const N = results.length;
  const first = results.filter(r => r.a1.exact).length;
  const second = results.filter(r => r.a2.exact).length;
  const w1 = results.reduce((a, r) => a + r.a1.correct, 0);
  const w2 = results.reduce((a, r) => a + r.a2.correct, 0);
  const wt = results.reduce((a, r) => a + r.a1.total, 0);
  const pct1 = wt ? w1 / wt * 100 : 0, pct2 = wt ? w2 / wt * 100 : 0;
  const om1 = results.reduce((a, r) => a + r.a1.omitted, 0);
  const omRate1 = wt ? om1 / wt * 100 : 0;
  const segs = results.flatMap((r, i) => r.seg1.map(s => ({ ...s, i })));
  // Décrochage au premier passage.
  const col = results.map(r => r.a1.collapse);
  const collapsed = col.filter(Boolean);
  const keptPct = N ? col.reduce((a, c) => a + (c ? c.ratio : 1), 0) / N * 100 : 0;
  const avgRank = collapsed.length ? collapsed.reduce((a, c) => a + c.rank, 0) / collapsed.length : null;
  const colText = c => c ? `décroche après le mot ${c.rank} sur ${c.of}${c.word ? ` (« ${c.word} »)` : ' (dès le début)'}` : 'tenue jusqu’au bout';
  // Niveau.
  const levelUp = L.level && !L.max && pct1 >= LEVEL_UP_PCT;
  const levelLine = !L.level ? null
    : L.max ? `Niveau ${L.level} (niveau maximal) — ${fmtNum(pct1, 1)} % de mots justes au premier passage.`
      : levelUp ? `Niveau ${L.level} validé avec ${fmtNum(pct1, 1)} % de mots justes au premier passage : prochaine séance au niveau ${L.level + 1} (${rangeText(L.level + 1)}).`
        : `Niveau ${L.level} : ${fmtNum(pct1, 1)} % de mots justes au premier passage. Il faut ${LEVEL_UP_PCT} % pour passer au niveau ${L.level + 1}.`;

  const metric = (v, k) => h('div', { class: 'metric' }, h('div', { class: 'v' }, v), h('div', { class: 'k' }, k));
  const view = h('div', {},
    levelLine ? h('div', { class: levelUp ? 'cover-note' : 'cover-note', style: { fontWeight: 800, color: levelUp ? 'var(--ok)' : 'var(--text)', marginBottom: '12px' } }, (levelUp ? '⬆️ ' : '🎚️ ') + levelLine) : null,
    h('div', { class: 'panel' },
      h('h3', {}, 'Premier passage'),
      h('div', { class: 'metrics' },
        metric(`${fmtNum(keptPct)} %`, 'de la phrase tenue avant décrochage (moyenne)'),
        metric(`${collapsed.length}/${N}`, 'phrases qui décrochent'),
        metric(avgRank == null ? '—' : fmtNum(avgRank, 1), 'rang moyen du dernier mot juste avant décrochage'),
        metric(`${fmtNum(pct1)} %`, 'mots justes'),
        metric(`${fmtNum(omRate1, 1)} %`, 'taux d’omission'),
        metric(segs.length, 'erreurs de découpage'),
        metric(`${first}/${N}`, 'phrases exactes')),
      h('h3', { class: 'mt' }, 'Deuxième passage'),
      h('div', { class: 'metrics' }, metric(`${fmtNum(pct2)} %`, 'mots justes'), metric(`${second}/${N}`, 'phrases exactes'))),
    h('div', { class: 'panel mt' }, h('h3', {}, 'Correction phrase par phrase'),
      h('p', { class: 'small muted' }, 'Barré rouge : écrit faux · vert : attendu · souligné jaune : mot omis. Contractions et formes développées sont équivalentes (there’s = there is).'),
      h('div', { class: 'items' }, results.map((r, i) => h('div', { class: 'item ' + (r.a2.exact ? 'ok' : 'bad') },
        h('div', { class: 'lbl' }, `Phrase ${i + 1} · 1er passage ${r.a1.correct}/${r.a1.total} · ${colText(r.a1.collapse)}${r.a1.omitted ? ` · ${r.a1.omitted} omis` : ''} · 2e passage ${r.a2.correct}/${r.a2.total}`),
        h('div', { style: { fontWeight: 800, margin: '4px 0' } }, r.sentence),
        h('div', { class: 'small muted' }, '1er passage :'), h('div', { class: 'diff', html: diffHtml(r.a1.ops) }),
        h('div', { class: 'small muted mt' }, '2e passage :'), h('div', { class: 'diff', html: diffHtml(r.a2.ops) }),
        r.seg1.length ? h('div', { class: 'small', style: { color: 'var(--warn)', marginTop: '6px' } }, 'Découpage : ' + r.seg1.map(s => s.detail).join(' ; ')) : null,
        r.item.features ? h('div', { class: 'small faint' }, 'Enchaînements : ' + r.item.features) : null)))));

  const scores = [
    levelLine ? `- ${levelLine}` : null,
    `- Premier passage : ${first}/${N} phrases exactes · ${w1}/${wt} mots justes (${fmtNum(pct1, 1)} %)`,
    `- Position du décrochage (1er passage) : ${collapsed.length}/${N} phrases décrochent · part moyenne de la phrase tenue : ${fmtNum(keptPct, 1)} %${avgRank == null ? '' : ` · rang moyen du dernier mot juste : ${fmtNum(avgRank, 1)}`}`,
    `- Taux d'omission (1er passage) : ${fmtNum(omRate1, 1)} % (${om1} mot(s) omis sur ${wt})`,
    `- Erreurs de découpage (1er passage, uniquement là où quelque chose est écrit) : ${segs.length}`,
    `- Deuxième passage : ${second}/${N} phrases exactes · ${w2}/${wt} mots justes (${fmtNum(pct2, 1)} %)`,
    `- Règles : contractions = formes développées ; décrochage = dernier mot juste avant ${COLLAPSE_RUN} mots attendus perdus d'affilée (omis ou sans rapport ; une faute d'orthographe proche ou un collage ne fait pas décrocher).`,
  ].filter(Boolean).join('\n');
  return {
    durationMs: performance.now() - t0,
    score: { text: `1er passage : ${first}/${N} exactes · ${fmtNum(pct1)} % de mots · 2e : ${second}/${N}`, pct: first / N },
    primary: first,
    sections: [
      { title: 'Scores', body: scores },
      { title: 'Détail par phrase', body: results.map((r, i) => `${i + 1}. ${r.sentence}${r.item.features ? ` _(${r.item.features})_` : ''}\n   - 1er passage (${r.a1.correct}/${r.a1.total}, ${r.a1.omitted} omis, ${colText(r.a1.collapse)}) : ${r.t1.trim() || '(vide)'}${r.a1.exact ? '' : `\n     - Écarts : ${diffText(r.a1.ops)}`}\n   - 2e passage (${r.a2.correct}/${r.a2.total}) : ${r.t2.trim() || '(vide)'}${r.a2.exact ? '' : `\n     - Écarts : ${diffText(r.a2.ops)}`}${r.seg1.length ? `\n   - Découpage : ${r.seg1.map(s => s.detail).join(' ; ')}` : ''}`).join('\n') },
    ],
    view,
    data: { level: L.level, levelUp, firstPass: first, secondPass: second, firstWordsPct: pct1, secondWordsPct: pct2, segErrors: segs.length, omissionRate1: omRate1, keptPct1: keptPct, collapsed1: collapsed.length, avgCollapseRank1: avgRank },
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
