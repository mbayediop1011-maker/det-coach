// Briques partagées par les exercices.
import { h, icon, esc, fmtNum, fmtSec, countWords, sleep } from '../ui.js';
import { Timer } from '../timer.js';
import { Recorder, analyzeSpeech, vuMeter, getThreshold, timelineBar, micSupported } from '../audio.js';
import { Transcriber, speak, cancelSpeech } from '../speech.js';
import { repetitions } from '../compare.js';
import { typingCurve } from '../charts.js';

// ---------- Notation [préfixe|mot] ----------
export function parseGapped(text) {
  const parts = [];
  const re = /\[([^\]|]*)\|([^\]]+)\]/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: 'text', v: text.slice(last, m.index) });
    parts.push({ t: 'gap', pre: m[1], word: m[2] });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ t: 'text', v: text.slice(last) });
  return parts;
}

// Mot à compléter : une case par lettre manquante, avancement et recul automatiques.
export function letterGaps(container, parts, { onAnyInput } = {}) {
  const gaps = [];
  const allBoxes = [];
  for (const p of parts) {
    if (p.t === 'text') { container.append(document.createTextNode(p.v)); continue; }
    const missing = p.word.slice(p.pre.length);
    const boxes = [];
    const g = h('span', { class: 'gap' }, h('span', { class: 'pre' }, p.pre));
    for (let i = 0; i < missing.length; i++) {
      const b = h('input', { class: 'lb', maxlength: '1', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', inputmode: 'text', 'aria-label': `lettre ${i + 1} de ${p.pre}…` });
      boxes.push(b); allBoxes.push(b); g.append(b);
    }
    gaps.push({ ...p, missing, boxes, el: g });
    container.append(g);
  }
  allBoxes.forEach((b, idx) => {
    b.addEventListener('input', () => {
      const v = b.value.replace(/\s/g, '');
      if (v.length > 1) b.value = v.slice(-1);
      if (b.value && allBoxes[idx + 1]) allBoxes[idx + 1].focus();
      if (onAnyInput) onAnyInput();
    });
    b.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !b.value && allBoxes[idx - 1]) { e.preventDefault(); allBoxes[idx - 1].value = ''; allBoxes[idx - 1].focus(); }
      else if (e.key === 'ArrowLeft' && allBoxes[idx - 1]) { e.preventDefault(); allBoxes[idx - 1].focus(); }
      else if (e.key === 'ArrowRight' && allBoxes[idx + 1]) { e.preventDefault(); allBoxes[idx + 1].focus(); }
      else if (e.key === ' ') { e.preventDefault(); const next = gaps.find(g => g.boxes[0] && allBoxes.indexOf(g.boxes[0]) > idx); if (next) next.boxes[0].focus(); }
    });
    b.addEventListener('focus', () => { try { b.select(); } catch {} });
  });
  return {
    gaps, allBoxes,
    focusFirst() { if (allBoxes[0]) allBoxes[0].focus(); },
    grade() {
      return gaps.map(g => {
        const typed = g.boxes.map(b => b.value).join('');
        const filled = g.boxes.filter(b => b.value).length;
        const status = filled === 0 ? 'empty' : (g.pre + typed).toLowerCase() === g.word.toLowerCase() && filled === g.boxes.length ? 'ok' : 'bad';
        return { word: g.word, pre: g.pre, typed, given: g.pre + typed, status, filled, total: g.boxes.length };
      });
    },
    lock(results) {
      gaps.forEach((g, i) => {
        g.boxes.forEach(b => { b.disabled = true; });
        const r = results[i];
        g.el.classList.add(r.status);
        if (r.status !== 'ok') g.el.append(h('span', { class: 'fix' }, g.word));
      });
    },
  };
}

// ---------- Photo ----------
export function photoEl(item) {
  return h('div', { class: 'photo-wrap' },
    h('img', { class: 'photo', src: 'content/photos/' + item.file, alt: 'Photo à décrire' }),
    item.author ? h('div', { class: 'credit' }, `Photo : ${item.author} · ${item.license || ''} · Wikimedia Commons`) : null);
}

