# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage sémantique.

## [1.7.0] - 2026-10-24

### Ajouté

- Dossiers imbriqués sur 3 niveaux (Accueil › Travail › Clients › Projets), dans une seule
  fenêtre : ouvrir un sous-dossier remplace le contenu (courte transition latérale).
- Fil d'Ariane cliquable (segments du milieu repliés en « … » sur écran étroit),
  `aria-current="location"` sur l'emplacement courant, bouton « ← » dès le niveau 2,
  Échap qui remonte d'un niveau puis ferme, focus rendu au dossier d'où l'on vient.
- « + » dans un dossier : Ajouter un site / Nouveau dossier ; au niveau 3, « Nouveau
  dossier » (et « Créer un dossier avec ce site ») est désactivé avec « 3 niveaux maximum ».
- « Déplacer vers… » en arbre (Accueil + tous les dossiers) : destinations impossibles
  grisées avec leur raison (« Un dossier ne peut pas aller dans lui-même », « Dépasserait
  3 niveaux »), emplacement actuel marqué, clavier ↑ ↓ → ← Entrée. Les dossiers aussi
  peuvent être déplacés.
- Coin replié sur la tuile d'un dossier qui contient des sous-dossiers.
- Règles centralisées dans `arbre.js` (`peutPlacer`, `peutCreerDossierDans`, `hauteur`,
  `niveauEmplacement`, `cheminVers`, `estDescendant`, `aplatir`), utilisées par l'interface
  **et** par le réducteur, qui refuse toute opération interdite (état inchangé).
- Chargement : un dossier trop profond est aplati (ses sites prennent sa place) et un id
  dupliqué est renommé — rien n'est supprimé, une alerte est écrite en console.

### Tests

- 159 tests : table de 17 cas de placement (profondeur, boucle, introuvable), réducteur qui
  refuse, données invalides corrigées, et 3 × 2 000 opérations aléatoires (ajout, création
  de dossier, déplacement, renommage, suppression, restauration) avec invariants vérifiés
  après chacune sur un état gelé.
- Couverture de `src/core` : 98,5 % des lignes (`npm run test:couverture`, seuil 90 %).
- Navigateur : 89/89, dont le scénario imbrication (19 vérifications).

## [1.6.0] - 2026-10-24

### Ajouté

- Dossiers (un niveau) : création depuis « + » (menu Ajouter un site / Nouveau dossier) ou
  par « Créer un dossier avec ce site » (le dossier prend la place du site).
- Tuile dossier : aperçu 2 × 2 des quatre premiers sites, fond translucide, libellé
  accessible « Dossier Travail, 7 éléments » ; dossier vide dessiné à part.
- Fenêtre de dossier : même grille que l'accueil (glisser, Alt+flèches, menus), titre
  modifiable sur place (Entrée valide, Échap annule), « + » ajoute un site dans le dossier,
  fermeture par Échap, bouton ou clic sur le fond, focus rendu à la tuile du dossier.
  Elle suit les changements faits dans un autre onglet et se ferme si le dossier disparaît.
- « Déplacer vers… » (Accueil et dossiers, emplacement actuel grisé).
- Menu d'un dossier : Ouvrir, Renommer, Supprimer. Suppression d'un dossier non vide avec
  confirmation : garder les sites dans l'accueil (à la place du dossier) ou tout supprimer,
  puis « Annuler ».
