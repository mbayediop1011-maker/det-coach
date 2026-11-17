// Examen blanc : enchaîne les épreuves sans écran de consignes, comme le jour du test.
import { h, icon, fmtNum, copyText, toast, downloadText, fmtDate } from './ui.js';
import { byId, SKILLS } from './registry.js';
import { fmtDuration } from './report.js';

// Ordre : partie adaptative (~45 min), puis les deux échantillons (~10 min), comme le guide officiel.
const PLANS = {
  full: {
    name: 'Examen blanc complet',
    steps: [
      ['read-and-select', 16], ['fill-in-the-blanks', 7], ['read-and-complete', 1], ['listen-and-type', 6],
      ['read-and-complete', 1], ['interactive-reading', 1], ['write-about-the-photo', 3], ['interactive-listening', 1],
      ['speak-about-the-photo', 1], ['read-then-speak', 1], ['interactive-writing', 1], ['interactive-speaking', 2],
      ['writing-sample', 1], ['speaking-sample', 1],
    ],
  },
  mini: {
    name: 'Mini examen',
    steps: [
      ['read-and-select', 8], ['fill-in-the-blanks', 3], ['read-and-complete', 1], ['listen-and-type', 3],
      ['write-about-the-photo', 1], ['speak-about-the-photo', 1], ['interactive-speaking', 1],
    ],
  },
};

export async function runExam(mode, { runOne, mount, go, setKeys }) {
  const plan = PLANS[mode] || PLANS.full;
  let aborted = false;
  const intro = h('section', { class: 'brief sk-speak' },
    h('h1', {}, plan.name),
    h('p', { class: 'muted' }, 'Les épreuves s’enchaînent sans écran de consignes, avec les vrais chronos. Tu peux quitter à tout moment (deux appuis sur Quitter) ; les épreuves déjà terminées restent enregistrées.'),
    h('div', { class: 'items' }, plan.steps.map(([id, n], i) => {
      const ex = byId(id);
      return h('div', { class: 'item ' + SKILLS[ex.skill].cls, style: { borderLeft: '4px solid var(--c1)' } }, h('b', {}, `${i + 1}. ${ex.name}`), h('span', { class: 'muted' }, ` — ${id === 'interactive-speaking' ? n * 3 + ' à ' + n * 4 + ' questions' : n > 1 ? n + ' items' : ex.time}`));
    })),
    h('div', { class: 'brief-actions' },
      h('button', { class: 'btn go big', id: 'exam-start', html: `${icon('play')}<span>Commencer l’examen</span> <kbd>Entrée</kbd>` }),
      h('button', { class: 'btn ghost', 'data-nav': 'home' }, 'Retour')));
  mount(intro);
  await new Promise(r => {
    intro.querySelector('#exam-start').addEventListener('click', r);
    setKeys({ Enter: r, Escape: () => go('home'), forceEnter: true });
  });

  const done = [];
  const t0 = Date.now();
  for (let i = 0; i < plan.steps.length; i++) {
    if (aborted) return;
    const [id, n] = plan.steps[i];
    const ex = byId(id);
    // Courte transition.
    const tr = h('section', { class: 'center ' + SKILLS[ex.skill].cls, style: { paddingTop: '18vh' } },
      h('div', { class: 'muted', style: { fontWeight: 800 } }, `Épreuve ${i + 1} sur ${plan.steps.length}`),
      h('h1', {}, ex.name),
      h('p', { class: 'muted' }, ex.time));
    mount(tr, { exercise: true });
    await new Promise(r => setTimeout(r, 1600));
    if (aborted) return;
    try {
      const s = await runOne(ex, { exam: true, count: n, onQuit: () => { aborted = true; go('home'); } });
      if (!s) return;
      done.push(s);
    } catch (err) {
      console.error(err);
      toast('Épreuve ignorée : ' + (err.message || err), 3000);
    }
  }

  const report = `# ${plan.name} — ${fmtDate(new Date(t0).toISOString())}\n\n- Durée totale : ${fmtDuration(Date.now() - t0)}\n${done.map(s => `- ${byId(s.type).name} : ${s.score ? s.score.text : '—'}`).join('\n')}\n\n---\n\n` + done.map(s => s.report).join('\n---\n\n');
  const view = h('section', { class: 'ex' },
    h('h1', {}, '🎉 ' + plan.name + ' terminé'),
    h('p', { class: 'muted' }, `Durée totale : ${fmtDuration(Date.now() - t0)}. Chaque épreuve est enregistrée dans l’historique.`),
    h('div', { class: 'items' }, done.map(s => {
      const ex = byId(s.type);
      return h('button', { class: 'sess ' + SKILLS[ex.skill].cls, onclick: () => go('result/' + s.id) },
        h('span', { class: 't' }, ex.name), h('span', { class: 'muted small' }, s.score ? s.score.text : ''),
        h('span', { class: 's' }, s.primary == null ? '—' : fmtNum(s.primary, s.primary % 1 ? 1 : 0) + ex.unit));
    })),
    h('div', { class: 'row mt' },
      h('button', { class: 'btn primary', onclick: async () => toast(await copyText(report) ? 'Rapport complet copié' : 'Copie impossible'), html: `${icon('copy')}<span>Copier le rapport complet</span>` }),
      h('button', { class: 'btn', onclick: () => downloadText(`examen-blanc-${new Date(t0).toISOString().slice(0, 10)}.md`, report), html: `${icon('dl')}<span>Télécharger</span>` }),
      h('button', { class: 'btn ghost', 'data-nav': 'home' }, 'Accueil')));
  mount(view);
  setKeys({ Escape: () => go('home') });
}
