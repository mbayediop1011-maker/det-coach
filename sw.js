// Service worker : l'application fonctionne hors ligne une fois chargée.
// Fichier généré par tools/build-sw.py — ne pas modifier à la main.
// Réseau d'abord pour le code et le contenu (les modifications du professeur arrivent tout de suite),
// cache en secours quand il n'y a pas de connexion.
const VERSION = 'det-coach-3d656cd03f';
const ASSETS = ['./', 'content/consignes.json', 'content/dictee-longue.json', 'content/fill-in-the-blanks.json', 'content/interactive-listening.json', 'content/interactive-reading.json', 'content/interactive-speaking.json', 'content/interactive-writing.json', 'content/listen-and-type.json', 'content/objectifs.json', 'content/photos/photo01.jpg', 'content/photos/photo02.jpg', 'content/photos/photo03.jpg', 'content/photos/photo04.jpg', 'content/photos/photo05.jpg', 'content/photos/photo06.jpg', 'content/photos/photo07.jpg', 'content/photos/photo08.jpg', 'content/photos/photo09.jpg', 'content/photos/photo10.jpg', 'content/photos/photo11.jpg', 'content/photos/photo12.jpg', 'content/photos/photo13.jpg', 'content/photos/photo14.jpg', 'content/photos/photo15.jpg', 'content/photos/photo16.jpg', 'content/photos/photo17.jpg', 'content/photos/photo18.jpg', 'content/photos/photo19.jpg', 'content/photos/photo20.jpg', 'content/photos/photo21.jpg', 'content/photos/photo22.jpg', 'content/photos/photo23.jpg', 'content/photos/photos.json', 'content/read-and-complete.json', 'content/read-and-select.json', 'content/read-then-speak.json', 'content/speaking-sample.json', 'content/writing-sample.json', 'css/app.css', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable.png', 'index.html', 'js/audio.js', 'js/charts.js', 'js/claude.js', 'js/compare.js', 'js/db.js', 'js/exam.js', 'js/exercises/common.js', 'js/exercises/dictation.js', 'js/exercises/fillBlanks.js', 'js/exercises/interactiveListening.js', 'js/exercises/interactiveReading.js', 'js/exercises/interactiveSpeaking.js', 'js/exercises/interactiveWriting.js', 'js/exercises/listenType.js', 'js/exercises/readComplete.js', 'js/exercises/readSelect.js', 'js/exercises/speakTasks.js', 'js/exercises/writePhoto.js', 'js/exercises/writingSample.js', 'js/levels.js', 'js/main.js', 'js/registry.js', 'js/report.js', 'js/rotation.js', 'js/speech.js', 'js/timer.js', 'js/ui.js', 'js/voicepick.js', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const isPhoto = /\.(jpe?g|png|webp)$/i.test(url.pathname);
  if (!isPhoto) {
    e.respondWith(fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  } else {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return r;
    })));
  }
});
