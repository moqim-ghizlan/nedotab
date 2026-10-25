# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage sémantique.

## [3.0.1] - 2026-10-25

### Corrigé

- Application web : la page d'accueil (`/`) n'est plus gardée une heure en cache par le
  navigateur ; une nouvelle version déployée s'affiche au prochain chargement.

## [3.0.0] - 2026-10-25

Deuxième plateforme : NedoTab devient aussi une application web, pour l'iPhone, l'iPad et
tout navigateur, à partir du même code que l'extension.

### Ajouté

- **Application web** (`npm run build:pwa` → `dist/pwa/`, `npm run dev:pwa` pour travailler
  sur l'interface sans extension) : grille, dossiers, glisser, recherche, pages, fonds et
  galerie, en mode local (sans compte), comme l'extension. Les icônes viennent du service
  Google puis de la pastille lettre (une page web ne peut pas lire les autres sites) ; la
  recherche web passe par Google.
- Les données de l'application web sont dans IndexedDB ; deux onglets ouverts se tiennent
  à jour l'un l'autre sans recharger (`BroadcastChannel`).
- **Firebase Hosting** (`firebase.json`) : réécriture vers `index.html`, cache long des
  fichiers versionnés, en-têtes de sécurité et Content-Security-Policy (scripts du site
  seulement). Déploiement : `npm run deployer:pwa`.
- Réglages → À propos, dans l'application web sur ordinateur : lien « Installer
  l'extension Chrome ». Les réglages propres à l'extension (autorisations des sites,
  curseur à l'ouverture d'un onglet, guide de mise à jour) n'y apparaissent pas.
- FAQ du site : Safari peut effacer les données d'un site peu visité ; le compte Google les
  protège.

### Modifié

- Couche plateforme : chaque cible ne contient que la sienne (résolue au build) et déclare
  ses **capacités** ; l'interface lit ces capacités au lieu de tester la cible. ESLint
  interdit `chrome` en dehors de `src/platform/extension.js`. Le stockage (état,
  préférences, opérations en attente, copies de sécurité) est un code commun aux deux
  plateformes. Détail : `docs/plateformes.md`.
- Tests : `npm run test:cibles` lance toute la suite pour l'extension puis pour
  l'application web.

## [2.13.1] - 2026-10-25

### Modifié

- La liste des photos ne s'étale plus dans le panneau Réglages : le panneau montre la
  photo choisie, son crédit et un bouton « Parcourir la galerie ». Les photos s'ouvrent
  dans une fenêtre à part, à gauche du panneau, avec le fond visible derrière pour juger
  chaque photo ; un clic l'applique aussitôt et la fenêtre reste ouverte. Échap, la croix
  ou un clic à l'extérieur la ferment. Sur un petit écran, elle prend tout l'écran.
- Image aléatoire : la catégorie se choisit dans le panneau (liste déroulante).

## [2.13.0] - 2026-10-25

### Ajouté

- **Galerie de fonds d'écran** (Réglages → Apparence → Fond → Image → Galerie) : 173
  photos libres de droits (licence Unsplash gratuite, aucune « Unsplash+ »), choisies à la
  main et rangées en 10 catégories : Nature, Tech, Romance, Villes, Espace, Mer, Montagne,
  Minimaliste, Animaux, Art abstrait. Le catalogue est livré avec l'extension : pas de
  clé d'API, pas de quota, aucun coût Firebase.
- **Photo à la taille de l'écran** : chaque appareil demande la photo déjà recadrée au
  format et à la définition de son écran (au plus 3840 px), jamais l'image entière pour
  n'en montrer qu'une partie. Elle est gardée en cache : les onglets suivants s'ouvrent
  sans réseau, même hors ligne. Seules la photo affichée et la suivante sont conservées.
- **Image aléatoire** dans une catégorie ou dans toutes, à la fréquence choisie : à chaque
  nouvel onglet (la photo suivante est préparée à l'avance), chaque jour (la même sur
  tous les appareils toute la journée), ou au clic sur « Une autre image ».
- Crédit du photographe sous la galerie, avec lien vers la photo sur Unsplash.
- Le choix (photo, ou mode aléatoire avec sa catégorie et sa fréquence) est synchronisé,
  sauvegardé et exporté ; les images ne sont jamais stockées dans Firebase. Voile et flou
  s'appliquent aussi aux photos de la galerie. L'import de sa propre image reste dans
  « Mes images ».

### Corrigé

- Glisser une tuile juste après une modification venue d'un autre onglet ou d'un autre
  appareil : le redessin de la grille au moment de l'appui faisait perdre le glisser. Il
  attend désormais le relâcher.

## [2.12.1] - 2026-10-25

### Modifié

- Les pages de l'accueil occupent 90 % de la largeur de la fenêtre au lieu d'une colonne
  de 960 px ; la barre de recherche garde sa largeur, centrée. L'affichage en défilement
  vertical ne change pas.

## [2.12.0] - 2026-10-25

### Modifié

- **Pages de l'accueil comme dans Infinity** : les pages sont maintenant enregistrées. Une
  tuile glissée sur la page 2 y reste, même si la page 1 garde une case libre ; une tuile
  posée sur la page vide après la dernière ouvre une nouvelle page à elle seule. Sur une
  page pleine, la tuile déposée entre et la dernière de cette page passe à la suivante.
  Supprimer une tuile ne fait pas remonter les pages suivantes ; une page vidée disparaît ;
  « Annuler » remet la tuile sur sa page. Alt + flèches passent aussi d'une page à l'autre.
- **Grille lignes × colonnes** (Réglages → Apparence → Lignes par page, Colonnes par page),
  4 × 8 par défaut, la même sur tous les appareils : sur un écran plus petit, les tuiles
  rétrécissent au lieu de changer de page. Réduire la grille fait passer le surplus de
  chaque page sur la suivante.
- Les pages et la grille font partie des réglages synchronisés : mêmes pages sur tous les
  appareils, dans les sauvegardes et dans l'export. Format des données : deux champs
  ajoutés aux réglages (`grilleAccueil`, et `pagesAccueil` seulement quand les pages ne
  sont pas le découpage simple) ; aucune migration, les données existantes gardent le même
  affichage. Mettre à jour NedoTab sur tous les appareils : une version plus ancienne
  affiche les pages à sa façon.
- Le réglage « Colonnes » (propre à l'appareil) ne concerne plus que l'affichage en
  défilement vertical.

## [2.11.1] - 2026-10-25

### Corrigé

- Glisser une tuile vers une autre page : la tuile semblait revenir à sa place. Elle était
  bien déplacée, mais une page qui n'a pas de place devant elle (la page qui ne contient
  que « + », ou la page vide de fin) la met à la fin de la liste, qui peut se trouver sur
  la page précédente, et l'affichage restait sur l'autre page. Après un dépôt, la page où
  la tuile se trouve vraiment s'affiche et la tuile s'illumine brièvement.
- Pendant un glisser, la tuile n'apparaît plus après le « + » : il reste toujours la
  dernière case.

## [2.11.0] - 2026-10-25

### Ajouté

- **Accueil en pages**, comme Infinity : chaque page montre autant de sites que l'écran
  peut en afficher sans défiler (colonnes × lignes, recalculé au redimensionnement et au
  zoom), les suivants passent sur la page d'après. La page n'a plus de barre de
  défilement. Les pages sont une simple vue : la grille reste une seule liste, rien n'est
  enregistré (ni synchronisé, ni sauvegardé, ni exporté), un nouvel onglet s'ouvre
  toujours sur la page 1.
- **Changer de page** : molette ou balayage du trackpad (une page par geste, l'inertie du
  trackpad est absorbée), Page Suivante / Page Précédente, Ctrl + Début / Fin, flèches du
  clavier qui passent d'une page à l'autre, Alt + flèches qui emmènent une tuile sur la
  page voisine. Ctrl + molette reste le zoom de Chrome ; la molette ne change pas de page
  au-dessus d'une fenêtre de dossier, des réglages ou des résultats de recherche.
- **Indicateur de pages** en bas : un point par page (le point actif s'allonge), cliquable,
  sur une pastille translucide lisible sur tous les fonds ; version « ‹ 3 / 14 › »
  au-delà de 10 pages ; masqué quand il n'y a qu'une page.
- **Glisser entre les pages** : pendant un glisser, des zones apparaissent aux bords gauche
  et droit ; y maintenir la tuile fait monter une lumière le long du bord puis tourne la
  page (0,6 s, puis toutes les 0,9 s). Au bord droit de la dernière page, une page vide
  temporaire permet de placer la tuile à la fin. Survoler un point de l'indicateur mène
  aussi à sa page. La création de dossier (site sur site) et le rangement dans un dossier
  fonctionnent sur toutes les pages ; pas de dossier créé sous une zone de bord.
  Échap pendant un glisser annule et revient à la page de départ.
- Après l'ajout d'un site, on est conduit à la page qui le contient, focus dessus.
- Réglage **Affichage de l'accueil** (Réglages → Apparence) : Pages (par défaut) ou
  Défilement vertical, propre à cet appareil, appliqué sans recharger.

### Corrigé

- Curseur dans la recherche (2.10.7) : seul un onglet qui vient d'être ouvert est
  remplacé ; une page NedoTab atteinte depuis une autre page du même onglet ne l'est plus.

## [2.10.7] - 2026-10-25

### Ajouté

- À l'ouverture d'un nouvel onglet, le curseur est placé dans la recherche NedoTab au lieu
  de la barre d'adresse de Chrome : on peut taper tout de suite. Chrome garde toujours sa
  barre pour lui sur une page « Nouvel onglet » ; l'extension remplace donc aussitôt cette
  page par une copie qu'elle ouvre elle-même (`newtab.html?focus=1`, même position, même
  groupe d'onglets). Conséquence : la barre de Chrome affiche l'adresse de NedoTab. Ni
  rechargement ni retour arrière ne déclenchent de nouveau remplacement. Aucune permission
  ajoutée.
- Réglage **Curseur dans la recherche NedoTab** (Réglages → Apparence → Nouvel onglet),
  activé par défaut, propre à cet appareil (non synchronisé) : désactivé, le curseur reste
  dans la barre d'adresse de Chrome comme avant.

## [2.10.6] - 2026-10-25

### Ajouté

- Réglage **Ouvrir les recherches web dans un nouvel onglet**, synchronisé comme celui des
  sites : une recherche lancée depuis la barre (Entrée sans site trouvé, ou « Rechercher
  sur le web ») s'ouvre dans un nouvel onglet avec le moteur habituel. Ctrl+Entrée et le
  clic molette ouvrent toujours un nouvel onglet. Les deux interrupteurs sont regroupés
  dans la section « Ouverture des liens » (Réglages → Apparence).

## [2.10.5] - 2026-10-24

### Modifié

- Carte du compte plus sobre : l'état de synchronisation devient une simple ligne avec un
  point coloré sous l'e-mail, et les actions (« Restaurer la copie », « Se déconnecter »,
  « Synchroniser » s'il y a lieu) forment une barre en bas de la carte, en parts égales,
  au lieu de pastilles empilées. Le libellé complet reste au survol.

## [2.10.4] - 2026-10-24

### Modifié

- Cliquer en dehors du panneau Réglages le ferme. Ce clic ne fait rien d'autre (aucun site
  ouvert par erreur). Les fenêtres ouvertes depuis le panneau (confirmation, aperçu),
  les messages en bas de l'écran et les menus ne le ferment pas.

## [2.10.3] - 2026-10-24

### Ajouté

- Réglage **Ouvrir les sites dans un nouvel onglet** (Réglages → Apparence → Sites),
  synchronisé avec le compte : les icônes de la grille et des dossiers, et les sites choisis
  dans la recherche, s'ouvrent dans un nouvel onglet et la page NedoTab reste ouverte.
  Désactivé par défaut ; la clé `nouvelOnglet` n'est enregistrée que lorsqu'il est activé,
  les réglages existants ne changent donc pas.

## [2.10.2] - 2026-10-24

### Modifié

- Panneau Réglages redessiné : feuille flottante translucide qui laisse voir le fond, avec
  une carte du compte en tête dessinée sur une copie floutée de votre propre fond d'écran
  (mise à jour en direct quand vous le changez), et un état de synchronisation lisible
  d'un coup d'œil (« Synchronisé », « Pas encore synchronisé »).
- Le contenu est rangé en quatre onglets (Apparence, Sauvegardes, Données, Avancé) au lieu
  d'une longue liste ; le dernier onglet ouvert est retenu sur cet appareil. Flèches
  gauche/droite pour passer d'un onglet à l'autre.
- « Supprimer mon compte » est replié au bas de l'onglet Données, à côté de l'export.
- Animations : entrée du panneau en glissé puis carte, onglets et contenu posés tour à
  tour, curseur d'onglet qui glisse, contenu qui arrive du côté de l'onglet choisi, sortie
  courte, zone de suppression qui se déplie. Tout est coupé si le système demande moins
  d'animations.

## [2.10.1] - 2026-10-24

### Modifié

- Un seul bouton en haut à droite au lieu de deux : connecté, l'avatar du compte ouvre les
  réglages et porte un petit engrenage dans le coin inférieur gauche (l'indicateur de
  synchronisation reste dans le coin inférieur droit) ; sans compte, l'engrenage seul.

## [2.10.0] - 2026-10-24

Dernière version de la V2 : chacun garde le contrôle complet de ses données.

### Ajouté

- **Exporter mes données** (Réglages → Mes données), avec ou sans compte : un fichier
  `nedotab-AAAA-MM-JJ.json` avec la grille, les réglages et, en mode compte, les sauvegardes
  (option cochée par défaut). Icônes importées incluses telles quelles.
- **Télécharger mes fonds d'écran** en `.zip` (fonds du compte et image de cet appareil),
  sans dépendance ajoutée (archive non compressée : les images le sont déjà).
- **Importer un fichier** : validation stricte avant toute modification (format, version,
  adresses — `javascript:` et `data:` refusés —, icônes PNG/WebP/JPEG de 16 Ko au plus,
  titres de 200 caractères au plus, taille, fichier de plus de 5 Mo refusé sans être lu).
  La première erreur est expliquée avec sa ligne (« Ligne 45 : adresse refusée
  (javascript:) »). Aperçu avec les différences, puis :
  - **Remplacer** : copie de sécurité d'abord, comme une restauration, avec « Annuler » ;
  - **Fusionner** : les sites absents sont ajoutés dans un dossier « Importé le JJ/MM/AAAA »,
    avec de nouveaux identifiants, doublons ignorés, « Annuler » possible.
    Les sauvegardes contenues dans le fichier ne sont jamais importées.
- **Supprimer mon compte** (Réglages → Compte, zone séparée) : explication, export proposé,
  saisie de « SUPPRIMER », reconnexion Google, puis suppression **côté serveur** par une
  Cloud Function (`supprimerMonCompte`, europe-west1) : document, sauvegardes, fonds
  d'écran, puis le compte Google de NedoTab en dernier. Cet appareil repasse en mode local
  (copie des sites gardée à la demande), copies de sécurité et cache effacés. En cas
  d'échec, rien n'est supprimé localement.
- Lien « Vos données et la confidentialité » dans la section Compte.

### Site vitrine

- Politique de confidentialité réécrite d'après le code (brouillon à relire par le
  propriétaire avant publication) ; FAQ : export, suppression du compte, Brave et Edge.

