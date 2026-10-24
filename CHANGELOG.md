# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage sémantique.

## [1.1.0] - 2026-10-24

### Ajouté

- Modèle de données (site, dossier, état avec ) documenté en JSDoc.
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
