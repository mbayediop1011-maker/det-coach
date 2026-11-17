// Rapport de séance en Markdown : chiffres bruts, aucun commentaire généré.
import { fmtDate, fmtNum } from './ui.js';

export function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60), r = s % 60;
  return m ? `${m} min ${String(r).padStart(2, '0')} s` : `${r} s`;
}

export function objectiveLine(ex, objective, primary) {
  if (!objective) return `- Objectif : pas encore fixé (métrique : ${ex.metric})`;
  const gap = primary == null ? null : primary - Number(objective.objectif);
  const sign = gap == null ? '' : gap >= 0 ? '+' : '−';
  return `- Objectif : ${fmtNum(objective.objectif, 0)} (${objective.metrique || ex.metric}) · Résultat : ${fmtNum(primary, primary % 1 ? 1 : 0)} · Écart : ${gap == null ? '—' : sign + fmtNum(Math.abs(gap), Math.abs(gap) % 1 ? 1 : 0)}`;
}

// session = { type, date, durationMs, score:{text}, primary, reminders:[], sections:[{title, body}] }
export function buildReport(ex, session, objective) {
  const L = [];
  L.push(`## ${ex.name}${session.exam ? ' (examen blanc)' : ''} — ${fmtDate(session.date)}`);
  L.push('');
  L.push(`- Date : ${fmtDate(session.date)}`);
  L.push(`- Exercice : ${ex.name}`);
  if (session.itemIds && session.itemIds.length) L.push(`- Items : ${session.itemIds.join(', ')}`);
  L.push(`- Durée réelle : ${fmtDuration(session.durationMs)}`);
  L.push(`- Score : ${session.score ? session.score.text : '—'}`);
  L.push(`- Mesure principale (${(objective && objective.metrique) || ex.metric}) : ${fmtNum(session.primary, session.primary % 1 ? 1 : 0)}`);
  L.push(objectiveLine(ex, objective, session.primary));
  for (const r of session.reminders || []) L.push(`- Règle non appliquée : ${r}`);
  for (const s of session.sections || []) {
    if (!s.body || !String(s.body).trim()) continue;
    L.push('');
    L.push(`### ${s.title}`);
    L.push('');
    L.push(s.body);
  }
  return L.join('\n').trim() + '\n';
}

export function combineReports(sessions, since) {
  const head = `# Travail réalisé depuis le ${fmtDate(since, false)}\n\n${sessions.length} séance(s).\n`;
  return head + '\n' + sessions.map(s => s.report).join('\n---\n\n');
}
