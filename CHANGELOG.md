# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage sémantique.

## [1.2.0] - 2026-10-24

### Ajouté

- Ajout d'un site par son adresse (fenêtre « Ajouter un site », nom facultatif, Entrée valide).
- Tuile « + » en fin de grille et écran d'accueil vide « Ajoutez votre premier site ».
- Enregistrement dans `chrome.storage.local` (permission `storage` uniquement), écritures
  regroupées (300 ms) et vidées à la fermeture de l'onglet.
- Synchronisation entre onglets ouverts sans recharger, chaque onglet ignorant ses propres échos.
- Normalisation des adresses (https ajouté, hôte en minuscules, IDN) et refus de
  `javascript:`, `data:`, `file:`, `chrome:`, `about:`, `blob:`, `ftp:`.
- Détection des doublons (« Ajouter quand même »).
- Migration et validation des données au chargement ; lecture seule si les données viennent
  d'une version plus récente ou n'ont pas pu être lues.

### Modifié

- Les données d'exemple ne sont plus affichées au démarrage (conservées pour les tests).

### Tests

- 59 tests (26 cas d'URL, migration, stockage simulé, debounce et sortie de page).
- Navigateur : 17/17 (état vide, URL refusée, ajout au clavier, doublon, synchro entre deux
  onglets sans perte, persistance après rechargement, console propre).

## [1.1.0] - 2026-10-24

### Ajouté

- Modèle de données (site, dossier, état avec `versionSchema`) documenté en JSDoc.
- Store central : actions JSON → réducteur pur → abonnés ; état gelé en développement.
- Grille adaptative de tuiles (pastille lettre colorée + titre), données d'exemple.
- Navigation au clavier (Tab, flèches), focus visible, liste accessible.
- Palette de 12 couleurs de pastille, choisie par un hash stable du domaine.

### Tests

- 20 tests (modèle, couleurs, store, réducteur sans mutation, rendu sans injection HTML).
- Navigateur : 6/6 (grille, flèches, 400 px sans défilement horizontal, console propre).

## [1.0.0] - 2026-10-24

### Ajouté

- Extension Chrome Manifest V3 qui remplace la page Nouvel onglet (nom et version affichés).
- Thème clair et sombre automatique (variables CSS dans `tokens.css`).
- Build Vite vers `dist/extension/`, version injectée depuis `package.json`.
- ID d'extension stable grâce à la clé `key` du manifest.
- Scripts : vérification « aucun code distant », empaquetage `.zip` + SHA-256,
  génération des icônes, test dans un vrai Chrome par le protocole DevTools.
- Vitest, ESLint (règle de pureté de `src/core`), Prettier.

### Tests

- `npm test`, `npm run lint`, `npm run verifier` : OK.
- `npm run verifier:navigateur` : 3/3 (ID stable, nom et version, console sans erreur).
