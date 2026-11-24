// Interactive Speaking — 2 thèmes, 3 à 4 questions chacun, posées à l'oral et entendues une seule fois.
// Le chrono de 35 s démarre quand la question est terminée ; il faut cliquer pour enregistrer. (Guide 2026 §4.6)
import { h, fmtNum, speak, cancelSpeech, recordPhase, oralMetricsView, oralReportLines, oralClaudeMeasures, sleep } from './common.js';

export async function run(ctx, items) {
  const t0 = performance.now();
  const answers = [];
  const qs = items.flatMap(it => it.questions.slice(0, 4).map((q, i) => ({ topic: it.topic, q, first: i === 0, item: it })));
  for (let i = 0; i < qs.length; i++) {
    if (ctx.aborted) return null;
    const { topic, q, first } = qs[i];
    ctx.setProgress(`Question ${i + 1} / ${qs.length}`);
    const avatar = h('div', { class: 'avatar' }, i % 2 ? '🧑‍💼' : '👩‍💼');
    const area = h('div', {});
    const status = h('div', { class: 'center muted', style: { fontWeight: 800 } }, 'Écoute la question…');
    ctx.root.replaceChildren(h('div', { class: 'panel' },
      first ? h('div', { class: 'cover-note center', style: { marginBottom: '10px' } }, `Nouveau thème : ${topic}`) : null,
      h('div', { class: 'instruction center' }, 'Listen to the question and record your answer.'),
      avatar, status, area));
    if (first && i > 0) await sleep(900);
    avatar.classList.add('talking');
    try { await speak(q, { voice: i % 2 ? 'b' : 'a' }); } catch { status.textContent = 'Lecture impossible : la question est affichée.'; area.append(h('p', { class: 'cover-note' }, q)); }
    avatar.classList.remove('talking');
    if (ctx.aborted) return null;
    status.textContent = '';
    const m = await recordPhase(ctx, area, 35, { exerciseId: ctx.ex.id, recLabel: `Interactive Speaking — question ${i + 1}`, requireClick: true });
    if (ctx.aborted) return null;
    answers.push({ topic, q, m });
    cancelSpeech();
    await sleep(400);
  }
  const valid = answers.filter(a => a.m && !a.m.skipped && a.m.words != null);
  const avg = valid.length ? valid.reduce((s, a) => s + a.m.words, 0) / answers.length : null;
  const wpmT = valid.length ? valid.reduce((s, a) => s + (a.m.wpmTotal || 0), 0) / valid.length : null;
  const wpmS = valid.length ? valid.reduce((s, a) => s + (a.m.wpmSpeech || 0), 0) / valid.length : null;
  const silN = answers.reduce((s, a) => s + (a.m && !a.m.skipped ? a.m.silenceCount : 0), 0);
  const silS = answers.reduce((s, a) => s + (a.m && !a.m.skipped ? a.m.silenceSec : 0), 0);
  // Régularité d'une question à l'autre : mots par réponse, écart-type.
  const perAnswer = answers.map(a => (a.m && !a.m.skipped && a.m.words != null ? a.m.words : null));
  const known = perAnswer.filter(x => x != null);
  const sd = known.length > 1 ? Math.sqrt(known.reduce((s2, x) => s2 + (x - known.reduce((a, b) => a + b, 0) / known.length) ** 2, 0) / known.length) : null;
  const reminders = [];
  const early = answers.filter(a => a.m && !a.m.skipped && a.m.unusedSec >= 10);
  if (early.length) reminders.push(`${early.length} réponse(s) arrêtée(s) avec 10 s ou plus encore au compteur.`);
  const notRec = answers.filter(a => !a.m || a.m.skipped).length;
  if (notRec) reminders.push(`${notRec} question(s) sans enregistrement (clic sur « enregistrer » non fait à temps).`);

  return {
    durationMs: performance.now() - t0,
    score: { text: `${avg == null ? '?' : fmtNum(avg, 1)} mots par réponse en moyenne · ${answers.length} questions`, pct: null },
    primary: avg == null ? null : Math.round(avg * 10) / 10,
    reminders,
    sections: [
      { title: 'Régularité', body: `- Mots par réponse : ${perAnswer.map(x => x == null ? '—' : x).join(', ')}${known.length ? ` · min ${Math.min(...known)} · max ${Math.max(...known)}` : ''}${sd == null ? '' : ` · écart-type ${fmtNum(sd, 1)}`}\n- Temps non utilisé par réponse : ${answers.map(a => a.m && !a.m.skipped ? Math.round(a.m.unusedSec) + ' s' : '—').join(', ')}` },
      ...answers.map((a, i) => ({ title: `Question ${i + 1} — ${a.topic}`, body: `- Question : ${a.q}\n${oralReportLines(a.m)}` })),
    ],
    audio: answers.filter(a => a.m && a.m.recId).map((a, i) => ({ recId: a.m.recId, label: `Question ${i + 1}` })),
    view: h('div', {}, h('div', { class: 'panel' }, h('h3', {}, 'Régularité'), h('div', { class: 'metrics' },
      ...perAnswer.map((x, i) => h('div', { class: 'metric' }, h('div', { class: 'v' }, x == null ? '—' : x), h('div', { class: 'k' }, `mots · Q${i + 1}`))),
      h('div', { class: 'metric' }, h('div', { class: 'v' }, sd == null ? '—' : fmtNum(sd, 1)), h('div', { class: 'k' }, 'écart-type')))), answers.map((a, i) => h('div', {}, h('div', { class: 'panel mt' }, h('div', { class: 'small muted' }, `Question ${i + 1} · ${a.topic}`), h('b', {}, a.q)), oralMetricsView(a.m, {})))),
    claude: [{ exerciseName: 'Interactive Speaking (35 s par réponse)', kind: 'speaking', prompt: answers.map((a, i) => `Q${i + 1} (${a.topic}) : ${a.q}`).join('\n'), response: answers.map((a, i) => `Q${i + 1} : ${a.m && !a.m.skipped ? (a.m.transcript || '(aucun mot reconnu)') : '(pas de réponse)'}`).join('\n'), measures: answers.map((a, i) => `Q${i + 1} :\n${oralClaudeMeasures(a.m)}`).join('\n') }],
    data: { wpmTotal: wpmT, wpmSpeech: wpmS, silenceCount: silN, silenceSec: silS },
  };
}