### Tests

- Export puis import (Remplacer) : état identique ; Fusionner : nouveaux ids, doublons
  ignorés, action rejouable ; 20 fichiers invalides refusés ; archive ZIP vérifiée.
- Émulateurs (Auth, Functions, Firestore, Storage) : compte avec grille, 3 sauvegardes et
  2 fonds entièrement supprimé, autre utilisateur intact, appel sans connexion ou avec une
  connexion ancienne refusé.
- Navigateur : « mes données » 13/13 (sans compte), « suppression » 13/13 (émulateurs).

## [2.9.3] - 2026-10-24

### Corrigé

- Glisser une icône sur une autre pour créer un dossier (ou la déposer dans un dossier) :
  il fallait viser le centre exact de la cible avec le pointeur. Ce qui compte maintenant,
  c'est l'icône glissée elle-même : la cible a une zone de capture (son icône + 25 % de
  marge), et la tuile dont la zone contient le plus de l'icône glissée (au moins 30 %)
  devient la cible après 0,5 s. Une fois visée 0,2 s, la grille ne se réorganise plus sous
  l'icône (la cible ne s'enfuit plus). Un passage rapide sur les tuiles réorganise toujours.
- Le dépôt était annulé au lâcher même quand le halo était affiché.
- Réglages ouverts pendant qu'un autre appareil ou onglet change le fond : le panneau du
  fond (couleurs, dégradés…) suit maintenant le type choisi.

