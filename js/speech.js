// Synthèse vocale (anglais américain) et reconnaissance vocale du navigateur.
import { getPref, setPref } from './db.js';
import { chooseVoices } from './voicepick.js';

const synth = window.speechSynthesis;
let voicesCache = [];

export function ttsSupported() { return !!synth && typeof SpeechSynthesisUtterance !== 'undefined'; }

function loadVoices() {
  if (!synth) return [];
  voicesCache = synth.getVoices() || [];
  return voicesCache;
}
if (synth) {
  loadVoices();
  if ('onvoiceschanged' in synth) synth.onvoiceschanged = loadVoices;
}

export async function voicesReady(timeout = 2500) {
  if (!synth) return [];
  if (loadVoices().length) return voicesCache;
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    await new Promise(r => setTimeout(r, 120));
    if (loadVoices().length) break;
  }
  return voicesCache;
}

// Voix A (principale) et voix B (second interlocuteur) : voir voicepick.js.
export function pickVoices() {
  return chooseVoices(voicesCache.length ? voicesCache : loadVoices());
}

export async function getRate() { return (await getPref('ttsRate', 1)) || 1; }
export async function setRate(r) { return setPref('ttsRate', r); }

// Découpe en phrases pour éviter la coupure de Chrome sur les textes longs.
function splitSentences(text) {
  const parts = String(text).match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [text];
  return parts.map(s => s.trim()).filter(Boolean);
}

let speakingToken = 0;

// iPhone : la synthèse vocale doit être « débloquée » une première fois par un geste de l'utilisateur.
let unlocked = false;
export function unlockSpeech() {
  if (unlocked || !ttsSupported()) return;
  unlocked = true;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch {}
}
export function cancelSpeech() {
  speakingToken++;
  try { synth && synth.cancel(); } catch {}
}

// Lit le texte sans jamais l'afficher. Résout à la fin de la lecture.
export async function speak(text, { voice = 'a', rate = null, pitch = null } = {}) {
  if (!ttsSupported()) throw new Error('tts-unsupported');
  await voicesReady();
  cancelSpeech();
  const token = ++speakingToken;
  const vs = pickVoices();
  const v = voice === 'b' ? vs.b : vs.a;
  const r = rate ?? await getRate();
  const p = pitch ?? 1; // jamais de hauteur modifiée : ça déforme la voix et nuit à la compréhension
  for (const sentence of splitSentences(text)) {
    if (token !== speakingToken) return;
    await new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(sentence);
      if (v) u.voice = v;
      u.lang = (v && v.lang) || 'en-US';
      u.rate = r;
      u.pitch = p;
      let done = false;
      const finish = () => { if (!done) { done = true; clearTimeout(guard); resolve(); } };
      u.onend = finish;
      u.onerror = finish;
      // Garde-fou si onend ne se déclenche jamais (bug connu de certains navigateurs).
      const guard = setTimeout(finish, 2000 + sentence.length * 160 / r);
      synth.speak(u);
      try { synth.resume(); } catch {}
    });
  }
}

// ---------- Reconnaissance vocale ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export function srSupported() { return !!SR; }

export class Transcriber {
  constructor() {
    this.supported = !!SR;
    this.segments = []; // {text, startMs, endMs}
    this.interim = '';
    this.errors = [];
    this.active = false;
    this.onupdate = null;
  }
  start() {
    if (!this.supported) return;
    this.t0 = performance.now();
    this.active = true;
    this._spawn();
  }
  _spawn() {
    const rec = new SR();
    this.rec = rec;
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    const firstSeen = {};
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const key = i + ':' + (this.restarts || 0);
        const now = performance.now() - this.t0;
        if (firstSeen[key] == null) firstSeen[key] = now;
        if (res.isFinal) {
          const text = res[0].transcript.trim();
          if (text) this.segments.push({ text, startMs: Math.round(firstSeen[key]), endMs: Math.round(now) });
        } else interim += res[0].transcript;
      }
      this.interim = interim.trim();
      if (this.onupdate) this.onupdate(this.text());
    };
    rec.onerror = e => { this.errors.push(e.error); };
    rec.onend = () => {
      // Le moteur s'arrête parfois tout seul (silence, iPhone) : on relance tant que la prise continue.
      if (this.active && !['not-allowed', 'service-not-allowed', 'audio-capture'].includes(this.errors[this.errors.length - 1])) {
        this.restarts = (this.restarts || 0) + 1;
        if (this.restarts < 60) setTimeout(() => { if (this.active) { try { this._spawn(); } catch {} } }, 150);
      } else if (this._resolveStop) this._resolveStop();
    };
    try { rec.start(); } catch (err) { this.errors.push(String(err && err.message || err)); }
  }
  text() { return [...this.segments.map(s => s.text), this.interim].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); }
  async stop() {
    if (!this.supported) return this.result();
    this.active = false;
    await new Promise(res => {
      this._resolveStop = res;
      try { this.rec.stop(); } catch { res(); }
      setTimeout(res, 1800); // on n'attend pas indéfiniment le dernier résultat
    });
    if (this.interim) { this.segments.push({ text: this.interim, startMs: null, endMs: null, interim: true }); this.interim = ''; }
    return this.result();
  }
  result() {
    return { supported: this.supported, text: this.text(), segments: this.segments, errors: [...new Set(this.errors)] };
  }
}
