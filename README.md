# NedoTab

Page « Nouvel onglet » avec une grille d'icônes de sites et des dossiers imbriqués sur trois
niveaux. Disponible en extension Chrome (PC) et, plus tard, en application web (iPhone, iPad).

> **Règle d'or : `src/core/` ne connaît ni le DOM, ni `chrome`, ni Firebase.**
> Tout ce qui touche à une plateforme passe par `src/platform/`.

## Fonctions (V1, locale, sans compte)

- Grille d'icônes, ajout par adresse, titre et icône trouvés automatiquement.
- Modification (nom, adresse, icône : automatique, lettre ou emoji, image), suppression
  avec « Annuler ».
- Dossiers sur 3 niveaux, fil d'Ariane, « Déplacer vers… » en arbre, garde-fous.
- Glisser-déposer : réordonner, ranger dans un dossier, créer un dossier en maintenant une
  icône sur une autre, remonter par le fil d'Ariane.
- Thème clair / sombre / automatique, fonds (couleur, dégradé, image locale).
- Recherche instantanée (`/`, Ctrl+K), recherche web avec le moteur par défaut.
- Site vitrine (`site/`) : présentation, installation, mise à jour, FAQ, confidentialité.

## Prérequis

- Node.js 22 LTS ou plus récent (développé avec Node 24.21, npm 11.19)
- Git
- Google Chrome à jour
- Java 21 ou plus récent pour les émulateurs Firebase (V2)

## Commandes

| Commande                      | Rôle                                                                   |
| ----------------------------- | ---------------------------------------------------------------------- |
| `npm install`                 | installe les outils                                                    |
| `npm run build:extension`     | construit l'extension dans `dist/extension/`                           |
| `npm run dev:extension`       | reconstruit à chaque modification                                      |
| `npm test`                    | tests automatiques (Vitest)                                            |
| `npm run test:couverture`     | tests + couverture de `src/core` (seuil 90 % des lignes)               |
| `npm run lint`                | ESLint                                                                 |
| `npm run format`              | Prettier                                                               |
| `npm run verifier`            | vérifie qu'aucun code distant n'est présent dans le paquet             |
| `npm run verifier:navigateur` | charge l'extension dans Chrome (sans fenêtre) et la teste              |
| `npm run package`             | produit `release/NedoTab-V<x.y>-Extension.zip` et son SHA-256          |
| `npm run build:site`          | construit le site vitrine dans `dist/site/`                            |
| `npm run captures`            | refait les captures du site depuis l'extension réelle                  |
| `npm run publier`             | build + vérification + zip + copie du zip dans le site + build du site |
| `npm run verifier:site`       | contrôle le site dans Chrome et simule une mise à jour depuis son zip  |
| `npm run tester-sites`        | essaie la détection de titre et d'icône sur de vrais sites             |
| `npm run icones`              | régénère les icônes                                                    |

`npm run verifier:navigateur -- --seulement=dossiers` (ou `principal`, `imbrication`,
`fusion`, `apparence`, `recherche`) ne lance qu'un scénario.

## Publier une version

1. `npm run publier` : construit l'extension, vérifie l'absence de code distant, crée le zip
   (avec `manifest.json` à la racine, version contrôlée), le copie dans
   `site/public/telechargement/` et construit le site.
2. `npm run verifier:site`.
3. La mise en ligne du site (et de la release) se fait **par le propriétaire** ou avec son
   accord explicite. Rien n'est publié automatiquement.

Valeurs du site en attente de décision : `site/site.config.js` (adresse publique, éditeur,
contact, hébergeur) et `URL_SITE` dans `src/core/constantes.js`.

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
extension/    manifest.json source (version injectée au build) et icônes
public/       fichiers statiques de la future PWA
src/core/     logique pure (modèle, arbre, règles, recherche, réglages), testée unitairement
src/ui/       rendu et interactions DOM, styles
src/platform/ extension.js / pwa.js : tout ce qui dépend de la plateforme
src/firebase/ configuration et SDK Firebase, chargés à la demande
site/         site vitrine (pages, gabarits, captures, téléchargement)
tests/        tests Vitest (core en Node, ui avec happy-dom)
scripts/      vérification, empaquetage, publication, captures, tests navigateur
```

La version n'est écrite qu'à un seul endroit : `package.json`.

## Clé de l'extension

Le manifest contient `key` pour que l'ID de l'extension reste le même
(`imegmpimokhlnlhcmaogimnlgcfgefnn`). La clé privée `cle-extension.pem` n'est jamais
committée : la conserver dans un endroit sûr.
