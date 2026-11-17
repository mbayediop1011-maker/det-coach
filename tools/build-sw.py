#!/usr/bin/env python3
"""Régénère sw.js avec la liste des fichiers à garder hors ligne.
À relancer après avoir ajouté des fichiers (python3 tools/build-sw.py)."""
import os, hashlib
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files, h = [], hashlib.sha1()
for d, dirs, fs in os.walk(root):
    dirs[:] = [x for x in dirs if not x.startswith('.') and x != 'tools']
    for f in sorted(fs):
        p = os.path.relpath(os.path.join(d, f), root)
        if p == 'sw.js' or p.endswith('.md') or f.startswith('.'):
            continue
        files.append(p)
        h.update(open(os.path.join(root, p), 'rb').read())
files.sort()
version = 'det-coach-' + h.hexdigest()[:10]
sw = f"""// Service worker : l'application fonctionne hors ligne une fois chargée.
// Fichier généré par tools/build-sw.py — ne pas modifier à la main.
// Réseau d'abord pour le code et le contenu (les modifications du professeur arrivent tout de suite),
// cache en secours quand il n'y a pas de connexion.
const VERSION = '{version}';
const ASSETS = ['./', {', '.join(repr(f) for f in files)}];

self.addEventListener('install', e => {{
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
}});
self.addEventListener('activate', e => {{
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
}});
self.addEventListener('fetch', e => {{
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const isPhoto = /\\.(jpe?g|png|webp)$/i.test(url.pathname);
  if (!isPhoto) {{
    e.respondWith(fetch(e.request).then(r => {{
      if (r.ok) {{ const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }}
      return r;
    }}).catch(() => caches.match(e.request, {{ ignoreSearch: true }})));
  }} else {{
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {{
      if (r.ok) {{ const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }}
      return r;
    }})));
  }}
}});
"""
open(os.path.join(root, 'sw.js'), 'w').write(sw)
print(len(files), 'fichiers,', version)
