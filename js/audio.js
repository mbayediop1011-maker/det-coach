// Capture micro : enregistrement brut (opus 128 kbps quand possible), écriture par morceaux
// d'une seconde dans IndexedDB, niveau RMS toutes les 50 ms pour la détection des silences.
import { createRecording, putChunk, finishRecording, getPref } from './db.js';
import { h } from './ui.js';

let micStream = null;
let audioCtx = null;

export const DEFAULT_THRESHOLD = 0.012;
export const FRAME_MS = 50;

export function micSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

export async function getMic() {
  if (micStream && micStream.getAudioTracks().some(t => t.readyState === 'live')) return micStream;
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false, // essentiel : le gain auto fausse la détection des pauses
    },
    video: false,
  });
  return micStream;
}

export function releaseMic() {
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  micStream = null;
}

export function getAudioCtx() {
  if (!audioCtx || audioCtx.state === 'closed') {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

export function pickMime() {
  const cands = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac'];
  for (const c of cands) {
    try { if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c; } catch {}
  }
  return '';
}

export async function getThreshold() {
  return (await getPref('silenceThreshold', null)) || DEFAULT_THRESHOLD;
}

export class Recorder {
  constructor({ kind = 'oral', label = '', exercise = '' } = {}) {
    this.kind = kind;
    this.exercise = exercise;
    this.label = label;
    this.recId = 'rec-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    this.rms = [];
    this.level = 0;
    this.peak = 0;
    this.clipCount = 0;
    this.pending = [];
    this.seq = 0;
  }
  async start() {
    const stream = await getMic();
    const ctx = getAudioCtx();
    this.source = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.source.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);

    const mime = pickMime();
    const opts = { audioBitsPerSecond: 128000 };
    if (mime) opts.mimeType = mime;
    try { this.mr = new MediaRecorder(stream, opts); }
    catch { this.mr = new MediaRecorder(stream); }
    this.mime = this.mr.mimeType || mime || 'audio/webm';
    await createRecording({ id: this.recId, mime: this.mime, kind: this.kind, label: this.label, exercise: this.exercise });

    this.mr.ondataavailable = e => {
      if (e.data && e.data.size) this.pending.push(putChunk(this.recId, this.seq++, e.data));
    };
    this.stopped = new Promise(res => { this.mr.onstop = res; });
    this.mr.start(1000); // un morceau par seconde, écrit tout de suite
    this.t0 = performance.now();
    this.iv = setInterval(() => this._sample(), FRAME_MS);
    return this;
  }
  _sample() {
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0, pk = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = this.buf[i];
      sum += v * v;
      const a = v < 0 ? -v : v;
      if (a > pk) pk = a;
    }
    const rms = Math.sqrt(sum / this.buf.length);
    this.level = rms;
    this.peak = pk;
    if (pk > 0.985) this.clipCount++;
    this.rms.push(+rms.toFixed(5));
  }
  get elapsedMs() { return this.t0 ? performance.now() - this.t0 : 0; }
  async stop() {
    if (!this.mr || this.mr.state === 'inactive') return this.result;
    clearInterval(this.iv);
    this.durationMs = performance.now() - this.t0;
    try { this.mr.requestData(); } catch {}
    this.mr.stop();
    await this.stopped;
    await Promise.all(this.pending);
    try { this.source.disconnect(); } catch {}
    await finishRecording(this.recId, { durationMs: Math.round(this.durationMs) });
    this.result = { recId: this.recId, durationMs: this.durationMs, rms: this.rms, mime: this.mime, clipCount: this.clipCount };
    return this.result;
  }
}

