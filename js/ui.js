// Petits outils d'interface partagés.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Markdown léger : **gras**, *italique*, `code`, retours à la ligne.
export function mdInline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

let toastTimer = null;
export function toast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
export function fmtSec(ms) { return (ms / 1000).toFixed(1).replace('.', ',') + ' s'; }
export function fmtNum(n, d = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toFixed(d).replace('.', ',');
}
export function fmtDate(iso, withTime = true) {
  const d = new Date(iso);
  const opts = withTime ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' };
  return d.toLocaleString('fr-FR', opts);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', top: '-1000px' } }, text);
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    return ok;
  }
}

export function downloadText(filename, text, type = 'text/markdown') {
  const blob = new Blob([text], { type: type + ';charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox') || t.isContentEditable || t.tagName === 'SELECT');
}

// Comptage de mots (anglais) : les contractions comptent pour un mot.
export function countWords(text) {
  const m = String(text || '').trim().match(/[A-Za-zÀ-ÿ0-9]+(?:['’][A-Za-z]+)*/g);
  return m ? m.length : 0;
}

// Icônes (SVG en ligne, trait).
export const ICONS = {
  select: '<path d="M4 6h16M4 12h10M4 18h6"/><path d="M17 15l2 2 4-4"/>',
  blanks: '<path d="M4 17h4M10 17h4M16 17h4"/><path d="M6 13l3-8 3 8M7 10h4"/>',
  complete: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h5M7 13h3M14 13h3M7 17h10"/>',
  ireading: '<path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M8 7h6M8 11h6M8 15h4"/>',
  ltype: '<path d="M3 10v4M7 7v10M11 4v16M15 8v8"/><path d="M19 12h3"/>',
  ilisten: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>',
  dictee: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  wphoto: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 16l-5-5-8 8"/>',
  iwriting: '<path d="M4 4h16v12H8l-4 4z"/><path d="M8 8h8M8 12h5"/>',
  wsample: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
  sphoto: '<path d="M3 7h3l2-3h8l2 3h3v12H3z"/><circle cx="12" cy="13" r="4"/>',
  rspeak: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/>',
  ispeak: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9 11h.01M12 11h.01M15 11h.01"/>',
  ssample: '<path d="M2 10v4M6 6v12M10 3v18M14 8v8M18 5v14M22 10v4"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  dl: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  spark: '<path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  exam: '<path d="M9 4h6M10 2h4v4h-4z"/><rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 12l2 2 4-4"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
};
export function icon(name) { return `<svg viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`; }
