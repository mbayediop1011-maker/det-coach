// Bouton « Corriger avec Claude » : copie une demande de correction prête à coller dans Claude.
// L'application elle-même ne note jamais le contenu (cahier des charges, §11).
import { copyText, toast, h, icon } from './ui.js';

const CRITERIA_WRITING = `Critères officiels du Duolingo English Test pour l'écrit (Scoring Guide for Teachers 2026, §5) :
- Content : pertinence, développement, exemples, reste dans le sujet.
- Discourse coherence : clarté, organisation, connecteurs et pronoms, progression des idées.
- Grammar : variété et exactitude des structures, ponctuation.
- Lexis : étendue et précision du vocabulaire, collocations, orthographe, répétitions.
Bandes de score : 155–160, 130–150, 100–125, 60–95, 30–55, 10–25.`;

const CRITERIA_SPEAKING = `Critères officiels du Duolingo English Test pour l'oral (Scoring Guide for Teachers 2026, §5) :
- Content : pertinence, développement, exemples, reste dans le sujet.
- Discourse coherence : facile à suivre, organisation, connecteurs.
- Fluency : débit régulier, pauses à des endroits naturels, peu d'hésitations ou de reprises.
- Grammar : variété et exactitude des structures.
- Lexis : étendue et précision du vocabulaire, collocations, répétitions.
- Pronunciation : intelligibilité, sons, accent de mot et de phrase, intonation.
Bandes de score : 155–160, 130–150, 100–125, 60–95, 30–55, 10–25.`;

export function buildPrompt({ exerciseName, kind, prompt, response, measures }) {
  const speaking = kind === 'speaking';
  return `Tu es examinateur du Duolingo English Test. Je prépare le DET (objectif immédiat : 110+, puis B2 = 100–125, à terme C1-C2). Corrige ma réponse en français.

Exercice : ${exerciseName}
${speaking ? CRITERIA_SPEAKING : CRITERIA_WRITING}

Sujet / consigne :
"""
${prompt}
"""

${speaking ? 'Ma réponse orale (transcription automatique du navigateur — elle peut contenir des erreurs de reconnaissance, signale les mots probablement mal prononcés plutôt que de les compter comme fautes de grammaire) :' : 'Ma réponse écrite :'}
"""
${response || '(vide)'}
"""

Mesures de l'application :
${measures}

Ce que j'attends, dans cet ordre :
1. Une estimation de bande de score DET pour chaque critère, puis globale, avec une phrase de justification par critère.
2. La liste de mes erreurs (grammaire, vocabulaire, orthographe${speaking ? ', mots probablement mal prononcés' : ''}), chacune avec la correction et une explication courte.
3. Les répétitions et les mots trop simples, avec 2 ou 3 alternatives plus précises.
4. Une version améliorée de ma réponse, au niveau visé (B2+), de longueur réaliste pour le temps imparti.
5. Les deux points à travailler en priorité.`;
}

export function claudeButton(data) {
  const text = buildPrompt(data);
  const btn = h('button', { class: 'btn primary', type: 'button', html: `${icon('spark')}<span>1. Copier la demande de correction</span>` });
  const open = h('a', { class: 'btn', href: 'https://claude.ai/new', target: '_blank', rel: 'noopener', html: `<span>2. Ouvrir Claude et coller</span>` });
  btn.addEventListener('click', async () => {
    const ok = await copyText(text);
    toast(ok ? 'Copié ! Ouvre Claude et colle la demande.' : 'Copie impossible : ouvre « Voir la demande » et copie à la main.', 3500);
    if (ok) btn.querySelector('span').textContent = '✓ Demande copiée';
  });
  const show = h('details', { class: 'fold' }, h('summary', {}, 'Voir la demande de correction'), h('pre', { class: 'md' }, text));
  return h('div', { class: 'panel mt' },
    h('h3', {}, '✨ Correction par l’IA'),
    h('p', { class: 'muted small' }, 'Claude corrige ta réponse selon les critères officiels du DET : bande de score estimée, fautes corrigées, version améliorée.'),
    h('div', { class: 'row' }, btn, open), show);
}
