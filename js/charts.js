// Courbes simples en SVG (aucune bibliothèque) avec ligne d'objectif.
import { fmtNum } from './ui.js';

export function lineChart({ series, objective = null, unit = '', height = 220, yMin = null, yMax = null }) {
  const W = 640, H = height, padL = 44, padR = 16, padT = 16, padB = 34;
  const pts = series.flatMap(s => s.points);
  if (!pts.length) return `<p class="muted">Pas encore de données.</p>`;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y).concat(objective != null ? [objective] : []);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = yMin ?? Math.min(0, ...ys), y1 = yMax ?? Math.max(...ys) * 1.12;
  if (y1 === y0) y1 = y0 + 1;
  const X = x => padL + (x1 === x0 ? (W - padL - padR) / 2 : (x - x0) / (x1 - x0) * (W - padL - padR));
  const Y = y => padT + (1 - (y - y0) / (y1 - y0)) * (H - padT - padB);
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
  // Grille
  for (let k = 0; k <= 4; k++) {
    const v = y0 + (y1 - y0) * k / 4;
    svg += `<line x1="${padL}" x2="${W - padR}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,.08)"/>`;
    svg += `<text x="${padL - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="12" fill="#8b84c4">${fmtNum(v, v % 1 && y1 - y0 < 10 ? 1 : 0)}</text>`;
  }
  // Dates (première, dernière)
  const fmtD = t => new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  svg += `<text x="${padL}" y="${H - 10}" font-size="12" fill="#8b84c4">${fmtD(x0)}</text>`;
  if (x1 !== x0) svg += `<text x="${W - padR}" y="${H - 10}" text-anchor="end" font-size="12" fill="#8b84c4">${fmtD(x1)}</text>`;
  // Objectif
  if (objective != null) {
    svg += `<line x1="${padL}" x2="${W - padR}" y1="${Y(objective)}" y2="${Y(objective)}" stroke="#fbbf24" stroke-width="2" stroke-dasharray="7 6"/>`;
    svg += `<text x="${W - padR}" y="${Y(objective) - 6}" text-anchor="end" font-size="12" font-weight="700" fill="#fbbf24">objectif ${fmtNum(objective, objective % 1 ? 1 : 0)}${unit}</text>`;
  }
  for (const s of series) {
    const p = s.points;
    if (!p.length) continue;
    const d = p.map((q, i) => `${i ? 'L' : 'M'}${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' ');
    svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
    for (const q of p) svg += `<circle cx="${X(q.x).toFixed(1)}" cy="${Y(q.y).toFixed(1)}" r="4.5" fill="${s.color}" stroke="#1b1740" stroke-width="2"><title>${fmtD(q.x)} : ${fmtNum(q.y, q.y % 1 ? 1 : 0)}${unit}</title></circle>`;
  }
  svg += `</svg>`;
  const legend = series.length > 1 ? `<div class="row small" style="gap:16px;margin-top:6px">${series.map(s => `<span><span style="display:inline-block;width:12px;height:12px;border-radius:4px;background:${s.color};vertical-align:-1px"></span> ${s.name}</span>`).join('')}</div>` : '';
  return svg + legend;
}

// Courbe de frappe : mots cumulés au fil des secondes.
export function typingCurve(samples, totalSec) {
  if (!samples || !samples.length) return '';
  const W = 600, H = 110, pad = 6;
  const maxW = Math.max(1, ...samples.map(s => s.w));
  const X = t => pad + t / totalSec * (W - 2 * pad);
  const Y = w => H - pad - w / maxW * (H - 2 * pad);
  const d = samples.map((s, i) => `${i ? 'L' : 'M'}${X(s.t).toFixed(1)},${Y(s.w).toFixed(1)}`).join(' ');
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d} L${X(samples[samples.length - 1].t)},${H - pad} L${pad},${H - pad}Z" fill="rgba(192,132,252,.18)"/><path d="${d}" fill="none" stroke="#c084fc" stroke-width="3"/></svg>`;
}