### Tests

- Navigateur : icône attrapée par un coin et décalée de 60 % sur la cible → dossier créé ;
  panneau du fond qui suit un changement venu d'un autre onglet. 361 tests unitaires.

## [2.9.2] - 2026-10-24

### Corrigé

- Menu « ⋯ » (et clic droit) d'un site dans un dossier ou un sous-dossier : il s'ouvrait
  derrière la fenêtre du dossier et n'était pas cliquable. Il est maintenant placé dans la
  fenêtre ouverte et affiché au premier plan (popover).

### Tests

- Navigateur : « menu ⋯ dans un dossier au premier plan », « Échap ferme le menu, la
  fenêtre du dossier reste ouverte ».

## [2.9.1] - 2026-10-24

### Corrigé

- Connexion Google dans **Brave, Edge et Opera** : ces navigateurs n'ont pas le compte
  Google intégré de Chrome. Une fenêtre Google classique s'ouvre (client OAuth « Application
  Web », jeton d'identité vérifié par un nonce). Google Chrome garde sa connexion intégrée.
- Icônes venues du cache d'icônes du navigateur : sur un autre appareil ou navigateur (où le
  site n'a jamais été visité), le globe générique est remplacé par l'icône du service de
  Google, ou par la pastille avec la lettre.
- Icônes par le service de Google : un sous-domaine inconnu essaie ses domaines parents
  (`console.cloud.google.com` → `cloud.google.com`).
