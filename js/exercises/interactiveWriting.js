// Interactive Writing — jusqu'à 30 s de lecture, 5 min (étape 1), puis une relance en 3 min sans préparation. (Guide 2026 §4.3)
import { h, fmtNum, prepPhase, writePhase, writingMetricsView, writingReportLines, writingClaudeMeasures } from './common.js';

export async function run(ctx, items) {
  const item = items[0];
  const t0 = performance.now();
  const q1 = h('div', { class: 'cover-note', style: { fontSize: '18px', color: 'var(--text)', fontWeight: 700, marginBottom: '12px' } }, item.prompt);
  const area = h('div', {});
  ctx.setProgress('Étape 1 — lecture');
  ctx.root.replaceChildren(h('div', { class: 'panel' }, h('div', { class: 'instruction' }, 'Respond to the question in at least 50 words.'), q1, area));
  const prep = await prepPhase(ctx, area, 30, { label: 'Lecture et réflexion', canSkip: true, skipLabel: 'Commencer à écrire' });
  if (ctx.aborted) return null;
  ctx.setProgress('Étape 1 — 5 min');
  const w1 = await writePhase(ctx, area, 300, { tall: true });
  if (ctx.aborted) return null;
  ctx.setProgress('Étape 2 — 3 min');
  const area2 = h('div', {});
  ctx.root.replaceChildren(h('div', { class: 'panel' },
    h('details', { class: 'fold', open: true }, h('summary', {}, 'Étape 1 (rappel)'), h('p', { class: 'muted' }, item.prompt), h('div', { class: 'transcript', style: { fontSize: '15px' } }, w1.text || '(vide)')),
    h('div', { class: 'instruction mt' }, 'Respond to the follow-up question in at least 50 words.'),
    h('div', { class: 'cover-note', style: { fontSize: '18px', color: 'var(--text)', fontWeight: 700, marginBottom: '12px' } }, item.followUp),
    area2));
  const w2 = await writePhase(ctx, area2, 180, { tall: true });
  if (ctx.aborted) return null;
  const reminders = [];
  if (w1.unusedSec >= 30) reminders.push(`Étape 1 validée avec ${Math.round(w1.unusedSec)} s inutilisées.`);
  if (w2.unusedSec >= 30) reminders.push(`Étape 2 validée avec ${Math.round(w2.unusedSec)} s inutilisées.`);
  return {
    durationMs: performance.now() - t0,
    score: { text: `Étape 1 : ${w1.words} mots · étape 2 : ${w2.words} mots`, pct: null },
    primary: w1.words,
    reminders,
    sections: [
      { title: 'Sujet', body: `- Étape 1 : ${item.prompt}\n- Étape 2 : ${item.followUp}\n- Temps de lecture utilisé avant d'écrire : ${fmtNum(prep, 1)} s sur 30 s` },
      { title: 'Étape 1 (5 min)', body: writingReportLines(w1) },
      { title: 'Étape 2 (3 min)', body: writingReportLines(w2) },
    ],
    view: h('div', {}, writingMetricsView(w1, { title: 'Étape 1 — ' + item.prompt }), writingMetricsView(w2, { title: 'Étape 2 — ' + item.followUp })),
    claude: [{ exerciseName: 'Interactive Writing (5 min + 3 min, les deux étapes notées ensemble)', kind: 'writing', prompt: `Étape 1 : ${item.prompt}\nÉtape 2 (relance) : ${item.followUp}`, response: `ÉTAPE 1 :\n${w1.text}\n\nÉTAPE 2 :\n${w2.text}`, measures: `Étape 1 :\n${writingClaudeMeasures(w1)}\nÉtape 2 :\n${writingClaudeMeasures(w2)}` }],
    data: { words2: w2.words, wpm: w1.wpm },
  };
}
