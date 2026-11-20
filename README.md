# DET Coach

Application d'entraînement au Duolingo English Test, sur téléphone et sur ordinateur.
Interface en français, exercices en anglais. Aucun compte, aucune clé, aucun réglage.

## Utilisation

- **Ordinateur** : ouvrir le lien dans **Chrome**, qui gère la reconnaissance vocale.
- **iPhone** : ouvrir le lien dans **Safari**, puis Partager → **Sur l'écran d'accueil**. L'application s'ouvre alors comme une vraie app, et Safari n'efface plus les données.
- Au premier lancement : **test du micro** (3 secondes), qui règle la détection des silences sur ta voix. Le test reste disponible en permanence via le bouton « Micro ».
- **Clavier** : `Entrée` pour commencer et valider (`Ctrl+Entrée` dans une zone de texte) · `Espace` pour écouter ou enregistrer · `Échap` pour revenir.

Les données (séances, enregistrements audio, rapports) restent **sur l'appareil** (IndexedDB) : l'historique du téléphone et celui de l'ordinateur sont séparés. Le bouton **« Exporter depuis la dernière fois »** de l'Historique réunit tous les rapports dans un seul bloc Markdown à coller au début du cours.

## Les 14 exercices et leurs durées

Les durées suivent le guide officiel *Duolingo English Test — Scoring Guide for Teachers (2026)* (§2.6, §3, §4).

| Exercice | Fonctionnement dans l'application |
|---|---|
| Read and Select | 18 mots, un par un, 5 s chacun, réel ou inventé |
| Fill in the Blanks | 6 phrases, un mot inachevé (début donné), 20 s chacune |
| Read and Complete | un texte, 23 mots amputés, une case par lettre, 3 min |
| Interactive Reading | 5 tâches enchaînées, 7 min (8 min si 7 trous ou plus) |
| Listen and Type | 5 phrases, 3 écoutes maximum, 1 min chacune |
| Interactive Listening | Listen and Complete + Listen and Respond (6 min 30), puis résumé (75 s, chrono séparé) |
| Dictée longue *(hors test)* | 10 phrases, exactement 2 écoutes imposées, saisie possible pendant l'audio, score du 1er passage séparé. Trois niveaux de longueur (voir plus bas) |
| Write About the Photo | 3 photos, 1 min chacune |
| Interactive Writing | jusqu'à 30 s de lecture, 5 min, puis relance en 3 min |
| Writing Sample | jusqu'à 30 s, puis 5 min |
| Speak About the Photo | 20 s de préparation, 90 s de parole |
| Read Then Speak | 20 s, puis 90 s |
| Interactive Speaking | 2 thèmes, 6 à 8 questions orales (entendues une fois), 35 s chacune |
| Speaking Sample | jusqu'à 30 s, puis 3 min |

## Pour le professeur : les fichiers à modifier

Tout est dans `content/`. Aucun fichier de code n'est à toucher.

### `content/consignes.json`

Une entrée par exercice, affichée avant chaque exercice en 5 blocs. Une entrée vide affiche « Consignes pas encore écrites par ton professeur ». La clé `summarize-the-conversation` est une étape d'`interactive-listening` : elle s'affiche dans l'écran de consignes de cet exercice, sous « Étape 3 ».

```json
"read-and-complete": {
  "format": "Ce que c'est (2 phrases).",
  "mesure": "Ce que ça mesure vraiment (1 phrase).",
  "methode": ["Règle 1", "Règle 2", "Règle 3"],
  "piege": "Les erreurs personnelles déjà constatées."
}
```

Le Markdown léger est accepté : `**gras**`, `*italique*`.

### `content/objectifs.json`

Un objectif chiffré par exercice. Tant que `objectif` vaut `null`, l'écran affiche « Objectif pas encore fixé ».

```json
"read-and-complete": { "metrique": "sur 23", "objectif": 18, "actuel": 9 }
```

`actuel` est le niveau relevé par le professeur ; l'application ne le modifie jamais. La mesure calculée par l'application pour chaque exercice :

| Exercice (clé) | Mesure calculée |
|---|---|
| `read-and-select`, `fill-in-the-blanks`, `interactive-reading`, `interactive-listening` | pourcentage |
| `read-and-complete` | mots justes sur 23 |
| `listen-and-type` | phrases exactes sur 5 |
| `dictee-longue` | % de mots justes au premier passage, au niveau en cours (objectif 80 %, qui est aussi le seuil pour monter de niveau) |
| `write-about-the-photo` | mots en 60 s (moyenne des 3 photos) |
| `interactive-writing`, `writing-sample` | mots en 5 min |
| `speak-about-the-photo`, `read-then-speak` | mots en 90 s |
| `interactive-speaking` | mots par réponse de 35 s (moyenne) |
| `speaking-sample` | mots par minute (3 min au maximum) |

Les valeurs de départ prévues dans le cahier des charges, à recopier dans `objectifs.json` quand le professeur le décide :

```json
"write-about-the-photo":  { "metrique": "mots en 60 s",              "objectif": 55,  "actuel": 38 },
"speak-about-the-photo":  { "metrique": "mots en 90 s",              "objectif": 130, "actuel": 97 },
"read-then-speak":        { "metrique": "mots en 90 s",              "objectif": 120, "actuel": 83 },
"interactive-speaking":   { "metrique": "mots par réponse de 35 s",  "objectif": 60,  "actuel": 55 },
"speaking-sample":        { "metrique": "mots par minute sur 3 min", "objectif": 80,  "actuel": 57 },
"listen-and-type":        { "metrique": "phrases exactes sur 5",     "objectif": 5,   "actuel": 4 },
"dictee-longue":          { "metrique": "% de mots justes au 1er passage (niveau en cours)", "objectif": 80, "actuel": null },
"read-and-select":        { "metrique": "pourcentage",               "objectif": 85,  "actuel": null },
"fill-in-the-blanks":     { "metrique": "pourcentage",               "objectif": 80,  "actuel": null },
"interactive-reading":    { "metrique": "pourcentage",               "objectif": 80,  "actuel": null },
"interactive-listening":  { "metrique": "pourcentage",               "objectif": 75,  "actuel": null },
"interactive-writing":    { "metrique": "mots en 5 min",             "objectif": 180, "actuel": null },
"writing-sample":         { "metrique": "mots en 5 min",             "objectif": 200, "actuel": null }
```