- Premier vrai projet Firebase (`nedotab-app`, alias `prod`) ; les émulateurs utilisent
  toujours le projet local de démonstration, même si `.env.local` contient le vrai.

### Tests

- 354 tests unitaires (détection du navigateur, URL et réponse de la fenêtre Google, nonce,
  domaines parents). Navigateur : vérification « icône du cache d'un autre navigateur ».

## [2.9.0] - 2026-10-24

### Modifié

- **Plus aucune modification perdue entre deux appareils.** Chaque changement local devient
  une opération dans une file gardée sur l'appareil (`chrome.storage.local`, une file par
  onglet). 1,5 s après le dernier, une **transaction** lit la version en ligne, y rejoue les
  opérations avec le même réducteur que l'interface et écrit le résultat (révision + 1) :
  ce qui a été fait ailleurs entre-temps n'est plus écrasé.
- L'état affiché est toujours la dernière version connue du compte avec les opérations en
  attente rejouées par-dessus : un changement d'un autre appareil apparaît tout de suite
  sans effacer les modifications locales pas encore envoyées.
- Hors ligne, aucune transaction n'est tentée : la file attend le retour du réseau. Une
  file laissée par un onglet fermé (ou Chrome fermé hors ligne) est reprise par l'onglet
  suivant et envoyée. Échec d'envoi : nouvel essai après 1 s, 2 s, 4 s… (60 s au plus).
- Déplacer un élément vers un dossier supprimé ailleurs le place à la fin de son dossier
  d'origine ; créer un dossier avec des sites supprimés ailleurs n'inclut que ceux qui
  restent ; tout rejeu impossible est ignoré, jamais bloquant.
- Règles Firestore : une écriture doit dépasser la révision en ligne (une ancienne écriture
  « aveugle » est refusée).
- La restauration vide la file des opérations antérieures ; la confirmation le signale.

### Ajouté

