// Writing Sample — jusqu'à 30 s pour lire, puis jusqu'à 5 min. (Guide 2026 §4.7)
import { h, fmtNum, prepPhase, writePhase, writingMetricsView, writingReportLines, writingClaudeMeasures } from './common.js';

export async function run(ctx, items) {
  const item = items[0];
  const t0 = performance.now();
  const area = h('div', {});
  ctx.setProgress('Lecture du sujet');
  ctx.root.replaceChildren(h('div', { class: 'panel' },
    h('div', { class: 'instruction' }, 'Write about the topic below for 3–5 minutes.'),
    h('div', { class: 'cover-note', style: { fontSize: '18px', color: 'var(--text)', fontWeight: 700, marginBottom: '12px' } }, item.prompt),
    area));
  const prep = await prepPhase(ctx, area, 30, { label: 'Lecture et réflexion', canSkip: true, skipLabel: 'Commencer à écrire' });
  if (ctx.aborted) return null;
  ctx.setProgress('Rédaction — 5 min');
  const w = await writePhase(ctx, area, 300, { tall: true });
  if (ctx.aborted) return null;
  const reminders = w.unusedSec >= 60 ? [`Validé avec ${Math.round(w.unusedSec)} s inutilisées.`] : [];
  return {
    durationMs: performance.now() - t0,
    score: { text: `${w.words} mots · ${fmtNum(w.wpm)} mots/min`, pct: null },
    primary: w.words,
    reminders,
    sections: [
      { title: 'Sujet', body: `- ${item.prompt}\n- Temps de lecture utilisé : ${fmtNum(prep, 1)} s sur 30 s` },
      { title: 'Rédaction', body: writingReportLines(w) },
    ],
    view: writingMetricsView(w, { title: item.prompt }),
    claude: [{ exerciseName: 'Writing Sample (5 min)', kind: 'writing', prompt: item.prompt, response: w.text, measures: writingClaudeMeasures(w) }],
    data: { wpm: w.wpm },
  };
}