- Dossier vidé par un déplacement ou une suppression : toast « Le dossier … est vide —
  Supprimer le dossier » (jamais supprimé d'office).
- Actions `DOSSIER_CREER`, `DOSSIER_RENOMMER` (1 à 40 caractères, « Dossier » si vide),
  `DOSSIER_SUPPRIMER` (deux modes), `GRILLE_REMPLACER` (annulation).
- Plusieurs toasts peuvent coexister (annulation + dossier vide) ; dans une fenêtre ouverte,
  ils s'affichent dans la fenêtre pour rester cliquables.

### Tests

- 128 tests, dont 1 500 opérations aléatoires (créer, supprimer, déplacer) sans perte ni
  doublon, aperçu et comptage sur des arbres imbriqués.
- Navigateur : 70/70, dont le nouveau scénario dossiers (19 vérifications : deux modes de
  création, aperçu, fenêtre au clavier, renommage sur place, ajout dans le dossier, fenêtre
  synchronisée entre onglets, suppression dans les deux modes avec annulation, dossier vidé).

## [1.5.0] - 2026-10-24

### Ajouté

- Glisser-déposer pour réorganiser la grille (SortableJS, intégré au paquet). Le geste
  devient une action `ELEMENT_DEPLACER` ; le DOM est redessiné à partir de l'état, et les
  rendus demandés pendant un glisser attendent le dépôt.
- Retour visuel : emplacement cible en pointillés, tuile soulevée et légèrement inclinée,
  curseur « grabbing » ; sans animation si le système demande moins de mouvement.
- Réorganisation au clavier : Alt+← → (une case), Alt+↑ ↓ (une ligne), Alt+Début / Fin,
  focus conservé et annonce vocale « … déplacé en position 3 sur 12 ».
- `deplacer()` dans `arbre.js`, déjà capable de viser un dossier et de refuser un dossier
  déposé dans lui-même ou un descendant.

### Tests

- 115 tests, dont 1 000 déplacements aléatoires (graine fixe) sans perte ni doublon.
- Navigateur : 51/51 — premier → fin et dernier → début à la souris, aucun doublon, aucun
  site ouvert par un glisser, tuile « + » toujours dernière, relâcher sur place sans
  écriture, Alt+→ et Alt+Fin, annonce vocale, synchro dans l'autre onglet, ordre conservé
  au rechargement, grille de 100 sites prête en 43 ms et glissable.

## [1.4.0] - 2026-10-24

### Ajouté

- Menu contextuel sur les tuiles (clic droit, bouton « ⋯ » au survol, touche Menu ou
  Maj+F10) : Modifier, Ouvrir dans un nouvel onglet, Copier le lien, Supprimer. Clavier
  ↑ ↓ Entrée Échap ; le clic droit hors d'une tuile garde le menu de Chrome.
- Fenêtre « Modifier le site » : nom, adresse (avec mise à jour proposée de l'icône) et
  icône en quatre modes — automatique (« Re-détecter »), lettre ou emoji sur une des
  12 couleurs, image depuis une adresse (vérifiée, 32 px minimum), image importée
  (réduite à 96 px en WebP, SVG rastérisé, 16 Ko au plus). Aperçu en direct.
- Suppression immédiate avec toast « Annuler » (5 s, pause au survol) ; une nouvelle
  suppression rend la précédente définitive. Le focus passe à la tuile suivante.
- Raccourcis sur une tuile : Suppr / Retour arrière, F2 ou E.
- `src/core/arbre.js` : recherche, insertion, retrait, remplacement sur un arbre de dossiers
  imbriqués (prêt pour les dossiers).

### Tests

- 109 tests : arbre plat et imbriqué, liste blanche de `SITE_MODIFIER`, suppression puis
  restauration identique à l'original, menu fermé par Échap, « Annuler » qui restaure,
  limite de 16 Ko des images importées.
- Navigateur : menu au clic droit, renommage et lettre ✈️ sur fond bleu, import d'un PNG de
  3,5 Mo (1 Ko après réduction), suppression puis Annuler à la même place, seule la
  dernière suppression annulable, modification visible dans l'autre onglet.
- Remarque : en WebP 96 px, même une photo de bruit pur tient en 3 Ko ; la limite de 16 Ko
  protège surtout le repli PNG.
- Le script de test met désormais l'onglet au premier plan avant chaque frappe (les
  événements clavier n'atteignaient que l'onglet affiché).

## [1.3.0] - 2026-10-24

### Ajouté

- Titre et icône trouvés automatiquement à la saisie de l'adresse, avec aperçu en direct.
  Chaîne : page du site (si autorisé) → service Google → cache d'icônes de Chrome →
  pastille lettre. Durée plafonnée à 8 s, l'ajout n'attend jamais le réseau (la tuile se met
  à jour ensuite).
- Lecture de la page : `<title>`, `og:site_name`, `apple-touch-icon`, SVG, PNG par taille,
  icônes du manifeste web, `/favicon.ico` ; titres longs raccourcis, pages de connexion ou de
  consentement remplacées par le domaine.
- Permission d'accès aux sites **facultative**, demandée dans la fenêtre d'ajout avec
  explication (« Autoriser » / « Plus tard »), jamais à l'installation.
- Permission `favicon` ; icônes affichées sur fond blanc arrondi, repli lettre si l'image
  ne charge plus.

### Corrigé

- Deux onglets qui écrivaient presque en même temps pouvaient perdre le site ajouté dans
  l'un d'eux : les actions locales non encore enregistrées sont désormais rejouées sur l'état
  de l'autre onglet (à la réception et juste avant chaque écriture).
- Le focus reste sur la tuile active quand la grille se redessine.

### Écart au plan

- Google passe **avant** le cache d'icônes de Chrome : l'adresse `chrome-extension://…/_favicon`
  ne fonctionne que dans ce navigateur, elle serait inutilisable sur iPhone après la synchro
  (V2–V3). Le cache de Chrome reste utilisé quand rien d'autre n'est trouvé.

### Sites testés (`node scripts/tester-sites.mjs`, permission accordée)

| Site                         | Titre trouvé    | Icône                   | Résultat        |
| ---------------------------- | --------------- | ----------------------- | --------------- |
| github.com                   | GitHub          | SVG du site             | icône du site   |
| wikipedia.org                | Wikipedia       | apple-touch-icon        | icône du site   |
| youtube.com                  | YouTube         | PNG 144 px              | icône du site   |
| notion.so                    | notion.so       | page refusée (anti-bot) | icône Google    |
| lemonde.fr                   | Le Monde.fr     | apple-touch-icon 180    | icône du site   |
| mail.google.com              | mail.google.com | favicon.ico             | icône du site   |
| example.com (sans icône)     | Example Domain  | aucune                  | pastille lettre |
| http://github.com (redirige) | GitHub          | SVG du site             | icône du site   |
| nexistepas.invalid           | domaine         | aucune                  | pastille lettre |

### Tests

- 86 tests dont 12 pages HTML de référence, 11 cas de nettoyage de titre, ordre des icônes,
  et deux onglets qui écrivent en même temps sans perte.
- Navigateur : 23/23 (sans permission : icône Google et pastille ; avec permission : titre
  « Le Monde.fr » lu dans la page et icônes des sites eux-mêmes).

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