- Toast « 2 modifications n'ont pas pu être appliquées car les éléments ont été modifiés
  sur un autre appareil » avec « Détails » (« Renommer « GitHub » → ignoré, site supprimé
  ailleurs »). Aucun toast quand tout a été appliqué.
- Réglages propres à l'appareil, jamais envoyés et marqués « Sur cet appareil
  uniquement » : nombre de colonnes forcé de l'accueil (Auto, 4 à 8) et journal de
  débogage dans la console. Thème, fond, bibliothèque, voile et flou restent synchronisés.

### Tests

- Déterminisme de chaque action (rejouée deux fois), table de robustesse, 6 scénarios de
  conflit, propriété « deux appareils, deux ordres de rejeu » (aucune exception, aucun id
  dupliqué, profondeur respectée).
- Émulateurs : deux transactions lancées en même temps → les deux modifications présentes ;
  renommage d'un site supprimé ailleurs signalé ; écriture à révision dépassée refusée.
  67 tests sur les émulateurs, 343 tests unitaires.
- Navigateur : 149/149 sans émulateurs ; 101/101 avec les émulateurs, dont le scénario
  « conflits » 16/16 (deux ordinateurs, l'un hors ligne, toast et détails, thème
  synchronisé, colonnes locales, file reprise après fermeture hors ligne).
- Corrigé : le scénario « sauvegardes » comptait aussi la liste des copies locales (V2.8).

## [2.8.0] - 2026-10-24

### Ajouté

- Restauration d'une sauvegarde depuis Réglages → Sauvegardes → « Aperçu » : en-tête (date,
  appareil, nombre de sites et dossiers), **différences avec maintenant** (« +3 sites,
  −12 sites, 4 déplacés », listes des sites qui reviennent, disparaissent, sont déplacés ou
  renommés), contenu en arbre repliable, puis « Restaurer cette version » avec confirmation.
- Jamais sans copie de sécurité confirmée : une sauvegarde « avant restauration » est
  d'abord enregistrée en ligne (10 gardées) ; si elle échoue, rien n'est modifié.
- La restauration est écrite en ligne aussitôt (sans regroupement) et propagée aux autres
  appareils ; toast « Version du 18/10 restaurée — Annuler » pendant 10 s (sans nouvelle
  copie de sécurité), puis retour possible plus tard depuis « Avant la restauration du … »,
  mise en évidence dans la liste.
- Sauvegardes d'un schéma ancien migrées avant l'aperçu ; d'une version plus récente :
  restauration désactivée et expliquée. Hors ligne : restauration désactivée.
- Fond d'écran supprimé depuis la sauvegarde : fond « aucun » et message.
- « Copies sur cet ordinateur » (copies de sécurité locales) : même aperçu, même restauration,
  aussi sans compte.

### Tests

- 278 tests (différences sur 3 niveaux, restaurer puis annuler identique, schéma ancien,
  version future, échec de la copie de sécurité, hors ligne, mode local, fond supprimé).
- Émulateurs : 62/62, dont la séquence complète sauvegarde → modifications → restauration
  écrite en ligne → annulation.
- Navigateur : 149/149 sans émulateurs ; 85/85 avec les émulateurs (scénario restauration
  9/9 : aperçu, confirmation, annuler, retour depuis « avant restauration », hors ligne).

## [2.7.0] - 2026-10-24

### Ajouté

- Sauvegarde automatique du compte : au plus une par jour, une fois la synchronisation
  établie, vérifiée au plus une fois par heure et par appareil (plusieurs onglets ne
  multiplient pas les requêtes) ; jamais pour une grille vide ni pour une grille identique
  à la dernière (empreinte stable) ; 30 gardées (rotation).
- Sauvegarde manuelle nommée (« Sauvegarder maintenant », nom facultatif de 60 caractères
  au plus), jamais effacée automatiquement ; 50 au plus, avec un message clair au-delà.
- Réglages → **Sauvegardes** : liste par date décroissante (date et heure locales, type,
  nom, appareil, nombre de sites et de dossiers), filtre Toutes / Automatiques / Manuelles,
  pages de 20, suppression d'une sauvegarde manuelle avec confirmation. Sans compte : « Connectez-vous pour activer les sauvegardes automatiques. »
- Règles : nom, appareil, compteurs et types vérifiés à la création ; index composite
  (type, date) versionné dans `firestore.indexes.json`.

### En attente du propriétaire

- Déployer l'index avec les règles quand le projet existera.

### Tests

- 264 tests (empreinte, décision de sauvegarde, rotation 35 + 5 → 5 supprimées, identifiant,
  nom, date).
- Émulateurs : 61/61, dont une seule automatique par jour, grille vide ignorée, rotation à 30
  avec manuelle intacte, limite de 50, pages de 20, nom de 200 caractères refusé.
- Navigateur avec émulateurs : 76/76, dont 10 vérifications de sauvegardes (automatique après la synchro,
  une seule pour 4 onglets, manuelle nommée, liste, filtre, suppression).

## [2.6.0] - 2026-10-24

### Ajouté

- Fonds d'écran sur le compte (Firebase Storage, `users/{uid}/fonds/`) : bibliothèque de
  10 fonds au plus dans Réglages → Apparence → Image (vignettes, « 4 / 10 fonds »), envoi
  avec barre de progression et « Annuler l'envoi », fond actif synchronisé sur tous les
  appareils.
