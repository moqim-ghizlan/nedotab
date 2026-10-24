# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage sémantique.

## [1.10.0] - 2026-10-24

### Ajouté

- Barre de recherche au-dessus de la grille : résultats instantanés parmi tous les sites et
  dossiers, à tous les niveaux, avec icône, titre surligné, domaine et chemin
  (`Accueil › Travail › Clients`). Aucun appel réseau pendant la frappe.
- Correspondance tolérante : majuscules, accents, ordre des mots ; initiales (« gh » →
  GitHub). Critères pondérés dans un tableau (`CRITERES`) prêt pour les tags en V4.7.
- Raccourcis `/` et Ctrl/Cmd+K (ignorés pendant une saisie), ↑ ↓ (en boucle), Entrée,
  Ctrl/Cmd+Entrée (nouvel onglet), clic molette, Échap (vide puis quitte).
- Entrée sur un dossier : la fenêtre s'ouvre directement à ce niveau, fil d'Ariane complet.
- Adresse tapée (`wikipedia.org/wiki/Paris`) : « Aller sur… » proposé en premier.
- Rien de trouvé : Entrée lance la recherche avec le **moteur par défaut** de l'utilisateur
  (`chrome.search.query`, permission `search`), sans jamais le changer.
- Accessibilité : combobox + listbox, option active annoncée, nombre de résultats annoncé.
- Mise en évidence construite avec des nœuds texte et `<mark>` (jamais `innerHTML`).

### Remarque

- À l'ouverture d'un nouvel onglet, Chrome garde le focus dans la barre d'adresse : cliquer
  dans la page (ou Tab) avant `/`. Comportement voulu par Chrome, non contourné.

### Tests

- 200 tests, dont la recherche : accents, « git » (GitHub et GitLab avant Digital),
  « trav cli », initiales, mot absent, plages surlignées sur le titre affiché, ordre stable,
  index mémoïsé, 2 000 éléments en moins de 5 ms par frappe.
- Navigateur : 21 vérifications de recherche (raccourcis, résultats, chemin, titre HTML
  inoffensif, dossier ouvert à son niveau, adresse, Échap, `/` dans un autre champ,
  Ctrl+Entrée, site ouvert, moteur par défaut) ; ensemble 149/149.

## [1.9.0] - 2026-10-24

### Ajouté

- Panneau **Réglages** (bouton ⚙ en haut à droite), latéral et non modal : changements
  appliqués en direct, sans bouton « Enregistrer ». Sections Apparence, Autorisations,
  Stockage, À propos, prêtes à accueillir les suivantes.
- Thème automatique, clair ou sombre (`data-theme`), qui suit le système en direct en mode
  automatique.
- Fonds : aucun, couleur unie (10 pastilles + sélecteur natif), 8 dégradés intégrés
  (aucune image réseau), image importée. L'image est réduite à 2 560 px au plus grand côté,
  remise droite selon l'EXIF, réencodée en WebP 0,85 (repli JPEG), refusée au-delà de
  25 Mo, rangée dans **IndexedDB** (l'état ne garde que `local:<id>` et la couleur
  dominante). Une seule image : l'ancienne est supprimée au remplacement.
- Voile d'assombrissement (0 à 0,7) et flou (0 à 20 px) réglables en direct.
- Lisibilité : la couleur du texte posé sur le fond (titres des tuiles, pied de page) suit
  la clarté du fond, avec une ombre légère.
- Démarrage sans flash : thème et couleur de fond lus d'un petit cache local synchrone,
  puis l'image arrive en fondu.
- Autorisations : accorder ou retirer l'accès aux sites. Stockage : taille des données et
  des icônes personnalisées. À propos : version.
- Action `REGLAGES_MODIFIER` (liste blanche, couleurs hexadécimales, voile et flou bornés) ;
  réglages invalides au chargement remplacés par les valeurs par défaut.

### Écart au plan

- Pas de dépendance `idb-keyval` : CLAUDE.md limite les dépendances autorisées. Un accès
  IndexedDB de 40 lignes (`src/platform/fichiers.js`) la remplace.
- Dégradé « Lagon » assombri pour que chaque couleur du dégradé atteigne 4,5:1.

### Mesure

- Premier rendu de la grille (du début du script à la grille affichée), 10 onglets ouverts
  à la suite : **médiane 7,2 ms, maximum 11,7 ms** (objectif < 100 ms).

### Tests

- 187 tests : luminance, contraste ≥ 4,5:1 de chaque couleur des 8 dégradés avec le texte
  choisi, `REGLAGES_MODIFIER`, migration des réglages, dimensions d'image.
- Navigateur : 128/128, dont 21 vérifications d'apparence (thèmes, système en direct,
  couleur, dégradé, image dans IndexedDB et pas dans `chrome.storage`, remplacement,
  voile et flou, couleur de fond présente dès l'ouverture de 10 onglets).

## [1.8.0] - 2026-10-24

### Ajouté

- Ranger à la souris comme sur un téléphone : maintenir une icône 500 ms au centre d'une
  autre (halo) puis relâcher —
  - sur un site : un dossier « Dossier » contenant les deux remplace la cible, s'ouvre et
    son nom est prêt à être tapé (`OUVRIR_APRES_FUSION`) ;
  - sur un dossier : l'élément y entre, l'aperçu se met à jour.
- Fil d'Ariane comme zone de dépôt : maintenir 400 ms sur « Accueil » ou un dossier parent
  fait remonter l'élément à ce niveau ; la fenêtre reste au niveau courant.
- Refus visible : cible en rouge et toast explicatif (« Dépasserait 3 niveaux », « Un dossier
  ne peut pas aller dans lui-même », un dossier lâché sur un site ne crée pas de dossier).
- « Annuler » après chaque fusion, rangement ou remontée.
- Ctrl+Maj+↑ dans un dossier : l'élément remonte au niveau parent, juste après le dossier.
- Action `FUSIONNER`, ajoutée au test de propriétés. Détection d'intention isolée dans
  `intentionDepot.js` (indépendante de SortableJS, réutilisable pour le tactile).

### Corrigé

- Après un glisser relâché sur un autre élément, SortableJS ignorait le clic suivant de
  l'utilisateur (par exemple sur « Annuler ») : ce clic fantôme est désormais consommé.

### Écart au plan

- Le plan proposait `swapThreshold: 0.65` sans inversion. Avec SortableJS, la zone d'échange
  est centrée sur la cible : viser le centre d'une tuile la faisait bouger avant les 500 ms.
  Réglage retenu : `invertSwap: true`, `invertedSwapThreshold: 0.7` (échange sur les côtés,
  centre réservé au dépôt). Le plan B (glisser maison) n'a pas été nécessaire.

### Tests

- 169 tests : `FUSIONNER` (accueil, niveau 2, refus au niveau 3, site → dossier, dossier →
  dossier, refus dossier → site et boucle), propriétés étendues, zone centrale.
- Navigateur : 18 vérifications de fusion — halo, dossier ouvert en édition, passage rapide
  sans fusion, dépôt dans un dossier, 4ᵉ niveau refusé en rouge, dépôt sur « Accueil » du
  fil d'Ariane puis Annuler, Ctrl+Maj+↑, 20 manipulations rapides sans perte ni doublon,
  rechargement — plus toutes les vérifications précédentes.

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