### Les banques d'items

Un fichier par exercice, chaque item avec un `id` unique et des `tags` de thème (*travail, voyage, santé, technologie, environnement, études, ville, argent, alimentation, loisirs, société*). Un item ne revient jamais avant que la banque soit épuisée, et deux items de suite ne partagent jamais leur thème principal (le premier tag). L'accueil affiche « 12 vus sur 18 » : c'est le signal pour écrire de nouveaux items.

| Fichier | Format d'un item |
|---|---|
| `read-and-select.json` | `{ "id", "word", "real": true/false }` |
| `fill-in-the-blanks.json` | `{ "id", "tags", "text": "… a solid [le\|lead] in the …" }` |
| `read-and-complete.json` | `{ "id", "title", "tags", "text": "… sleep [pl\|plays] a central [r\|role] …" }` |
| `interactive-reading.json` | `sentences` avec `{bonne\|leurre\|leurre\|leurre}`, `passage`, `after`, `highlight` (2), `idea`, `title` |
| `listen-and-type.json` | `{ "id", "tags", "sentence" }` |
| `interactive-listening.json` | `scenario`, `complete` (phrases avec `___`), `conversation` (la bonne réponse en premier dans `options`) |
| `dictee-longue.json` | `{ "id", "tags", "sentence", "features" }` |
| `interactive-writing.json` | `{ "id", "tags", "prompt", "followUp" }` |
| `writing-sample.json` | `{ "id", "tags", "prompt" }` |
| `read-then-speak.json`, `speaking-sample.json` | `{ "id", "tags", "prompt", "bullets": [...] }` |
| `interactive-speaking.json` | `{ "id", "tags", "topic", "questions": [4 questions] }` |

Notation `[préfixe|mot complet]` : le préfixe est affiché, et le nombre de cases s'en déduit.

### Les photos

Déposer l'image dans `content/photos/` et ajouter une ligne dans `content/photos/photos.json` : `{ "file", "tags", "description" }`. Un site statique ne peut pas lister un dossier, d'où ce fichier. Les 23 photos de départ viennent de Wikimedia Commons (licences libres, auteurs indiqués dans `photos.json` et sous chaque photo).

### Après une modification

Lancer `python3 tools/build-sw.py` pour mettre à jour la liste des fichiers disponibles hors ligne, puis publier.

## La dictée longue : niveaux et mesures

**Niveaux de longueur.** Niveau 1 = phrases de 6 à 8 mots, niveau 2 = 9 à 11, niveau 3 = 12 à 16 (mots comptés tels qu'écrits). On commence au niveau 1 et on monte d'un niveau après une séance entière à **80 % de mots justes au premier passage** ou plus. Le niveau se recalcule à partir de l'historique ; il s'affiche sur la carte d'accueil, sur l'écran de consignes avec le critère pour monter, et dans le rapport. Réglages dans `js/levels.js`.

**Règles de correction** (communes à la dictée et à Listen and Type) :
- Une contraction et sa forme développée sont équivalentes : *there's / there is, I'm / I am, she's / she is (ou she has), don't / do not*… Ce n'est ni une faute de mot, ni une faute de frontière.
- **Erreur de découpage** : comptée seulement là où quelque chose est écrit des deux côtés de la frontière. Exemples : *pickedit* pour *picked it*, *setup* pour *set up*, *re port* pour *report*, et les formes réduites écrites en un mot (*wanna, gonna, lotta*…).
- **Taux d'omission** : mots attendus absents de la réponse, divisés par le nombre de mots attendus. Un mot omis n'est pas une erreur de découpage.
- **Position du décrochage** : rang, dans la phrase, du dernier mot juste avant la première série de 2 mots attendus perdus d'affilée (omis ou remplacés par un mot sans rapport). Une faute d'orthographe proche ou un collage ne fait pas décrocher. Pour chaque séance : nombre de phrases qui décrochent, rang moyen, et part moyenne de la phrase tenue (une phrase qui ne décroche pas compte pour 100 %). Le seuil de 2 mots est `COLLAPSE_RUN` dans `js/compare.js`.

## Ce que l'application mesure, et ce qu'elle ne fait pas

- **À l'oral** : audio brut (opus 128 kbps quand le navigateur le permet, sinon AAC sur iPhone), écrit seconde par seconde dans IndexedDB et récupérable si l'onglet se ferme. La détection des silences se fait sur le signal (RMS sur 50 ms, seuil calibré au test micro, `autoGainControl: false`). L'application mesure la durée de parole effective, les silences de plus d'une seconde (nombre, durée, position), le nombre de mots, les mots par minute (sur la durée totale et sur la parole effective) et le temps non utilisé. La transcription du navigateur est affichée comme indice, pas comme vérité.
- **À l'écrit** : nombre de mots, mots par minute, courbe de frappe, temps non utilisé, mots pleins employés plus de trois fois.
- **Aucune note de contenu** n'est inventée par l'application. Les rapports contiennent seulement des chiffres bruts. Le bouton **« Corriger avec Claude »** copie une demande de correction aux critères officiels du DET, à coller dans Claude : la correction se fait hors de l'application.

## Lancer en local

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000 dans Chrome.