- Image préparée sur l'appareil (2 560 px, WebP) et refusée au-delà de 5 Mo, comme les
  règles ; la bibliothèque n'est mise à jour qu'une fois le fichier envoyé.
- Cache local par identifiant (IndexedDB) : chaque fond n'est téléchargé **qu'une fois par
  appareil** (avec le SDK, jamais l'adresse de téléchargement en fond de page) ; affiché
  hors ligne ; purgé quand il quitte la bibliothèque.
- Suppression d'un fond : retiré aussitôt, « Annuler » pendant 5 s, fichier effacé de
  Storage seulement ensuite. Fond actif supprimé → fond « aucun ».
- Fichiers orphelins (envoyés mais absents de la bibliothèque) signalés avec « Nettoyer ».
- Fond image propre à l'appareil (V1.9) : proposition de l'envoyer sur le compte ; s'il
  reste local, il garde la priorité sur cet appareil.

### Corrigé

- Première synchronisation : un compte sans site mais avec des réglages (bibliothèque de
  fonds) n'est plus écrasé par un ordinateur vide ; « Garder ceux de cet ordinateur » garde
  la bibliothèque du compte.

### Tests

- 253 tests (bibliothèque : 11ᵉ fond refusé, suppression du fond actif, purge du cache,
  priorité du fond local, validation au chargement).
- Émulateurs : 54/54, dont envoi avec progression, liste et suppression dans Storage,
  dossier d'un autre et plus de 5 Mo refusés, annulation d'envoi, réglages du compte gardés
  à la première synchronisation.
- Navigateur avec émulateurs : 66/66, dont 14 vérifications de fonds (fichier dans Storage, fond sur le
  second ordinateur, onglets suivants et hors ligne depuis le cache, aucun nouveau
  téléchargement, 10 / 10, suppression différée).

## [2.5.0] - 2026-10-24

### Ajouté

- Mode hors ligne complet en mode compte : cache persistant de Firestore (IndexedDB),
  partagé par tous les onglets ouverts (`persistentMultipleTabManager`).
- Les modifications faites hors ligne sont confiées à la file d'attente de Firestore :
  gardées même si l'onglet ou Chrome est fermé, envoyées automatiquement au retour du réseau.
- Indicateur « ○ Hors ligne — vos modifications seront envoyées au retour du réseau »,
  calculé à partir du navigateur **et** de l'origine des données (cache), jamais affiché
  comme une erreur ; puis ⟳ et ✓ au retour.
- Déconnexion avec des modifications non envoyées : « Des modifications n'ont pas encore
  été envoyées. Se déconnecter quand même ? » ; sans copie locale, le cache de Firestore est
  aussi effacé.

### Remarque

- Deux appareils modifiés hors ligne en même temps : la dernière écriture arrivée gagne
  (conflits traités en V2.9).

### Tests

- 243 tests, dont la table des 8 cas de l'indicateur (en ligne × cache × envoi en attente).
- Émulateurs : 47/47, dont une écriture hors ligne mise en file puis reçue par le serveur.
- Navigateur avec émulateurs : coupure réseau, 3 ajouts et 2 déplacements hors ligne,
  avertissement à la déconnexion, onglet fermé puis rouvert hors ligne (modifications
  présentes), retour du réseau (modifications sur le serveur, ✓), 4 onglets sans
  `failed-precondition`.

## [2.4.0] - 2026-10-24

### Ajouté

- Synchronisation en temps réel : en mode compte, le document du compte est écouté
  (`onSnapshot`) ; un changement fait sur un autre ordinateur apparaît en quelques secondes
  et met aussi à jour le cache local.
- Écritures regroupées (1,5 s après la dernière action), une seule à la fois, immédiates à
  la fermeture ou au masquage de la page ; compteur de révision.
- Pas d'écho ni de ping-pong : nos propres écritures en attente et nos échos sont ignorés,
  un changement reçu ne déclenche jamais d'écriture, un état identique ne redessine rien.
- Les modifications locales pas encore envoyées sont rejouées sur le changement reçu.
- Fermeture pendant un envoi : l'appareil s'en souvient et envoie son état au démarrage
  suivant, avant d'écouter le compte (la modification n'est jamais écrasée).
- Indicateur sur l'avatar : ✓ synchronisé, ⟳ envoi en attente, ⚠ erreur (message au survol,
  « Réessayer » au clic) ; messages dédiés pour accès refusé et quota atteint.
- Taille du document surveillée (limite Firestore 1 Mo) : affichée dans Réglages →
  Stockage, avertissement à 800 Ko, import d'images d'icônes bloqué à 950 Ko.

### Mesures (émulateurs)

- 150 déplacements en 20 s → 1 écriture ; changement visible sur l'autre ordinateur en
  ~1,6 s (dont 1,5 s de regroupement). Lectures : un écouteur par onglet en mode compte.
- Conflit de deux écritures simultanées : la dernière gagne (traité en V2.9).

### Tests

