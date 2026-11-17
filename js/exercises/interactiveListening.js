// Interactive Listening — Listen and Complete + Listen and Respond (6 min 30 en commun),
// puis Summarize the Conversation (75 s, chrono séparé). (Guide 2026 §3.6 et §4.1)
import { h, Timer, fmtNum, pct, listenButton, speak, cancelSpeech, choiceList, writePhase, writingMetricsView, writingReportLines, writingClaudeMeasures, sleep } from './common.js';
import { overlapScore } from '../compare.js';
import { shuffle } from '../ui.js';

export async function run(ctx, items) {
  const item = items[0];
  const t0 = performance.now();
  const timer = new Timer({ seconds: 390, label: 'Écoute + réponses' });
  const area = h('div', {});
  ctx.root.replaceChildren(h('div', {}, timer.el, area));
  let timeUp = false, resolveTU;
  const timeUpP = new Promise(r => { resolveTU = r; });
  timer.onEnd = () => { timeUp = true; cancelSpeech(); resolveTU(); };
  ctx.onCleanup(() => { timer.stop(); cancelSpeech(); });
  timer.start();
  const who = item.partner === 'professor' ? (item.partnerName || 'the professor') : (item.partnerName || 'your classmate');

  // 1. Listen and Complete
  ctx.setProgress('Listen and Complete');
  const lb = listenButton({ onPlay: () => speak(item.scenario, { voice: 'a' }) });
  const inputs = item.complete.map(c => {
    const [before, after] = c.text.split('___');
    const inp = h('input', { class: 'answer', style: { display: 'inline-block', width: 'min(100%, 340px)', padding: '6px 10px', fontSize: '17px', margin: '4px 0' }, autocorrect: 'off', spellcheck: 'false', lang: 'en' });
    return { c, inp, el: h('div', { class: 'passage', style: { fontSize: '18px', lineHeight: 1.9 } }, before, inp, after || '') };
  });
  let next = h('button', { class: 'btn go', html: '<span>Suivant</span> <kbd>Entrée</kbd>' });
  area.replaceChildren(h('div', { class: 'panel' },
    h('div', { class: 'instruction' }, `Listen to the scenario and complete the sentences. You will then have a conversation with ${who}.`),
    lb.el, ...inputs.map(x => x.el), h('div', { class: 'row end mt' }, next)));
  ctx.setKeys({ Space: () => lb.play(), Enter: () => next.click() });
  await Promise.race([new Promise(r => next.addEventListener('click', r)), timeUpP]);
  cancelSpeech();
  const part1 = inputs.map(({ c, inp }) => ({ text: c.text, answer: c.answer, given: inp.value.trim(), score: overlapScore(c.answer, inp.value) }));

  // 2. Listen and Respond
  const part2 = [];
  const transcript = [];
  if (!timeUp && !ctx.aborted) {
    ctx.setProgress('Listen and Respond');
    const convo = h('div', { class: 'convo' });
    const avatar = h('div', { class: 'avatar' }, item.partner === 'professor' ? '👩‍🏫' : '🧑‍🎓');
    const optsBox = h('div', {});
    area.replaceChildren(h('div', { class: 'panel' },
      h('div', { class: 'instruction' }, 'Select the best response.'),
      avatar, h('div', { class: 'center small muted', style: { fontWeight: 800 } }, who), convo, optsBox));
    const turns = item.conversation;
    const youTotal = turns.filter(t => t.who === 'you').length;
    let k = 0;
    for (const t of turns) {
      if (timeUp || ctx.aborted) break;
      if (t.who === 'them') {
        transcript.push(`${who} : ${t.line}`);
        const b = h('div', { class: 'bubble them audio' }, '🔊 …');
        convo.append(b);
        avatar.classList.add('talking');
        await Promise.race([speak(t.line, { voice: 'b' }).catch(() => {}), timeUpP]);
        avatar.classList.remove('talking');
        b.textContent = '🔊 (réplique entendue)';
      } else {
        k++;
        ctx.setProgress(`Listen and Respond ${k} / ${youTotal}`);
        const opts = shuffle(t.options);
        const cl = choiceList(opts);
        const ok = h('button', { class: 'btn go', html: '<span>Valider</span> <kbd>Entrée</kbd>' });
        optsBox.replaceChildren(cl.el, h('div', { class: 'row end mt' }, ok));
        requestAnimationFrame(() => optsBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
        ctx.setKeys({ Enter: () => ok.click(), a: () => cl.select(0), b: () => cl.select(1), c: () => cl.select(2), d: () => cl.select(3) });
        await Promise.race([new Promise(r => ok.addEventListener('click', () => { if (cl.selected != null) r(); })), timeUpP]);
        const given = cl.selected == null ? null : opts[cl.selected];
        part2.push({ answer: t.options[0], given, ok: given === t.options[0] });
        transcript.push(`Toi : ${t.options[0]}`);
        optsBox.replaceChildren();
        convo.append(h('div', { class: 'bubble me' }, t.options[0]));
        await sleep(350);
      }
    }
    // Répliques non atteintes : comptées fausses.
    for (let i = part2.length; i < youTotal; i++) {
      const t = turns.filter(x => x.who === 'you')[i];
      part2.push({ answer: t.options[0], given: null, ok: false });
    }
  }
  timer.stop();
  cancelSpeech();
  if (ctx.aborted) return null;

  // 3. Summarize the Conversation — 75 s, chrono séparé.
  ctx.setProgress('Summarize the Conversation');
  const w = await writePhase(ctx, area, 75, {
    label: 'Résumé',
    above: h('div', { class: 'instruction' }, 'Write a summary of the conversation you just had.'),
    placeholder: 'In my conversation with…',
  });
  if (ctx.aborted) return null;

  const p1 = part1.reduce((a, r) => a + r.score, 0);
  const p2 = part2.filter(r => r.ok).length;
  const n = part1.length + part2.length;
  const p = pct(p1 + p2, n);
  const fullTranscript = transcript.length ? transcript : item.conversation.map(t => t.who === 'them' ? `${who} : ${t.line}` : `Toi : ${t.options[0]}`);

  const view = h('div', {},
    h('div', { class: 'panel' }, h('h3', {}, `Listen and Complete — ${fmtNum(p1, 1)}/${part1.length}`),
      h('div', { class: 'items' }, part1.map(r => h('div', { class: 'item ' + (r.score >= .8 ? 'ok' : r.given ? 'bad' : 'empty') },
        h('div', { class: 'lbl' }, `${Math.round(r.score * 100)} %`), r.text.replace('___', '[ ' + r.answer + ' ]'),
        r.score >= .8 ? null : h('div', { class: 'small' }, 'Ta réponse : ' + (r.given || '—'))))),
      h('details', { class: 'fold' }, h('summary', {}, 'Texte du scénario'), h('p', {}, item.scenario))),
    h('div', { class: 'panel mt' }, h('h3', {}, `Listen and Respond — ${p2}/${part2.length}`),
      h('div', { class: 'items' }, part2.map(r => h('div', { class: 'item ' + (r.ok ? 'ok' : r.given ? 'bad' : 'empty') },
        h('div', { class: 'lbl' }, r.ok ? 'juste' : r.given ? 'faux' : 'non répondu'), r.answer,
        r.ok || !r.given ? null : h('div', { class: 'small' }, 'Ta réponse : ' + r.given))))),
    h('div', { class: 'panel mt' }, h('h3', {}, 'La conversation'), h('div', { class: 'convo' }, fullTranscript.map(l => h('div', { class: 'bubble ' + (l.startsWith('Toi') ? 'me' : 'them') }, l.replace(/^[^:]+ : /, ''))))),
    writingMetricsView(w, { title: 'Ton résumé (75 s)' }));

  return {
    durationMs: performance.now() - t0,
    score: { text: `${fmtNum(p1 + p2, 1)} / ${n} points (${fmtNum(p, 0)} %) · résumé : ${w.words} mots`, pct: p / 100 },
    primary: p,
    sections: [
      { title: 'Listen and Complete', body: part1.map(r => `- ${r.text} — attendu « ${r.answer} », donné ${r.given ? '« ' + r.given + ' »' : 'vide'} — ${Math.round(r.score * 100)} %`).join('\n') },
      { title: 'Listen and Respond', body: part2.map((r, i) => `- Réplique ${i + 1} : ${r.ok ? 'juste' : r.given ? `FAUX — donné « ${r.given} », attendu « ${r.answer} »` : `non répondu — attendu « ${r.answer} »`}`).join('\n') },
      { title: 'Summarize the Conversation (75 s)', body: writingReportLines(w) },
      { title: 'Conversation', body: fullTranscript.map(l => '- ' + l).join('\n') },
    ],
    view,
    claude: [{ exerciseName: 'Interactive Listening — Summarize the Conversation (75 s)', kind: 'writing', prompt: `Résumer la conversation (75 s, à la première personne).\nConversation :\n${fullTranscript.join('\n')}`, response: w.text, measures: writingClaudeMeasures(w) }],
    data: { summaryWords: w.words },
  };
}
