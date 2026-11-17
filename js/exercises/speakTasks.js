// Speak About the Photo (20 s + 90 s), Read Then Speak (20 s + 90 s), Speaking Sample (jusqu'à 30 s + 3 min).
// (Guide 2026 §4.4, §4.5, §4.8)
import { h, fmtNum, photoEl, prepPhase, recordPhase, oralMetricsView, oralReportLines, oralClaudeMeasures } from './common.js';

const CFG = {
  'speak-about-the-photo': { prep: 20, canSkip: false, speak: 90, instr: 'Speak about the photo below for 30–90 seconds.' },
  'read-then-speak': { prep: 20, canSkip: false, speak: 90, instr: 'Speak about the topic below for 30–90 seconds.' },
  'speaking-sample': { prep: 30, canSkip: true, speak: 180, instr: 'Speak about the topic below for 1–3 minutes.' },
};

export async function run(ctx, items) {
  const id = ctx.ex.id;
  const cfg = CFG[id];
  const item = items[0];
  const t0 = performance.now();
  const area = h('div', {});
  const promptBox = id === 'speak-about-the-photo'
    ? photoEl(item)
    : h('div', { class: 'cover-note', style: { fontSize: '18px', color: 'var(--text)' } },
      h('div', { style: { fontWeight: 800 } }, item.prompt),
      item.bullets && item.bullets.length ? h('ul', { style: { margin: '8px 0 0', paddingLeft: '1.2em' } }, item.bullets.map(b => h('li', {}, b))) : null);
  ctx.root.replaceChildren(h('div', { class: 'panel' }, h('div', { class: 'instruction' }, cfg.instr), promptBox, h('div', { class: 'mt' }, area)));
  ctx.setProgress('Préparation');
  const prep = await prepPhase(ctx, area, cfg.prep, { label: 'Préparation', canSkip: cfg.canSkip, skipLabel: 'Commencer à parler' });
  if (ctx.aborted) return null;
  ctx.setProgress('Enregistrement');
  const m = await recordPhase(ctx, area, cfg.speak, { exerciseId: id, recLabel: ctx.ex.name });
  if (ctx.aborted || !m) return null;

  const reminders = [];
  if (!m.skipped && m.unusedSec >= 20) reminders.push(`Prise arrêtée avec ${Math.round(m.unusedSec)} s encore au compteur.`);
  const promptText = id === 'speak-about-the-photo' ? `Photo : ${item.title}${item.description ? ' — ' + item.description : ''}` : [item.prompt, ...(item.bullets || []).map(b => '- ' + b)].join('\n');
  const words = m.words ?? 0;
  const usedMin = Math.max(0.01, (m.durationMs || 1) / 60000);
  const primary = id === 'speaking-sample' ? Math.round(words / usedMin) : words;
  const promptView = id === 'speak-about-the-photo'
    ? h('div', { class: 'panel' }, h('img', { class: 'photo', src: 'content/photos/' + item.file, alt: '', style: { maxHeight: '240px' } }))
    : h('div', { class: 'panel' }, h('b', {}, item.prompt), item.bullets ? h('ul', {}, item.bullets.map(b => h('li', {}, b))) : null);
  return {
    durationMs: performance.now() - t0,
    score: { text: m.skipped ? 'Pas de réponse enregistrée' : `${m.words ?? '?'} mots · ${m.wpmTotal == null ? '?' : fmtNum(m.wpmTotal)} mots/min · ${m.silenceCount} silence(s) > 1 s`, pct: null },
    primary: m.words == null ? null : primary,
    reminders,
    sections: [
      { title: 'Sujet', body: (id === 'speak-about-the-photo' ? `- Photo : ${item.file} (${item.title})` : promptText) + `\n- Préparation utilisée : ${fmtNum(prep, 1)} s sur ${cfg.prep} s` },
      { title: 'Mesures orales', body: oralReportLines(m) },
    ],
    audio: m.recId ? [{ recId: m.recId, label: ctx.ex.name }] : [],
    view: h('div', {}, promptView, oralMetricsView(m, {})),
    claude: m.skipped ? [] : [{ exerciseName: `${ctx.ex.name} (${cfg.prep} s de préparation, ${cfg.speak} s de parole)`, kind: 'speaking', prompt: promptText, response: m.transcript, measures: oralClaudeMeasures(m) }],
    data: { wpmTotal: m.wpmTotal, wpmSpeech: m.wpmSpeech, silenceCount: m.silenceCount, silenceSec: m.silenceSec, unusedSec: m.unusedSec },
  };
}