- 234 tests (regroupement 20 actions → 1 écriture, échos, changement distant sans écriture,
  état identique, indicateur, accès refusé, envoi au démarrage, taille UTF-8).
- Émulateurs : 46/46, dont deux appareils : réception en moins de 2 s, aucun ping-pong,
  rejeu des changements en attente, fond image jamais envoyé.
- Navigateur avec émulateurs : 41/41, dont deux ordinateurs (ajout, déplacement,
  suppression, réorganisation intense, 3 onglets et une écriture, fermeture puis
  réouverture) ; sans émulateur : 149/149.

## [2.3.0] - 2026-10-24

### Ajouté

- Première synchronisation à la connexion (ou « Synchroniser maintenant »), sans perte
  possible :
  - rien des deux côtés : le document du compte est créé ;
  - sites sur cet ordinateur seulement : ils sont envoyés (« Vos 42 sites sont maintenant
    sur votre compte ») ;
  - sites sur le compte seulement : ils sont récupérés ;
  - sites des deux côtés et différents : fenêtre « Des sites existent déjà sur votre
    compte » avec nombres de sites et dossiers, dates et aperçu des icônes ; choix entre
    garder ceux du compte, garder ceux de cet ordinateur (le compte est d'abord
    sauvegardé, type « avant-restauration ») ou **fusionner** (mis en avant : les sites de
    cet ordinateur absents du compte vont dans « Importé de cet ordinateur — JJ/MM/AAAA »,
    sans doublon d'adresse, dossiers trop profonds aplatis). Annuler = rester en local.
- Copie de sécurité de l'état local avant toute étape (3 gardées) et « Restaurer la copie
  de cet ordinateur » dans Réglages → Compte.
- Mode compte : chaque modification locale est aussi écrite en ligne, regroupée 1,5 s
  après la dernière action ; seuls les champs autorisés par les règles sont envoyés.
- Déconnexion : « Garder une copie de vos sites sur cet ordinateur ? » (Oui par défaut ;
  Non vide la grille, utile sur un ordinateur partagé).
- Schéma 2 : `reglagesAppareil` (propres à l'appareil, jamais envoyés) reçoit le fond
  image local ; migration 1 → 2 testée.
- Identifiant d'appareil persistant (`majPar`), indicateur « Synchronisation… » sur
  l'avatar, erreurs réseau : retour en mode local avec « Réessayer ».

### Remarques

- La réception des changements faits sur un autre appareil arrive en V2.4.
- La page Confidentialité du site sera réécrite en V2.10 (données envoyées au compte).

### Tests

- 222 tests (comparaison, migration 1 → 2, réglages de l'appareil ; la fusion est testée sur les émulateurs).
- Émulateurs : 42/42, dont les 4 cas de première connexion et les 3 choix, Annuler,
  données d'une version future non écrasées, écritures regroupées, double clic, déconnexion
  et restauration de la copie.
- Navigateur avec émulateurs : 29/29, dont deux « ordinateurs » sur le même compte (envoi,
  champs autorisés seulement, modification envoyée, fenêtre de choix, fusion sans doublon,
  déconnexion sans copie) ; sans émulateur : 149/149.

## [2.2.0] - 2026-10-24

### Ajouté

- Règles Firestore par chemin explicite : chacun ne lit et n'écrit que `users/{son uid}`
  et ses sauvegardes ; forme du document vérifiée (champs autorisés, types, heure serveur,
  1 000 éléments au premier niveau) ; une sauvegarde ne se modifie jamais ; `config/` en
  lecture seule pour les connectés ; `users/{uid}/prive/**` et tout le reste refusés.
- Règles Storage : fonds d'écran dans `users/{uid}/fonds/` seulement, 5 Mo au plus,
  WebP, JPEG ou PNG.
- App Check prêt pour la PWA (reCAPTCHA Enterprise, mode surveillance), jamais activé dans
  l'extension ; jeton de debug réservé au développement avec les émulateurs.
- Arborescence des données de référence et décisions App Check dans `docs/firebase.md`.

### En attente du propriétaire

- Déploiement des règles (`npm run deployer:regles`) une fois le projet créé ; App Check :
  enregistrer l'application Web, laisser le suivi des métriques non bloquant.
- La conclusion App Check pour l'extension est à revérifier dans la documentation Firebase
  à jour (recherche impossible pendant cette version).

### Tests

- 218 tests (+ App Check : jamais dans l'extension, jeton de debug seulement en dev).
- Émulateurs : 30/30, dont 28 cas de règles positifs et négatifs (propriété, champs
  inconnus, types, heure serveur, 1 001 éléments, sauvegardes immuables, `prive/` fermé
  même au propriétaire, `config/`, Storage : 1 Mo accepté, 6 Mo, HTML, SVG, dossier d'un
  autre et anonyme refusés).

## [2.1.0] - 2026-10-24

### Ajouté

- Connexion et déconnexion Google dans l'extension : jeton fourni par Chrome
  (`chrome.identity.getAuthToken`, permission `identity`), session Firebase
  (`firebase/auth/web-extension`), gardée par Firebase entre les redémarrages.
- Réglages → section **Compte** : bouton « Se connecter avec Google » (logo officiel local),
  puis photo ou initiale, nom, e-mail et « Se déconnecter » ; petit avatar à côté de
  l'engrenage quand on est connecté.
- Démarrage rapide : un indicateur local dit si un compte était connecté. Sans lui,
  Firebase n'est **jamais** chargé ; avec lui, l'avatar s'affiche aussitôt et la session est
  restaurée en arrière-plan, sans fenêtre.
- Fenêtre de connexion fermée : aucun message. Navigateur sans `chrome.identity` :
  « La connexion n'est disponible que dans Google Chrome pour l'instant. » Autre erreur :
  message et « Réessayer ».
- `client_id` OAuth injecté au build depuis `.env.local` ; identité de test avec les
  émulateurs.

### Corrigé

- La vérification « aucun code distant » signalait à tort des méthodes nommées `eval`
  dans le SDK Firebase ; seul l'`eval` global est désormais refusé (testé).

### En attente du propriétaire

- Écran de consentement OAuth (Externe, puis En production), client OAuth « Extension
  Chrome », fournisseur Google dans Firebase : procédure dans `docs/firebase.md`.

### Mesure

- Firebase (Auth, Firestore, Storage) forme un fichier séparé de 470 Ko, chargé seulement
  à la connexion ; la page reste à 117 Ko de JavaScript.

### Tests

- 214 tests (service de compte : démarrage sans Firebase, connexion, annulation,
  navigateur non compatible, déconnexion).
- Émulateurs : 4/4 (règles fermées, connexion/déconnexion et uid stable via l'émulateur Auth).
- Navigateur avec l'émulateur : 14/14 (aucun fichier Firebase sans compte, connexion,
  avatar, session restaurée au rechargement sans fenêtre, utilisateur présent dans Auth,
  déconnexion) ; sans émulateur : 149/149.

## [2.0.0] - 2026-10-24

### Ajouté

- Socle Firebase : SDK modulaire installé par npm (aucun code distant), initialisé une seule
  fois (`src/firebase/app.js`) et chargé **à la demande** (`src/firebase/charger.js`) :
  un utilisateur sans compte ne télécharge jamais Firebase.
- Configuration par variables d'environnement (`.env.example` → `.env.local`), avec une
  erreur lisible qui nomme la variable manquante.
- Émulateurs Auth, Firestore et Storage (`npm run emulateurs`) sur un projet local
  `demo-nedotab` ; `firebase.json`, `.firebaserc`, règles Firestore et Storage
  **entièrement fermées** en attendant la V2.2.
- `npm run test:regles` : tests des règles sur les émulateurs (lecture et écriture
  refusées, connecté ou non) ; `npm run deployer:regles`.

### En attente du propriétaire

- Création du projet Firebase (eur3), plan Blaze, budget et alertes, connexion de la CLI,
  déploiement des règles : procédure détaillée dans `docs/firebase.md`. Rien n'a été créé,
  facturé ni déployé.

### Mesure

- `dist/extension` : 586 Ko (dont cartes de sources) ; aucun fichier Firebase n'est inclus
  tant qu'aucune fonction de compte ne le demande.

### Tests

- 207 tests (+ configuration Firebase) ; règles : 2/2 sur les émulateurs.

## [1.11.0] - 2026-10-24

### Ajouté

- Site vitrine (`site/`, build séparé vers `dist/site/`) : Accueil, Installation, Mise à
  jour, Questions fréquentes, Confidentialité, Mentions légales. Polices système, aucun
  script, police, cookie ou traceur de tiers ; clair et sombre ; responsive.
- Guide d'installation pas à pas (bouton « Copier » pour `chrome://extensions`, capture
  annotée de la page des extensions, dépannage) et guide de mise à jour qui avertit de ne
  pas supprimer l'extension. Liste des versions générée depuis ce CHANGELOG.
- Captures réelles de l'extension (`npm run captures`), sites génériques uniquement.
- Téléchargement servi par le site, avec version, taille et empreinte SHA-256.
- `npm run publier` : build, vérification du code distant, zip contrôlé (manifeste à la
  racine, bonne version), copie dans le site, build du site. Rien n'est mis en ligne.
- Réglages → À propos : version installée, liens « Site du projet » et « Guide de mise à
  jour ».

### Décisions en attente (plan V1.11)

- Domaine et hébergement du site : adresse GitHub Pages du dépôt utilisée par défaut,
  hébergeur marqué « à confirmer ».
- Emplacement des zips : servis par le site, comme dans la pratique décrite par le
  propriétaire.
- Mentions légales : éditeur et contact affichés « À COMPLÉTER » (`site/site.config.js`).

### Tests

- 204 tests, dont les liens du site et la conversion du CHANGELOG (HTML échappé).
- Site dans Chrome : 17/17 — 6 pages (langue, titre unique, textes alternatifs,
  description, hiérarchie des titres), aucun défilement horizontal à 390 px, aucune
  requête vers un domaine tiers, console propre, bouton de téléchargement, et mise à jour
  simulée depuis le zip du site (même identifiant, nouvelle version, sites conservés).
- Lighthouse n'a pas été lancé (outil non installé) : à faire à la mise en ligne.

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
