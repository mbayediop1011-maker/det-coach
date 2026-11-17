// Chronomètre visuel : anneau (ou barre), gros chiffres, change de couleur à la fin.
import { h, fmtClock } from './ui.js';

export class Timer {
  constructor({ seconds, label = '', style = 'ring', big = false, onEnd = null, onTick = null }) {
    this.total = seconds;
    this.onEnd = onEnd;
    this.onTick = onTick;
    this.style = style;
    this.running = false;
    this.elapsedBefore = 0;
    this.startAt = 0;
    this.ended = false;
    // Seuil de changement de couleur : 30 dernières secondes ; pour les chronos courts, le dernier quart.
    this.hotAt = seconds > 60 ? 30 : Math.max(1, seconds * 0.25);
    if (style === 'bar') {
      this.fill = h('div', { class: 'fill' });
      this.el = h('div', { class: 'timer bar' }, h('div', { class: 'track' }, this.fill));
    } else {
      this.ring = h('div', { class: 'ring' }, this.digits = h('div', { class: 'digits' }, fmtClock(seconds)));
      this.el = h('div', { class: 'timer' + (big ? ' big' : '') }, this.ring, label ? h('div', { class: 'tlabel' }, label) : null);
    }
    this._render(seconds);
  }
  get elapsed() { return this.elapsedBefore + (this.running ? (performance.now() - this.startAt) / 1000 : 0); }
  get remaining() { return Math.max(0, this.total - this.elapsed); }
  start() {
    if (this.running || this.ended) return this;
    this.running = true;
    this.startAt = performance.now();
    const loop = () => {
      if (!this.running) return;
      const rem = this.remaining;
      this._render(rem);
      if (this.onTick) this.onTick(rem);
      if (rem <= 0) { this._end(); return; }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    // Filet de sécurité si l'onglet est en arrière-plan (requestAnimationFrame suspendu).
    this.iv = setInterval(() => { if (this.running && this.remaining <= 0) this._end(); }, 250);
    return this;
  }
  pause() {
    if (!this.running) return;
    this.elapsedBefore = this.elapsed;
    this.running = false;
    cancelAnimationFrame(this.raf);
    clearInterval(this.iv);
  }
  stop() { this.pause(); this.ended = true; clearInterval(this.iv); }
  _end() {
    if (this.ended) return;
    this.elapsedBefore = this.total;
    this.running = false;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    clearInterval(this.iv);
    this._render(0);
    if (this.onEnd) this.onEnd();
  }
  _render(rem) {
    const p = this.total ? rem / this.total : 0;
    const hot = rem <= this.hotAt;
    const critical = rem <= Math.min(10, this.hotAt / 2) && this.total > 8;
    this.el.classList.toggle('hot', hot && !critical);
    this.el.classList.toggle('critical', critical || (this.total <= 8 && rem <= this.total * 0.4));
    if (this.style === 'bar') this.fill.style.transform = `scaleX(${p})`;
    else {
      this.ring.style.setProperty('--p', p.toFixed(4));
      const txt = fmtClock(rem);
      if (this.digits.textContent !== txt) this.digits.textContent = txt;
    }
  }
}
