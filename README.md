# NedoTab

Page « Nouvel onglet » avec une grille d'icônes de sites et des dossiers imbriqués.
Disponible en extension Chrome (PC) et, plus tard, en application web (iPhone, iPad).

> **Règle d'or : `src/core/` ne connaît ni le DOM, ni `chrome`, ni Firebase.**
> Tout ce qui touche à une plateforme passe par `src/platform/`.

## Prérequis

- Node.js 22 LTS ou plus récent (développé avec Node 24.21, npm 11.19)
- Git
- Google Chrome à jour

## Commandes

| Commande                      | Rôle                                                          |
| ----------------------------- | ------------------------------------------------------------- |
| `npm install`                 | installe les outils                                           |
| `npm run build:extension`     | construit l'extension dans `dist/extension/`                  |
| `npm run dev:extension`       | reconstruit à chaque modification                             |
| `npm test`                    | tests automatiques (Vitest)                                   |
| `npm run lint`                | ESLint                                                        |
| `npm run format`              | Prettier                                                      |
| `npm run verifier`            | vérifie qu'aucun code distant n'est présent dans le paquet    |
| `npm run verifier:navigateur` | charge l'extension dans Chrome (sans fenêtre) et la teste     |
| `npm run package`             | produit `release/NedoTab-V<x.y>-Extension.zip` et son SHA-256 |
| `npm run icones`              | régénère les icônes                                           |

## Charger l'extension dans Chrome

1. `npm run build:extension`
2. Ouvrir `chrome://extensions`, activer le **Mode développeur**.
3. **Charger l'extension non empaquetée** → choisir `dist/extension/`.
4. Ouvrir un nouvel onglet. Chrome demande « Vous souhaitez revenir à Google ? » :
   cliquer sur **Conserver**.
5. Après chaque build, cliquer sur ↻ dans `chrome://extensions` puis rouvrir un onglet.

Ne pas utiliser `vite dev` pour tester : `chrome.*` n'y existe pas.

## Structure

```
extension/   manifest.json source (version injectée au build) et icônes
public/      fichiers statiques de la future PWA
src/core/    logique pure (modèle, grille, validations), testée unitairement
src/ui/      rendu et interactions DOM, styles
src/platform/ extension.js / pwa.js : tout ce qui dépend de la plateforme
tests/       tests Vitest (core en Node, ui avec happy-dom)
scripts/     vérification, empaquetage, icônes, test navigateur
```

La version n'est écrite qu'à un seul endroit : `package.json`.

## Clé de l'extension

Le manifest contient `key` pour que l'ID de l'extension reste le même
(`imegmpimokhlnlhcmaogimnlgcfgefnn`). La clé privée `cle-extension.pem` n'est jamais
committée : la conserver dans un endroit sûr.