// ---------- Préparation (compte à rebours, peut être écourtée si « jusqu'à ») ----------
export async function prepPhase(ctx, area, seconds, { label = 'Préparation', canSkip = false, skipLabel = 'Commencer maintenant' } = {}) {
  return new Promise(resolve => {
    const t = new Timer({ seconds, label });
    const btn = canSkip ? h('button', { class: 'btn go', html: `<span>${skipLabel}</span> <kbd>Entrée</kbd>` }) : null;
    const box = h('div', { class: 'center' }, t.el, btn);
    area.replaceChildren(box);
    const done = () => { t.stop(); resolve(t.elapsed); };
    t.onEnd = done;
    if (btn) btn.addEventListener('click', done);
    ctx.onCleanup(() => t.stop());
    ctx.setKeys(canSkip ? { Enter: done } : {});
    t.start();
  });
}

// ---------- Prise de parole chronométrée ----------
// Renvoie les mesures orales du cahier des charges.
export async function recordPhase(ctx, area, seconds, { label = 'Parle maintenant', exerciseId, recLabel = '', requireClick = false, timerStartsAt = null } = {}) {
  const threshold = await getThreshold();
  if (!micSupported()) {
    area.replaceChildren(h('p', { class: 'reminder' }, 'Enregistrement impossible dans ce navigateur. Utilise Chrome (ordinateur) ou Safari (iPhone).'));
    await sleep(1500);
    return null;
  }
  // Interactive Speaking : le chrono démarre à la fin de la question, l'enregistrement au clic.
  const t = new Timer({ seconds, label, big: true });
  let rec = null, tr = null, vu = null, startedAt = null, stopping = null;
  const stopBtn = h('button', { class: 'btn danger', html: `${icon('stop')}<span>J’ai fini</span>` });
  const recBtn = h('button', { class: 'btn go big', html: `${icon('mic')}<span>Cliquer pour enregistrer</span> <kbd>Espace</kbd>` });
  const live = h('div', { class: 'center', style: { fontWeight: 800 } });
  const vuHolder = h('div', {});
  area.replaceChildren(h('div', {}, t.el, live, vuHolder, h('div', { class: 'row center mt' }, requireClick ? recBtn : null, stopBtn)));
  stopBtn.disabled = requireClick;
  requestAnimationFrame(() => area.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));

  const begin = async () => {
    if (rec) return;
    recBtn.disabled = true; recBtn.classList.add('hide');
    rec = new Recorder({ kind: 'oral', label: recLabel, exercise: exerciseId });
    try { await rec.start(); }
    catch (err) {
      live.replaceChildren(h('span', { class: 'reminder' }, 'Micro refusé ou indisponible. Autorise le micro pour ce site.'));
      rec = null; return;
    }
    startedAt = performance.now();
    tr = new Transcriber();
    tr.start();
    vu = vuMeter(rec, threshold);
    vuHolder.replaceChildren(vu);
    live.innerHTML = '<span class="rec-dot"></span>Enregistrement en cours';
    stopBtn.disabled = false;
    ctx.setKeys({ Enter: () => finish(), Space: () => finish() });
  };
  const finish = () => {
    if (stopping) return stopping;
    stopping = (async () => {
      t.stop();
      const usedSec = Math.min(seconds, t.elapsed);
      if (!rec) return { skipped: true, allowedSec: seconds, usedSec };
      stopBtn.disabled = true;
      live.textContent = 'Enregistrement sauvegardé…';
      const [r, txt] = await Promise.all([rec.stop(), tr.stop()]);
      if (vu) vu.stop();
      return measures(r, txt, threshold, seconds, usedSec, startedAt);
    })();
    return stopping;
  };
  ctx.onCleanup(() => { t.stop(); if (rec) rec.stop().catch(() => {}); if (tr) tr.stop(); if (vu) vu.stop(); });

  return new Promise(resolve => {
    t.onEnd = () => finish().then(resolve);
    stopBtn.addEventListener('click', () => finish().then(resolve));
    recBtn.addEventListener('click', begin);
    if (requireClick) ctx.setKeys({ Space: begin, Enter: begin });
    t.start();
    if (!requireClick) begin();
  });
}

// Boucles : une même suite de 3 mots (ou plus) qui revient au moins 3 fois dans la transcription.
export function repeatedSequences(text, size = 3, min = 3) {
  const w = String(text || '').toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
  const counts = new Map();
  for (let i = 0; i + size <= w.length; i++) {
    const k = w.slice(i, i + size).join(' ');
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const found = [...counts.entries()].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]);
  // On ne garde pas les sous-séquences d'une séquence déjà retenue.
  const out = [];
  for (const [seq, n] of found) if (!out.some(o => o.seq.includes(seq) || seq.includes(o.seq))) out.push({ seq, n });
  return out.slice(0, 5);
}

