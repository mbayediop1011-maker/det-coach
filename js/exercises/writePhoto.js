// Write About the Photo — une photo, 1 minute, aucune préparation. 3 photos par séance (3 par test). (Guide 2026 §4.2)
import { h, fmtNum, photoEl, writePhase, writingMetricsView, writingReportLines, writingClaudeMeasures, sleep } from './common.js';

export async function run(ctx, items) {
  const t0 = performance.now();
  const res = [];
  for (let i = 0; i < items.length; i++) {
    if (ctx.aborted) return null;
    ctx.setProgress(`Photo ${i + 1} / ${items.length}`);
    const area = h('div', {});
    ctx.root.replaceChildren(h('div', { class: 'panel' }, h('div', { class: 'instruction' }, 'Write one or more sentences that describe the image.'), photoEl(items[i]), area));
    const w = await writePhase(ctx, area, 60, { label: 'Temps restant', placeholder: 'Your response…' });
    res.push({ item: items[i], w });
    await sleep(300);
  }
  if (ctx.aborted) return null;
  const avg = res.reduce((a, r) => a + r.w.words, 0) / res.length;
  const reminders = [];
  const early = res.filter(r => r.w.unusedSec >= 15);
  if (early.length) reminders.push(`Validé avec du temps restant sur ${early.length} photo(s) (${early.map(r => Math.round(r.w.unusedSec) + ' s').join(', ')}).`);
  const view = h('div', {}, res.map((r, i) => h('div', {},
    h('div', { class: 'panel mt' }, h('img', { class: 'photo', src: 'content/photos/' + r.item.file, alt: '', style: { maxHeight: '220px' } })),
    writingMetricsView(r.w, { title: `Photo ${i + 1} — ${r.w.words} mots` }))));
  return {
    durationMs: performance.now() - t0,
    score: { text: `${fmtNum(avg, 1)} mots en moyenne par photo (${res.map(r => r.w.words).join(' / ')})`, pct: null },
    primary: Math.round(avg * 10) / 10,
    reminders,
    sections: res.map((r, i) => ({ title: `Photo ${i + 1} (${r.item.file})`, body: writingReportLines(r.w) })),
    view,
    claude: res.map((r, i) => ({ exerciseName: `Write About the Photo (1 min) — photo ${i + 1}`, kind: 'writing', prompt: `Décrire la photo en 1 minute. Description de la photo (pour toi, correcteur) : ${r.item.title}${r.item.description ? ' — ' + r.item.description : ''}`, response: r.w.text, measures: writingClaudeMeasures(r.w) })),
    data: { words: avg },
  };
}