// Analyse des silences sur le signal brut.
// Une trame est « parole » si son RMS dépasse le seuil calibré. Les micro-coupures < 200 ms sont ignorées.
export function analyzeSpeech(rms, threshold, totalMs) {
  const n = rms.length;
  const voiced = rms.map(v => v >= threshold);
  // Lissage : combler les trous très courts (< 200 ms) entre deux trames de parole.
  const bridge = Math.round(200 / FRAME_MS);
  let lastVoiced = -1;
  for (let i = 0; i < n; i++) {
    if (voiced[i]) {
      if (lastVoiced >= 0 && i - lastVoiced - 1 > 0 && i - lastVoiced - 1 <= bridge) for (let j = lastVoiced + 1; j < i; j++) voiced[j] = true;
      lastVoiced = i;
    }
  }
  const first = voiced.indexOf(true);
  const last = voiced.lastIndexOf(true);
  const dur = totalMs || n * FRAME_MS;
  if (first === -1) {
    return { totalMs: dur, speechMs: 0, leadMs: dur, trailMs: 0, silences: [], silenceMs: 0, voicedFrames: 0, spokeAtAll: false };
  }
  const silences = [];
  let i = first;
  while (i <= last) {
    if (!voiced[i]) {
      let j = i;
      while (j <= last && !voiced[j]) j++;
      const len = (j - i) * FRAME_MS;
      if (len >= 1000) silences.push({ startMs: i * FRAME_MS, endMs: j * FRAME_MS, ms: len });
      i = j;
    } else i++;
  }
  const leadMs = first * FRAME_MS;
  const trailMs = Math.max(0, dur - (last + 1) * FRAME_MS);
  const silenceMs = silences.reduce((a, s) => a + s.ms, 0);
  const speechMs = Math.max(0, dur - leadMs - trailMs - silenceMs);
  return { totalMs: dur, speechMs, leadMs, trailMs, silences, silenceMs, voicedFrames: voiced.filter(Boolean).length, spokeAtAll: true };
}

// Vumètre vivant + alertes niveau trop bas / saturé.
export function vuMeter(rec, threshold) {
  const lvl = h('div', { class: 'lvl' });
  const thr = h('div', { class: 'thr' });
  const bars = Array.from({ length: 24 }, () => h('i'));
  const msg = h('div', { class: 'vu-msg' });
  const el = h('div', {}, h('div', { class: 'wave' }, bars), h('div', { class: 'vu' }, lvl, thr), msg);
  const scale = v => Math.min(1, Math.sqrt(v / 0.25)); // échelle perceptive
  thr.style.left = (scale(threshold) * 100) + '%';
  let k = 0;
  const iv = setInterval(() => {
    if (!rec.analyser) return;
    const v = rec.level;
    lvl.style.width = (scale(v) * 100) + '%';
    bars[k % bars.length].style.height = Math.max(6, Math.min(70, scale(v) * 80)) + 'px';
    k++;
    const t = rec.elapsedMs;
    const recent = rec.rms.slice(-80); // 4 dernières secondes
    const maxRecent = Math.max(0, ...recent);
    if (rec.clipCount > 6 && rec.peak > 0.98) { msg.textContent = '⚠️ Son saturé : éloigne un peu le micro ou parle moins fort.'; msg.style.color = 'var(--bad)'; }
    else if (t > 5000 && maxRecent < threshold * 1.3) { msg.textContent = '⚠️ Niveau très bas : parle plus fort ou rapproche-toi du micro.'; msg.style.color = 'var(--warn)'; }
    else { msg.textContent = v >= threshold ? '● Parole détectée' : '○ Silence'; msg.style.color = v >= threshold ? 'var(--ok)' : 'var(--faint)'; }
  }, 60);
  el.stop = () => clearInterval(iv);
  return el;
}

// Petite frise : parole / silences / temps non utilisé.
export function timelineBar(analysis, allowedMs) {
  const total = Math.max(allowedMs || 0, analysis.totalMs);
  const segs = [];
  const pct = ms => (ms / total * 100).toFixed(2) + '%';
  let cursor = 0;
  const push = (cls, ms) => { if (ms > 0) segs.push(h('i', { class: cls, style: { width: pct(ms) } })); };
  push('si', analysis.leadMs); cursor = analysis.leadMs;
  for (const s of analysis.silences) { push('sp', s.startMs - cursor); push('si', s.ms); cursor = s.endMs; }
  push('sp', analysis.totalMs - analysis.trailMs - cursor);
  push('si', analysis.trailMs);
  push('un', total - analysis.totalMs);
  return h('div', { class: 'timeline', title: 'Dégradé : parole — jaune : silence — vide : temps non utilisé' }, segs);
}