function measures(r, txt, threshold, allowedSec, usedSec, startedAt) {
  const a = analyzeSpeech(r.rms, threshold, r.durationMs);
  // Si le moteur a échoué (réseau, refus…) sans rien reconnaître, on ne compte pas « 0 mot » : c'est inconnu.
  const failed = txt.supported && !txt.text && txt.errors.some(e => !['no-speech', 'aborted'].includes(e));
  if (failed) txt = { ...txt, supported: false };
  const words = txt.supported ? countWords(txt.text) : null;
  const totalMin = r.durationMs / 60000;
  const speechMin = a.speechMs / 60000;
  return {
    recId: r.recId, mime: r.mime,
    durationMs: r.durationMs,
    allowedSec, usedSec,
    unusedSec: Math.max(0, allowedSec - usedSec),
    analysis: a,
    transcript: txt.text,
    srSupported: txt.supported,
    srErrors: txt.errors,
    segments: txt.segments,
    words,
    wpmTotal: words != null && totalMin > 0 ? words / totalMin : null,
    wpmSpeech: words != null && speechMin > 0 ? words / speechMin : null,
    silenceCount: a.silences.length,
    silenceSec: a.silenceMs / 1000,
    // Temps mort = délai avant le premier mot + silences de plus d'une seconde.
    deadSec: (a.leadMs + a.silenceMs) / 1000,
    loops: txt.supported ? repeatedSequences(txt.text) : [],
    clipCount: r.clipCount,
  };
}

// Transcription avec les silences insérés à leur place (approximation par horodatage).
export function transcriptWithSilences(m) {
  if (!m.srSupported) return `<span class="muted">Transcription indisponible${m.srErrors && m.srErrors.length ? ' (erreur : ' + esc(m.srErrors.join(', ')) + ')' : ' dans ce navigateur'}. L'audio est bien enregistré : réécoute-le.</span>`;
  if (!m.transcript) return '<span class="muted">Aucun mot reconnu.</span>';
  const sil = m.analysis.silences.slice();
  let html = '';
  for (const seg of m.segments) {
    while (sil.length && seg.startMs != null && sil[0].startMs < seg.startMs) {
      const s = sil.shift(); html += ` <span class="sil">[silence ${fmtNum(s.ms / 1000, 1)} s]</span> `;
    }
    html += esc(seg.text) + ' ';
  }
  for (const s of sil) html += ` <span class="sil">[silence ${fmtNum(s.ms / 1000, 1)} s]</span> `;
  return html.trim();
}

export function oralMetricsView(m, { title = '', intended = '' } = {}) {
  if (!m) return h('div', { class: 'panel' }, h('p', { class: 'muted' }, 'Pas d’enregistrement.'));
  if (m.skipped) return h('div', { class: 'panel' }, h('h3', {}, title), h('p', { class: 'muted' }, 'Pas de réponse enregistrée.'));
  const a = m.analysis;
  const mt = (v, k) => h('div', { class: 'metric' }, h('div', { class: 'v' }, v), h('div', { class: 'k' }, k));
  return h('div', { class: 'panel mt' },
    title ? h('h3', {}, title) : null,
    h('div', { 'data-rec': m.recId }, '🎧 audio'),
    h('div', { class: 'metrics' },
      mt(m.words == null ? '—' : m.words, 'mots (transcription)'),
      mt(fmtNum(a.speechMs / 1000, 1) + ' s', 'parole effective'),
      mt(m.wpmTotal == null ? '—' : fmtNum(m.wpmTotal), 'mots/min (durée totale)'),
      mt(m.wpmSpeech == null ? '—' : fmtNum(m.wpmSpeech), 'mots/min (parole effective)'),
      mt(a.silences.length, 'silences > 1 s'),
      mt(fmtNum(a.silenceMs / 1000, 1) + ' s', 'durée des silences'),
      mt(fmtNum(a.leadMs / 1000, 1) + ' s', 'délai avant de parler'),
      mt(fmtNum(m.deadSec, 1) + ' s', 'temps mort (délai + silences)'),
      mt(fmtNum(m.unusedSec, 0) + ' s', 'temps non utilisé')),
    h('div', { class: 'small muted' }, 'Frise de la prise (dégradé = parole, jaune = silence, vide = temps non utilisé)'),
    timelineBar(a, m.allowedSec * 1000),
    a.silences.length ? h('div', { class: 'small muted' }, 'Silences : ' + a.silences.map(s => `${fmtNum(s.ms / 1000, 1)} s à ${fmtNum(s.startMs / 1000, 0)} s`).join(' · ')) : null,
    h('h3', { class: 'mt' }, 'Ce que le navigateur a compris'),
    h('p', { class: 'small faint' }, 'Transcription automatique, imparfaite : un mot mal reconnu signale souvent une articulation à travailler. Ce n’est pas une vérité.'),
    h('div', { class: 'transcript', html: transcriptWithSilences(m) }),
    intended ? h('div', { class: 'mt' }, h('div', { class: 'small muted' }, 'Ce que tu voulais dire / le sujet :'), h('div', { class: 'cover-note' }, intended)) : null,
    m.srErrors && m.srErrors.length ? h('p', { class: 'small faint' }, 'Messages du moteur de reconnaissance : ' + m.srErrors.join(', ')) : null);
}

export function oralReportLines(m, label = '') {
  if (!m) return '';
  if (m.skipped) return `${label ? `**${label}**\n` : ''}- Pas de réponse enregistrée.`;
  const a = m.analysis;
  const L = [];
  if (label) L.push(`**${label}**`);
  L.push(`- Temps accordé : ${m.allowedSec} s · utilisé : ${fmtNum(m.usedSec, 1)} s · non utilisé : ${fmtNum(m.unusedSec, 1)} s`);
  L.push(`- Durée enregistrée : ${fmtNum(m.durationMs / 1000, 1)} s · parole effective (hors silences > 1 s, début et fin) : ${fmtNum(a.speechMs / 1000, 1)} s`);
  L.push(`- Délai avant la première parole : ${fmtNum(a.leadMs / 1000, 1)} s`);
  L.push(`- Temps mort (délai + silences de plus d'une seconde) : ${fmtNum(m.deadSec, 1)} s`);
  if (m.loops && m.loops.length) L.push(`- Séquences répétées (transcription) : ${m.loops.map(l => `« ${l.seq} » ×${l.n}`).join(', ')}`);
  L.push(`- Silences de plus d'une seconde : ${a.silences.length} (total ${fmtNum(a.silenceMs / 1000, 1)} s)${a.silences.length ? ' — ' + a.silences.map(s => `${fmtNum(s.ms / 1000, 1)} s à ${fmtNum(s.startMs / 1000, 1)} s`).join(', ') : ''}`);
  L.push(`- Mots (transcription navigateur) : ${m.words == null ? 'non disponible' : m.words}`);
  L.push(`- Mots par minute : ${m.wpmTotal == null ? '—' : fmtNum(m.wpmTotal)} (durée totale) · ${m.wpmSpeech == null ? '—' : fmtNum(m.wpmSpeech)} (parole effective)`);
  if (m.clipCount > 6) L.push(`- Saturation détectée (${m.clipCount} trames)`);
  L.push(`- Transcription : ${m.srSupported ? (m.transcript ? '« ' + m.transcript + ' »' : '(aucun mot reconnu)') : '(reconnaissance indisponible)'}`);
  return L.join('\n');
}

export function oralClaudeMeasures(m) {
  if (!m || m.skipped) return '- pas de réponse';
  const a = m.analysis;
  return `- durée accordée ${m.allowedSec} s, utilisée ${fmtNum(m.usedSec, 1)} s
- temps mort ${fmtNum(m.deadSec, 1)} s, parole effective ${fmtNum(a.speechMs / 1000, 1)} s, ${a.silences.length} silence(s) de plus d'une seconde (${fmtNum(a.silenceMs / 1000, 1)} s au total), délai avant de parler ${fmtNum(a.leadMs / 1000, 1)} s
- ${m.words ?? '?'} mots reconnus, ${m.wpmTotal == null ? '?' : fmtNum(m.wpmTotal)} mots/min (total), ${m.wpmSpeech == null ? '?' : fmtNum(m.wpmSpeech)} mots/min (parole effective)`;
}

// ---------- Rédaction chronométrée ----------
export async function writePhase(ctx, area, seconds, { label = 'Temps restant', tall = false, placeholder = 'Écris ta réponse en anglais…', above = null, canSubmitEarly = true } = {}) {
  const t = new Timer({ seconds, label });
  const ta = h('textarea', { class: 'answer' + (tall ? ' tall' : ''), placeholder, spellcheck: 'false', autocorrect: 'off', autocapitalize: 'sentences', lang: 'en' });
  const submit = h('button', { class: 'btn go', html: `<span>Valider</span> <kbd>Ctrl+Entrée</kbd>` });
  area.replaceChildren(h('div', {}, above, t.el, ta, canSubmitEarly ? h('div', { class: 'row end mt' }, submit) : null));
  const samples = [{ t: 0, w: 0 }];
  let lastKey = 0, firstKey = null, maxGap = 0, maxGapAt = null;
  const iv = setInterval(() => samples.push({ t: Math.round(t.elapsed * 10) / 10, w: countWords(ta.value) }), 2000);
  ta.addEventListener('input', () => {
    const now = t.elapsed;
    if (firstKey != null && now - lastKey > maxGap) { maxGap = now - lastKey; maxGapAt = lastKey; }
    lastKey = now; if (firstKey == null) firstKey = now;
  });
  ctx.onCleanup(() => { t.stop(); clearInterval(iv); });
  setTimeout(() => ta.focus(), 50);
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      t.stop(); clearInterval(iv);
      const used = Math.min(seconds, t.elapsed);
      samples.push({ t: Math.round(used * 10) / 10, w: countWords(ta.value) });
      ta.disabled = true;
      const text = ta.value;
      const words = countWords(text);
      resolve({
        text, words, allowedSec: seconds, usedSec: used, unusedSec: Math.max(0, seconds - used),
        wpm: used > 0 ? words / (used / 60) : 0,
        lastTypingSec: lastKey, firstTypingSec: firstKey,
        // Plus longue pause d'écriture, y compris l'arrêt avant la fin quand le chrono est allé au bout.
        ...(() => {
          let gap = maxGap, at = maxGapAt;
          if (firstKey != null && used >= seconds - 0.05 && used - lastKey > gap) { gap = used - lastKey; at = lastKey; }
          return { maxPauseSec: firstKey == null ? null : gap, maxPauseAtSec: at };
        })(),
        samples, repetitions: repetitions(text, 3),
      });
    };
    t.onEnd = finish;
    submit.addEventListener('click', finish);
    ctx.setKeys({ Enter: finish });
    t.start();
  });
}

export function writingMetricsView(w, { title = '' } = {}) {
  const mt = (v, k) => h('div', { class: 'metric' }, h('div', { class: 'v' }, v), h('div', { class: 'k' }, k));
  return h('div', { class: 'panel mt' },
    title ? h('h3', {}, title) : null,
    h('div', { class: 'metrics' },
      mt(w.words, 'mots'),
      mt(fmtNum(w.wpm), 'mots par minute'),
      mt(fmtNum(w.unusedSec, 0) + ' s', 'temps non utilisé'),
      mt(w.firstTypingSec == null ? '—' : fmtNum(w.firstTypingSec, 1) + ' s', 'avant le premier mot'),
      mt(w.lastTypingSec ? fmtNum(w.lastTypingSec, 0) + ' s' : '—', 'dernière frappe à'),
      mt(w.maxPauseSec == null ? '—' : fmtNum(w.maxPauseSec, 1) + ' s', 'plus longue pause d’écriture')),
    h('div', { class: 'small muted' }, 'Courbe de frappe (mots écrits au fil du temps)'),
    h('div', { html: typingCurve(w.samples, w.allowedSec) }),
    w.repetitions.length
      ? h('div', { class: 'reminder', style: { background: 'rgba(251,191,36,.12)', borderColor: 'rgba(251,191,36,.4)' } }, 'Mots pleins employés 3 fois ou plus : ' + w.repetitions.map(r => `${r.word} ×${r.n}`).join(', '))
      : h('p', { class: 'small muted' }, 'Aucun mot plein employé 3 fois ou plus.'),
    h('div', { class: 'transcript' }, w.text || '(vide)'));
}

export function writingReportLines(w, label = '') {
  const L = [];
  if (label) L.push(`**${label}**`);
  L.push(`- Temps accordé : ${w.allowedSec} s · utilisé : ${fmtNum(w.usedSec, 1)} s · non utilisé : ${fmtNum(w.unusedSec, 1)} s`);
  L.push(`- Mots : ${w.words} · mots par minute : ${fmtNum(w.wpm, 1)}`);
  L.push(`- Premier mot à ${w.firstTypingSec == null ? '—' : fmtNum(w.firstTypingSec, 1) + ' s'} · dernière frappe à ${fmtNum(w.lastTypingSec, 1)} s`);
  L.push(`- Plus longue pause d'écriture : ${w.maxPauseSec == null ? '—' : `${fmtNum(w.maxPauseSec, 1)} s (à partir de ${fmtNum(w.maxPauseAtSec, 0)} s)`}`);
  L.push(`- Courbe de frappe (s : mots) : ${w.samples.filter((s, i) => i % 3 === 0 || i === w.samples.length - 1).map(s => `${Math.round(s.t)}:${s.w}`).join(' ')}`);
  L.push(`- Répétitions (même mot plein employé 3 fois ou plus) : ${w.repetitions.length ? w.repetitions.map(r => `${r.word} ×${r.n}`).join(', ') : 'aucune'}`);
  L.push(`- Texte : « ${w.text.trim() || '(vide)'} »`);
  return L.join('\n');
}

export function writingClaudeMeasures(w) {
  return `- ${w.words} mots en ${fmtNum(w.usedSec, 0)} s sur ${w.allowedSec} s accordées (${fmtNum(w.wpm)} mots/min)
- mots pleins employés 3 fois ou plus : ${w.repetitions.length ? w.repetitions.map(r => `${r.word} ×${r.n}`).join(', ') : 'aucun'}`;
}

// ---------- Bouton d'écoute ----------
export function listenButton({ maxPlays = Infinity, onPlay, label = 'Écouter' }) {
  let used = 0, playing = false;
  const btn = h('button', { class: 'playbtn', 'aria-label': label, html: icon('play') });
  const dots = Number.isFinite(maxPlays) ? h('div', { class: 'plays' }, Array.from({ length: maxPlays }, () => h('i'))) : null;
  const caption = h('div', { class: 'small muted' }, Number.isFinite(maxPlays) ? `${maxPlays} écoute${maxPlays > 1 ? 's' : ''} possible${maxPlays > 1 ? 's' : ''}` : 'Écoutes illimitées');
  const el = h('div', { class: 'listen-zone' }, btn, dots, caption);
  const api = {
    el,
    get used() { return used; },
    async play() {
      if (playing || used >= maxPlays) return false;
      used++; playing = true;
      if (dots) dots.children[used - 1].classList.add('used');
      btn.classList.add('playing'); btn.disabled = true;
      caption.textContent = 'Lecture…';
      try { await onPlay(used); } catch (e) { caption.textContent = 'Lecture impossible sur cet appareil.'; }
      playing = false; btn.classList.remove('playing');
      btn.disabled = used >= maxPlays;
      if (Number.isFinite(maxPlays)) caption.textContent = used >= maxPlays ? 'Plus d’écoute disponible' : `Encore ${maxPlays - used} écoute${maxPlays - used > 1 ? 's' : ''}`;
      else caption.textContent = `Écoutée ${used} fois`;
      return true;
    },
    disable() { btn.disabled = true; },
  };
  btn.addEventListener('click', () => api.play());
  return api;
}

export function choiceList(options, { onPick } = {}) {
  const wrap = h('div', { class: 'options' });
  let selected = null;
  const btns = options.map((o, i) => {
    const b = h('button', { class: 'opt', type: 'button' }, h('span', { class: 'kbd', style: { marginRight: '10px' } }, String.fromCharCode(65 + i)), o);
    b.addEventListener('click', () => { if (wrap.dataset.locked) return; selected = i; btns.forEach(x => x.classList.toggle('sel', x === b)); if (onPick) onPick(i); });
    wrap.append(b);
    return b;
  });
  return {
    el: wrap, btns,
    get selected() { return selected; },
    select(i) { if (btns[i]) btns[i].click(); },
    reveal(correctIdx) { wrap.dataset.locked = '1'; btns.forEach((b, i) => { if (i === correctIdx) b.classList.add('ok'); else if (i === selected) b.classList.add('bad'); }); },
  };
}

export const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : 0);

export function itemsView(title, rows) {
  if (!rows.length) return null;
  return h('div', { class: 'panel mt' }, h('h3', {}, title), h('div', { class: 'items' }, rows));
}
export function itemRow(status, labelText, ...content) {
  return h('div', { class: 'item ' + status }, h('div', { class: 'lbl' }, labelText), ...content);
}

export { speak, cancelSpeech, sleep, Timer, h, icon, esc, fmtNum, fmtSec, countWords };
