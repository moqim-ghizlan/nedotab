# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage sémantique.

## [5.10.0] - 2026-11-05

### Ajouté

- **Charte d'utilisation (V5.10)** : affichée avant la première activation (proxy ou profil WireGuard), à accepter une fois ; version et date gardées côté serveur. Refusée = rien d'activé. *Texte à relire et valider par le propriétaire avant publication.*
- **Surveillance de disponibilité** : toutes les 10 minutes, un compte technique (limite 1 Go, sans profil WireGuard) ouvre un tunnel par le proxy ; 3 échecs de suite = alerte, retour = fin d'alerte. L'écran du propriétaire affiche « Serveur : en ligne / hors ligne depuis HH:MM ».
- **Rotation des secrets** : nouveaux mots de passe pour tous et recréation de tous les profils WireGuard (écran du propriétaire, avec confirmation), script `migrer-cle-vpn.mjs` pour changer `VPN_CLE_CHIFFREMENT`. Procédures dans `docs/rotation.md`.
- **Serveur** : `audit.sh` (audit en lecture seule), `22-sauvegarde.sh` / `sauvegarder.sh` (archive chiffrée `age`, hebdomadaire), `restaurer.sh`, `RECONSTRUIRE.md`.
- Site : section « VPN privé (sur invitation) » dans la politique de confidentialité (**brouillon à relire**) et rappel des permissions ajoutées sur la page de mise à jour.
- Documents : audit, checklist V5 (domaines 25 à 33), liste de bugs, idées dans `brainstorm.md`.

### Pas encore fait (conditions de clôture de la V5)

L'audit, la checklist sur les vrais appareils, la reconstruction chronométrée, l'essai réel des rotations et la relecture de la charte et de la confidentialité par le propriétaire. **La V5 n'est donc pas marquée terminée dans `roadmap.md`.**

## [5.9.0] - 2026-11-05

### Ajouté

- **Suivi du trafic par ami (V5.9)** : le propriétaire voit, dans Réglages → VPN, le volume du mois de chaque invité (proxy et WireGuard), sa limite, son état, son dernier jour d'activité, et le total du serveur avec une barre vers la limite gratuite d'Oracle (10 To par mois) et un graphique par jour. **Des volumes seulement : jamais un site visité.**
- **Limites mensuelles par invité** (50 Go par défaut, modifiable, ou illimité) : à 80 % l'invité est prévenu, à 100 % son accès est coupé jusqu'au 1er du mois suivant ; le client WireGuard est **désactivé**, pas supprimé.
- **Couper maintenant / Rétablir** (effet en moins de 2 minutes) et **coupure de sécurité** du serveur à 95 % du trafic gratuit (invités suspendus, propriétaire épargné ; désactivable).
- L'invité voit « Ce mois-ci : 12,4 Go sur 50 Go » et ce que le propriétaire peut voir.
- Serveur : journal Squid réduit à « compte octets » (aucune destination), agent de rapport toutes les 15 minutes, tâche quotidienne (remise à zéro mensuelle, suppression des chiffres de plus de 12 mois). Jours et mois en heure de Paris.

### À faire avant utilisation

Déployer les nouvelles fonctions, lancer `21-rapport.sh` sur le serveur et mettre à jour `vpn-wg-agent` (champ `actif`), avec votre accord. Les vérifications manuelles du plan ne sont pas faites.

## [5.8.0] - 2026-11-05

### Ajouté

- **Configuration WireGuard en un clic (V5.8)** : Réglages → VPN → « VPN pour tout l'appareil (WireGuard) » (extension et web app, pour les invités). Guide en 4 étapes, **QR code généré sur l'appareil** (bibliothèque `qrcode`, aucun service en ligne), affiché flouté jusqu'à « Révéler », masqué après 60 secondes ou dès qu'on quitte l'écran.
- Fichier `.conf` : « Télécharger le fichier de configuration » (ordinateur) ou « Ouvrir dans WireGuard » (partage système sur iPhone / iPad), nommé d'après le profil, jamais l'e-mail.
- **Recréer mon profil** : l'ancien profil est supprimé du serveur (il cesse de marcher), un nouveau est créé.
- Fonctions `vpnObtenirProfilWireGuard` (10 appels par jour) et `vpnRecreerProfil` ; le journal ne contient jamais la configuration. L'agent du serveur gère la recréation.
- La configuration (qui contient une clé privée) n'existe qu'en mémoire pendant l'affichage : jamais écrite dans un stockage, une sauvegarde, un export ou un journal.
- Dépendances : `qrcode` (génération) et `jsqr` (tests : relecture du QR).

### À faire avant utilisation

Déployer `vpnObtenirProfilWireGuard` et `vpnRecreerProfil`, puis mettre à jour l'agent sur le serveur (`vpn-wg-agent`). Les essais sur un vrai iPhone et un ordinateur ne sont pas faits.

## [5.7.0] - 2026-11-05

### Ajouté

- **WireGuard sur le serveur (V5.7)** : wg-easy 15.5.0 (Docker, image épinglée), interface d'administration et API sur `127.0.0.1` seulement (tunnel SSH), UDP 51820, DNS Quad9, routage complet, `Endpoint` = le domaine.
- **Un profil par invité, automatique** : l'agent `vpn-wg-agent` crée le profil à l'invitation, le supprime (connexion coupée) au retrait, et dépose la configuration **chiffrée** dans Firebase (`vpn/config/profils/{uid}`), prête pour la récupération par l'invité (V5.8). Nom de profil neutre, jamais l'e-mail.
- **Isolement** : un invité ne peut joindre ni les autres invités, ni le réseau interne d'Oracle, ni le serveur.
- Fonctions `vpnAgentProfils` et `vpnAgentDeposerProfil` (même jeton que la synchro des comptes) ; `vpnAgentSynchro` est inchangée.

### À faire avant utilisation

Déploiement des fonctions, ouverture d'UDP 51820 chez Oracle et lancement de `20-wireguard.sh` : avec votre accord. Les vérifications manuelles du plan (profil, iPhone, isolement, interface fermée) ne sont pas faites.

## [5.6.0] - 2026-11-05

### Ajouté

- **Règles par site (V5.6)** : Réglages → VPN → « Règles par site ». Deux modes : « tout par le VPN, sauf ces sites (en direct) » ou « seulement ces sites par le VPN ». Liste éditable, ajout depuis les sites de la grille, un domaine couvre ses sous-domaines (200 par liste au plus).
- Fenêtre de la barre d'outils : « Ce site passe par le VPN / est en direct (règle) » et boutons **Toujours en direct** / **Toujours par le VPN** pour l'onglet actif (l'onglet est rechargé).
- Les règles sont synchronisées entre vos ordinateurs (`reglages.vpn`, exportées avec les réglages) ; l'état actif et les identifiants restent propres à chaque appareil. Une règle modifiée ailleurs réapplique le proxy.
- Script de proxy (PAC) généré par l'extension : domaines validés strictement puis insérés en JSON, aucune fonction qui résout un nom (pas de fuite DNS), pas de connexion directe de secours. Sans règle utile, le proxy simple est conservé.
- Le test de connexion ignore les services mis en direct par vos règles et le dit, au lieu de mesurer votre adresse normale.

## [5.5.0] - 2026-11-05

### Ajouté

- **Protection contre les fuites (V5.5)** : quand le VPN est actif, WebRTC n'utilise plus de connexion directe (`disable_non_proxied_udp`) et la prédiction réseau de Chrome est coupée ; les deux réglages sont **rendus** à la désactivation, à l'oubli des identifiants et à la déconnexion. Si une autre extension contrôle WebRTC, rien n'est forcé et un avertissement s'affiche.
- Exclusions du VPN limitées au réseau local : noms sans point, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.1`, `[::1]` (la box et les appareils du domicile restent accessibles).
- Page **Tester les fuites** (Réglages → VPN) : adresse vue par les sites, candidats WebRTC, politique WebRTC et contrôle du proxy lus dans Chrome, lien vers un test DNS public.
- Texte « Ce que le VPN fait et ne fait pas » (non anonyme, Chrome seulement, visioconférences possiblement dégradées).
- Serveur : script `serveur/scripts/30-dns.sh` (résolveur Quad9 / Cloudflare via systemd-resolved), **à lancer avec votre accord**.
- Nouvelle permission `privacy` (avertissement de Chrome à la mise à jour).

### À vérifier à la main

Les tests réels (WebRTC, DNS, QUIC, box, visioconférence) ne sont pas encore faits : voir `docs/tests/fuites-vpn.md`.

## [5.4.0] - 2026-11-05

### Ajouté

- **Indicateur de connexion VPN (V5.4)** : la fenêtre de la barre d'outils et Réglages → VPN affichent ce que les sites voient vraiment : pays (nom + drapeau), adresse IP, votre adresse habituelle (masquée par défaut, gardée **sur cet ordinateur** seulement), latence moyenne de 3 requêtes et date de la dernière vérification. Pastille verte (vérifié), orange (non confirmé / ancien), rouge (échec).
- Bouton **Tester** : étapes ✓ / ✗ (serveur, connexion chiffrée, identifiants, site public, adresse vue) avec une explication et une action (Réessayer, Rafraîchir mes identifiants, Désactiver). Test automatique à l'activation ; vérification légère toutes les 15 minutes et au changement de réseau, **seulement** tant qu'une page de l'extension est ouverte (aucun minuteur dans le service worker).
- **Alerte « votre trafic ne passe pas par le VPN »** (badge rouge « ! ») quand les sites voient votre adresse habituelle alors que le VPN est actif.
- Réglages → VPN : historique des 10 derniers tests (local seulement).
- Services d'écho publics sans clé ni traceur : Cloudflare (`/cdn-cgi/trace`), repli `api.country.is`.

## [5.3.0] - 2026-11-04

### Ajouté

- **VPN dans l'extension (V5.3)** : un interrupteur Activer / Désactiver dans la fenêtre de la barre d'outils et dans Réglages → VPN fait passer tout Chrome par le serveur. Le mot de passe du proxy est fourni automatiquement, sans fenêtre de connexion, et seulement au serveur du projet.
- Service worker d'extension : l'authentification et la reprise de l'état fonctionnent même sans page NedoTab ouverte, y compris après un redémarrage de Chrome.
- Badge de l'icône : « ON » (actif), « ! » (serveur injoignable). En cas de panne, Chrome n'ouvre **aucune** page en direct et le VPN n'est jamais désactivé automatiquement ; identifiants refusés plusieurs fois : le VPN s'arrête avec un message.
- Options : « Aussi en navigation privée », « Rafraîchir mes identifiants », « Oublier mes identifiants sur cet ordinateur ». La déconnexion et la suppression du compte arrêtent le VPN et effacent les identifiants locaux.
- Si une autre extension ou une politique contrôle déjà le proxy, le VPN ne s'active pas et l'explique.
- **Nouvelles permissions** (avertissement de Chrome à la mise à jour) : `proxy`, `webRequest`, `webRequestAuthProvider`, plus l'accès aux sites demandé à la première activation. Expliquées dans la page Installation du site.
- Aucun VPN dans l'application web (capacité `vpnNavigateur: false`).

## [5.2.1] - 2026-11-04

### Corrigé

- **Réglages → VPN** : après s'être invité soi-même (ou s'être retiré l'accès), « Mon accès » est relu au lieu de rester sur l'ancien état.
- **Nouveau mot de passe** : un message « Génération… » s'affiche tout de suite (le premier appel peut prendre plusieurs secondes), puis le nouveau mot de passe apparaît sans recharger la page ; en cas d'erreur l'écran est rétabli.

### Ajouté

- Icône de l'onglet VPN dans les réglages.

## [5.2.0] - 2026-11-04

### Ajouté

- **Accès VPN réservé aux invités (V5.2)** : le propriétaire (rôle `admin`) invite par adresse e-mail dans Réglages → VPN ; chaque invité reçoit ses propres identifiants proxy (compte et mot de passe de 32 caractères) à sa connexion, avec un e-mail **vérifié** obligatoire.
- **Fonctions** `vpnInviter`, `vpnRevoquer`, `vpnListeInvites`, `vpnObtenirAcces`, `vpnRegenererMotDePasse` et `vpnAgentSynchro` ; données dans `vpn/**` (aucun accès depuis le navigateur), mots de passe chiffrés et empreintes bcrypt, 30 demandes par jour et par utilisateur.
- **Agent du serveur** (`serveur/agent/`, timer d'une minute) : lit la liste des comptes actifs avec un jeton secret, sans clé Firebase sur le serveur ; la liste actuelle est conservée en cas de panne ou de réponse invalide. Retrait d'un invité effectif en 2 minutes au plus.
- **Écran Réglages → VPN** : l'invité voit « Accès accordé » et affiche ses identifiants (masqués après une minute) ; le propriétaire gère la liste.
- Scripts `functions/scripts/definir-admin.js`, `initialiser-config-vpn.js` et `serveur/scripts/20-agent.sh`.

### Modifié

- La suppression d'un compte retire aussi son accès VPN.
- Squid : cache d'authentification ramené à 30 secondes (retrait d'accès rapide).

## [5.1.0] - 2026-11-04

### Ajouté

- **Proxy HTTPS du VPN (V5.1)** : Squid sur le port 443, certificat Let's Encrypt renouvelé automatiquement, authentification obligatoire (empreintes bcrypt).
- **Règles** : destinations internes et privées interdites, ports 80 et 443 seulement, aucun en-tête révélant l'IP du client.
- **Vie privée** : aucun journal d'accès (pas de destinations, pas de sites).
- **Scripts** `10-proxy.sh`, `compte-ajouter.sh` (mot de passe de 32 caractères affiché une fois), `compte-retirer.sh`, et test `serveur/tests/tester-proxy.sh`.

### Notes

- Squid choisi plutôt que Caddy (module expérimental, mots de passe sans empreinte) : voir `docs/decisions.md`.
- Limite connue : sans identifiants, le serveur répond 407 et révèle qu'il est un proxy.

## [5.0.0] - 2026-11-04

### Ajouté

- **Serveur VPN gratuit (V5.0)** : machine Oracle Always Free (ARM, Francfort, Ubuntu 24.04), IP réservée, domaine DuckDNS.
- **Scripts idempotents** dans `serveur/scripts/` : base et utilisateur d'administration, SSH par clé uniquement avec fail2ban, pare-feu ufw (seul le port 22 ouvert), mises à jour de sécurité automatiques, script d'état.
- **Documentation** `serveur/README.md` et skill `serveur-vpn` ; script `npm run lint:serveur` (shellcheck).

## [4.31.1] - 2026-11-04

### Ajouté

- **Sélecteur de dossier en arbre** (T1) : « Déplacer vers… » et l'emplacement du popup d'ajout affichent l'arbre des dossiers (chevrons, guides, recherche avec surlignage, fil d'Ariane, clavier, dossiers interdits grisés avec la raison).
- **Aperçu du contenu des dossiers** (T2) : dans « Déplacer vers… », un panneau montre le contenu du dossier choisi. En glissant une icône, un dossier s'ouvre après 600 ms de survol (anneau de progression) pour la déposer dans un sous-dossier sans lâcher ; la fenêtre ouverte ainsi se ferme si on en sort.
- **Galerie de l'espace de partage** (T6) : bouton « Ouvrir la galerie » au pied du panneau, galerie plein écran groupée par date (filtres, recherche, sélection multiple avec suppression, prolongation et téléchargement en lot) et visionneuse avec panneau de détails et menu « ⋯ ».
- **Les plus utilisés sur l'accueil** (T7) : bande de pastilles rondes au-dessus de la barre de recherche (le nom apparaît au survol), à activer dans les réglages (4, 6, 8 ou 10 sites).
- **Réglage « Activer l'espace de partage »** (T8) : désactivé, le bouton, le panneau et la galerie disparaissent et plus aucune requête n'est faite.
- **Chatbot : un interrupteur et trois emplacements** (T9) : bouton de l'accueil, recherche améliorée par l'IA, bouton de la fenêtre de l'extension.

### Modifié

- **Formulaire « Ajouter un site »** (T3) : aperçu de la tuile en direct, cartes, labels flottants, alerte de doublon avec deux actions, bouton IA, pied collant ; popup de l'extension plus large (480 px).
- **Espace de partage** : on peut prolonger la durée d'un élément depuis « Modifier » (T4, jamais plus court que l'actuelle) ; cartes plus lisibles, titre, ligne du fichier, description et pastille d'expiration (T5).

### Corrigé

- Une collision de noms de classes CSS étirait la galerie de fonds d'écran des Réglages.

### Non fait / limites connues

- T11 (tokens CSS communs, tests visuels complets) non fait. Le raccourcissement d'une durée de partage reste refusé par les règles Firestore.

## [4.31.0] - 2026-11-03

### Ajouté

- **Espace de partage** : le bouton **Prolonger** existe aussi sur les fichiers (les règles l'acceptaient déjà).
- **Signalement d'un lien public** : chaque signalement écrit un journal d'erreur `SIGNALEMENT_LIEN_PARTAGE` (nombre de signalements et suspension, jamais le lien ni l'adresse). Une alerte Cloud Monitoring sur ce journal prévient le propriétaire par e-mail (réglage dans la console, voir `docs/decisions.md`).
- **Fenêtre de l'extension** : quand l'IA demande de se connecter, bouton « Ouvrir NedoTab pour vous connecter ».

### Modifié

- **Vault** : la liste des mots de passe courants refusés passe d'environ 150 à plus de 250 entrées.
- Les points de la V4 gardés volontairement tels quels sont documentés dans `docs/decisions.md`.

### Non fait / limites connues

- Les vérifications manuelles de la V4 (iPhone, iPad, déploiement, alerte e-mail) restent à faire : voir `docs/tests/v4-restant.md`.

## [4.30.0] - 2026-11-02

### Modifié

- **Espace de partage redessiné** : panneau flottant (PC, tablette) ou plein écran qui monte du bas (téléphone), avec ouverture et fermeture animées. Un seul « composeur » : le texte, puis fichier / coller / titre et le bouton **Envoyer** ; dessous, la durée (« Supprimer après ») en sélecteur compact et la pastille **Chiffrer**. Titre et description repliés derrière « Titre ». Cartes calmes : carré d'icône (texte, lien, fichier ou miniature, vault), pied avec date, appareil et échéance, **Copier / Ouvrir** (ou **Voir / Télécharger**) visibles et le reste (épingler, lien public, prolonger, partager, supprimer) dans un tiroir « ⋯ ». Un élément envoyé « tombe » dans la liste. Icônes dessinées à la place des emojis. Quota sous le titre.
- **Réglages réorganisés** en 8 rubriques : **Compte** (carte du compte, export / import, confidentialité, suppression), **Apparence** (thème, fond, animations), **Accueil** (disposition, icônes, titres, dossiers, horloge et recherche, sites fréquents), **Général** (liens, comportement, rangement, historique d'utilisation), **Partage** (durée par défaut, vault, entretien), **Sauvegardes**, **IA**, **Avancé**. PC : liste à gauche avec un résumé du compte. Téléphone et fenêtre étroite (moins de 720 px) : liste des rubriques avec leur contenu, puis la rubrique glisse par-dessus avec un bouton retour. Curseurs avec leur valeur (%, px), mention « Cet appareil » plus discrète, listes déroulantes harmonisées, actions du compte qui passent à la ligne.
- **Assistant redessiné** : panneau flottant, en-tête à icônes (nouvelle conversation, historique, fermer), petit robot qui cligne des yeux et « réfléchit » pendant la réponse, messages qui apparaissent, réponse sans bulle avec l'avatar du robot, tableaux et listes plus lisibles, champ arrondi avec bouton rond (flèche, carré pour arrêter). Conversation vide : accueil et 3 questions d'exemple (faites sur l'appareil à partir de vos tags, jamais envoyées) qui partent d'un toucher.
- **iPhone** : la feuille de l'assistant suit le clavier pendant toute son ouverture (position relue à chaque image pendant 0,7 s, page remise en haut si iOS la fait défiler) ; plus de clavier qui s'ouvre tout seul à l'ouverture ni après chaque réponse.

### Corrigé

- **Fenêtre de l'icône** : s'affiche tout de suite (le stockage n'est lu qu'au clic sur « Ajouter ce site »), « Remplir avec l'IA » attend la session (plus de « Connectez-vous »), l'éditeur d'icône retrouve son style, l'icône est en mode Automatique par défaut, et un site ajouté en étant connecté est envoyé au compte (file d'opérations) au lieu de disparaître à la prochaine synchro.

### Non fait / limites connues

- Clavier de l'iPhone non vérifié sur un vrai appareil (pas de Mac ni d'iPhone dans l'environnement de test) : à confirmer via `https://<projet>.web.app`.
- Animations d'ouverture et de fermeture par `@starting-style` / `transition-behavior: allow-discrete` : Chrome 117+ et Safari 17.5+ ; ailleurs le panneau apparaît sans animation.

## [4.29.2] - 2026-11-02

### Corrigé

- **Espace de partage** : fermer l’aperçu d’une image ne ferme plus aussi le panneau.

## [4.29.0] - 2026-11-02

### Ajouté

- **Bouton de l'extension** : un clic sur l'icône NedoTab ouvre une fenêtre de 360 px avec deux choix, **Ajouter ce site** et **Ouvrir le chat** (flèches / Entrée, onglet affiché en haut, lien « Ouvrir NedoTab »). L'onglet actif est lu **une seule fois** à l'ouverture.
- **Formulaire d'ajout** pré-rempli (nom, adresse, emplacement avec chemin « Travail › Clients » et recherche dès 8 dossiers, tags, description). Icône et titre trouvés en arrière-plan (jamais bloquant). Dernier dossier utilisé mémorisé sur l'appareil. Bandeau « Déjà dans … » (Modifier / Ajouter quand même). Pages refusées avec explication : `chrome://`, `file://`, Web Store, nouvel onglet. Enregistrement **immédiat** dans le stockage (la fenêtre se ferme dès qu'elle perd le focus) ; un onglet NedoTab ouvert recharge le changement et fusionne ses propres modifications en attente (mécanisme existant).
- **Remplir avec l'IA** (seulement au clic) : nouvelle fonction `iaProposerSite` — titre (60 caractères, sans HTML ni adresse), 3 à 8 tags, description et **dossier existant**. La grille est lue côté serveur ; dossiers et sites exclus de l'IA (V4.20) absents du prompt ; page sensible = aucun extrait ; sortie validée (dossier inconnu → accueil), une relance puis « réponse invalide » ; mêmes quota, consommation, modèle (« tags ») et cache que les tags. Seuls les champs non touchés sont remplis ; **Annuler**, **Régénérer**, rien n'est enregistré sans « Ajouter » ; les propositions gardées telles quelles sont marquées « ia ok » (pas de second appel).
- **Chat sur place** : panneau latéral Chrome (`sidePanel.open` appelé directement dans le clic) affichant la page NedoTab avec l'assistant ouvert (`newtab.html?panneau=chat`) : même compte, même historique. Sans `sidePanel` : le chat s'ouvre dans un onglet NedoTab.
- **Permissions ajoutées (visibles à la mise à jour de l'extension)** : `activeTab` (adresse et titre de l'onglet cliqué) et `sidePanel` (panneau du chat). Ni `tabs` ni `<all_urls>`.
- **Tests** : onglets acceptés / refusés, liste des emplacements (limite de 3 niveaux), dossier disparu, doublon en profondeur, fusion IA sans écraser un champ touché ; sortie IA (JSON, balises de code, invalide, dossier inconnu ou piégé, titre long ou avec HTML / adresse) ; fonction (prompt sans dossier exclu ni identifiant réel, consigne cachée sans effet, page sensible sans extrait, relance, cache, entrée invalide) ; fenêtre (pré-remplissage, page refusée, ajout dans un sous-dossier écrit aussitôt, doublon, annulation, `sidePanel` présent / absent) ; manifeste (permissions minimales, `popup.html` côté extension seulement).

### Décisions du plan prises par défaut

Panneau latéral pour le chat ; le chat ne lit pas la page ouverte ; dossier par défaut = dernier utilisé ; l'IA ne remplit qu'au clic ; dossiers existants seulement.

### À faire par le propriétaire (déploiement, avec accord)

Déployer les fonctions (`npm run deployer:fonctions`), puis publier la nouvelle `.zip` de l'extension (`npm run package`) et mettre à jour le guide d'installation : Chrome affichera la demande des nouvelles permissions.

### Non fait / limites connues

- **Écart au plan** : la page `chat.html` n'existe pas — le panneau latéral réutilise `newtab.html?panneau=chat` ; pas d'extraction de `formulaireSite.js` (le formulaire de la fenêtre est écrit à part, les dialogues existants sont inchangés) ; la fonction est dans `fonctions.js` (pas de fichier `proposerSite.js` séparé).
- **Pas d'éditeur d'icône** dans la fenêtre (icône automatique du site) ; pas de bouton « Remplir avec l'IA » masqué quand l'IA n'est pas configurée : l'erreur du serveur est affichée ; la connexion Google n'est jamais lancée depuis la fenêtre (non connecté : message d'erreur de l'IA, l'ajout local fonctionne).
- **Synchronisation Firebase** : la fenêtre écrit le stockage local ; l'envoi vers le compte est fait par une page NedoTab (ouverte maintenant, ou au prochain nouvel onglet). Sans page ouverte, l'ajout n'atteint pas l'iPhone avant cela. Non vérifié en conditions réelles.
- **Panneau latéral** : mise en page du chat dans un panneau étroit non vérifiée visuellement (le panneau du chat garde ses dimensions actuelles) ; navigation privée, Brave et Edge non testés ; aucun test manuel du plan n'a été fait. Documents (guide d'installation, `docs/plateformes.md`, politique de confidentialité) à mettre à jour pour `activeTab` / `iaProposerSite`.

## [4.28.0] - 2026-11-02

### Ajouté

- **Liens de partage publics** : depuis un texte ou un lien de l'espace de partage, « Créer un lien » (durée 1 h → 30 j, ouvertures 1 / 5 / 10 / 25 / illimité, mot de passe optionnel avec jauge). Le lien `https://<projet>.web.app/r#<jeton>.<clé>` est affiché une seule fois (Copier / Partager) ; la clé n'est stockée nulle part. « Mes liens » : compteur d'ouvertures, expiration, badges mot de passe / verrouillé, **Révoquer** (annulable 5 s).
- **Chiffrement de bout en bout** : copie chiffrée dans l'appareil (AES-GCM, clé HKDF du lien [+ clé PBKDF2 du mot de passe], AAD = jeton). Le serveur ne reçoit que la copie chiffrée, un hash d'une **preuve** du mot de passe (dérivée autrement que la clé) et les paramètres. L'élément du vault déverrouillé peut être partagé : la copie est rechiffrée avec la clé du lien.
- **Fonctions** (`functions/src/espacePartage/liens/liens.js`) : `creerLienPartage`, `listerLiensPartage`, `revoquerLienPartage` (comptes vérifiés), `ouvrirLienPartage` et `signalerLienPartage` (HTTP publiques, sans compte, même origine via Hosting). Décompte d'ouverture en **transaction**, **reçu de 2 min** (nouvel essai sans recompter), mot de passe vérifié côté serveur (5 essais puis verrouillage), réponse **identique** pour inconnu / expiré / épuisé / révoqué, délai minimal constant de 250 ms sur les échecs, limite de débit par empreinte salée d'adresse (30/min, rotation 10 min, jamais l'adresse en clair), `maxInstances: 5`, **interrupteur d'urgence** `config/partage.liensActifs` (cache 30 s), 20 liens actifs et 10 créations/heure par compte, signalement (3 adresses distinctes → lien suspendu, compte marqué `users/{uid}/prive/partage`). Nettoyage couplé à la fonction planifiée de la V4.27 ; suppression de compte = liens et copies supprimés.
- **Page de réception** (`recevoir.html`, `src/receveur/`, 5 Ko, sans SDK Firebase, sans CDN) : étapes info → Ouvrir (clic obligatoire : les aperçus de messagerie ne consomment pas le lien) → mot de passe → contenu. Fragment effacé de l'URL (`replaceState`), aucun stockage ni cookie, texte via `textContent`, lien jamais cliquable directement (deux clics, http/https seulement), fichier **téléchargé seulement** (type neutre, nom nettoyé), « Signaler ce contenu », états : incomplet, indisponible, mauvais mot de passe (« il reste N essais »), verrouillé, réseau (Réessayer).
- **Hébergement** : réécritures `/r` → `recevoir.html` et `/api/lien/*` → fonctions placées **avant** `**` ; en-têtes stricts (CSP sans `unsafe-inline`, `Referrer-Policy: no-referrer`, `no-store`, `X-Frame-Options: DENY`, `noindex`, `nosniff`) ; la même CSP en `<meta>` dans la page ; service worker : `/r` et `/api` exclus du repli.
- **Règles** : `liensPartage`, `signalements`, `limitesPartage`, `config/partage` fermés à tous les clients (le joker `config/*` ne lit plus que les autres documents) ; `liens/**` fermé dans Storage.
- **Tests** : génération (100 000 jetons distincts), analyse de liens, décisions, chiffrement (autre clé / autre jeton / sans ou avec faux mot de passe), 10 ouvertures simultanées pour 1 → une seule, reçu, réponses identiques, verrou après 5 essais, interrupteur, débit, signalements, limites de création, nettoyage, aucune clé / mot de passe / adresse dans la base, aucun journal dans le module ; page de réception (HTML et `javascript:` en texte, fichier sans aperçu, fragment effacé, pas de stockage, mot de passe) ; règles d'émulateur et en-têtes de `firebase.json`.

### À faire par le propriétaire (déploiement, avec accord)

1. Créer `config/partage` dans la console : `{ liensActifs: true, ouvertA: "liste", createurs: ["<ton uid>"] }` (par défaut **tout est coupé** et réservé à une liste blanche, décision 1 du plan).
2. Déployer dans l'ordre : règles Firestore et Storage → fonctions → Hosting (`npm run deployer:pwa`).
3. Le TTL de `limitesPartage.expireLe` est déclaré dans `firestore.indexes.json` (déployé avec les index) ; `cycle-vie-storage.json` couvre maintenant `partages/` et `liens/` (à réappliquer avec `gcloud storage buckets update`).
4. Alerte de budget Google Cloud (voir V4.25), puis test avec un lien réel sur iPhone et PC.

### Non fait / limites connues

- **Fichiers** : la fonction et la page savent les transporter (5 Mo au plus, et non 10 Mo : la requête d'une fonction appelable est limitée à 10 Mo en base64), mais l'interface propose « Créer un lien » pour les textes et liens seulement.
- Pas de compte de la copie dans le quota de la V4.25, pas de rendu du lien en deux lignes tronquées au milieu, pas de bouton « Signaler » par e-mail (le signalement est en base ; l'alerte e-mail n'est pas faite).
- L'émulateur Hosting n'applique pas les en-têtes personnalisés : l'ordre de priorité entre le bloc `**` et les blocs de `/r` n'a pas pu être vérifié localement (d'où la CSP en `<meta>`). À vérifier après déploiement (`curl -I https://<projet>.web.app/r`).
- L'empreinte d'adresse utilise un sel de projet (variable `SEL_EMPREINTE_PARTAGE` possible), pas un secret Google.
- Tests des fonctions sur une base simulée en mémoire, pas l'émulateur ; test de charge, revue `/security-review` et essai sur iPhone non faits.

## [4.27.0] - 2026-11-02

### Ajouté

- **Expiration de chaque élément** de l'espace de partage : 1 h, 2 h, 1 j, 7 j, 30 j (pas de « jamais », 30 jours de vie au plus, prolongation comprise). Pastilles de durée à l'ajout, durée par défaut dans Réglages → Espace de partage (1 jour, propre à l'appareil), libellé « expire dans 3 h » (orange sous 15 min, rafraîchi toutes les 30 s), action **Prolonger** (« Durée maximale atteinte » au plafond), élément expiré masqué aussitôt côté client. Les fichiers expirent aussi.
- **Horloge** : `expireLe` est borné par les règles ([maintenant + 55 min ; maintenant + 31 j], `creeLe == request.time`) ; l'écart appareil/serveur est appris quand un envoi est confirmé et corrige l'affichage. Aucune règle de lecture basée sur `request.time`.
- **Fonctions planifiées** (`functions/src/espacePartage/`) : `nettoyerEspacePartageProgramme` (toutes les 10 min : lots de 200, verrou léger, fichier puis document, compteurs `nb`/`octets` décrémentés, journal = volumes seulement) et `reconcilierEspacePartageProgramme` (chaque jour 03:30, 50 utilisateurs par passage avec curseur : recompte, fichiers orphelins supprimés, documents sans fichier signalés).
- **Filets de sécurité** : TTL Firestore sur `espacePartage.expireLe` (déclaré dans `firestore.indexes.json`) ; règle de cycle de vie Storage de 40 jours sur `partages/` (`cycle-vie-storage.json`). Index de groupe de collection pour le nettoyage.
- **Migration** : les éléments d'avant la V4.27 restent visibles ; un bandeau propose « Les faire expirer dans 7 jours » (rien n'est supprimé sans accord). Les règles autorisent leur première échéance.
- **Tests** : calculs et bornes, décalages d'horloge de ±3 h, plafond de prolongation, formats ; nettoyage (lot partiel, relance, fichier absent, élément chiffré, verrou, journal) et réconciliation (orphelins, compteurs, plafond par passage) sur une base simulée ; règles d'émulateur (échéance absente/trop proche/trop loin/passée, prolongation, migration, lecture indépendante de l'expiration) ; copie serveur identique.

### À faire par le propriétaire (déploiement, avec accord)

Dans l'ordre : `firebase deploy --only firestore:indexes` → `firestore:rules` → `functions`, puis la configuration Google Cloud :
```
gcloud storage buckets update gs://<bucket> --lifecycle-file=cycle-vie-storage.json
```
(le TTL Firestore est créé par le déploiement des index). Vérifier le nombre de tâches Cloud Scheduler gratuites du projet (2 ajoutées).

### Non fait / limites connues

- La requête d'écoute n'a **pas** de `where('expireLe', '>', …)` : elle exclurait les éléments d'avant la V4.27 (sans champ). Le masquage est fait côté client ; le nettoyage serveur retire les documents.
- Pas d'alerte avant expiration, pas de fondu de 200 ms, pas de message « Cet élément a expiré » pour un élément ouvert (les cartes simplement disparaissent) ; pas de bouton Prolonger sur les fichiers (limite de l'interface actuelle).
- Premier envoi depuis un appareil dont l'horloge est très décalée : l'écart n'est connu qu'après le premier envoi confirmé (une échéance hors bornes est alors refusée par les règles).
- Les tests de nettoyage utilisent une base simulée en mémoire, pas l'émulateur ; vérifications manuelles du plan non faites.

## [4.26.0] - 2026-11-02

### Ajouté

- **Vault** : chiffrement de bout en bout, **sur l'appareil**, des textes et liens de l'espace de partage (contenu **et** titre). Algorithmes : PBKDF2-SHA-256 (600 000 itérations) + AES-GCM 256 (Web Crypto, aucune dépendance), un seul module (`src/core/coffre.js`). Clé du vault (VK) **aléatoire**, enveloppée par le mot de passe et par une **clé de secours** de 24 symboles ; changer le mot de passe ré-enveloppe la VK sans rien rechiffrer. IV neuf à chaque chiffrement, AAD = `uid:id:v` (un contenu copié ailleurs ne se déchiffre pas), VK importée **non extractable**, format versionné (`v1.<iv>.<données>`, base64url). Normalisation NFKC du mot de passe.
- **Interface** : assistant de création en 4 écrans (explication, mot de passe + jauge textuelle, clé de secours affichée une fois, retapage de 3 groupes), déverrouillage (œil, « Mot de passe oublié ? » par clé de secours, délai croissant après 5 erreurs), bandeau « Vault verrouillé / ouvert — se verrouille dans N min », case « Chiffrer (vault) » à l'ajout, cartes 🔒 sans aperçu quand verrouillé, verrouillage automatique (inactivité 5–60 min, onglet caché 5 min, manuel, déconnexion), effacement du presse-papiers 30 s après une copie (sans garantie). Réglages → Sécurité — Vault : changer le mot de passe, régénérer la clé, délai, **détruire** (saisie « DÉTRUIRE »).
- **Règles Firestore** : `users/{uid}/vaultMeta/cle` (propriétaire seul, `create` seulement si absent donc jamais deux VK, champs bornés, `update` limité aux champs d'enveloppe) ; un élément `chiffre: true` doit avoir la forme `v<n>.<iv>.<données>` et un titre vide ; contenu chiffré jusqu'à 110 000 caractères.
- **Tests** : vecteurs PBKDF2 (RFC 7914) et AES-GCM (NIST), allers-retours (vide, emoji, 20 000 caractères, fichier de 25 Mo), mauvais mot de passe / clé, bit modifié, AAD (autre id, autre uid), 10 000 IV distincts, changement de mot de passe, réinitialisation par clé de secours, NFKC, aucune écriture dans localStorage/sessionStorage/console, minuteurs de verrouillage ; règles d'émulateur.
- **RGPD** : l'export contient les éléments chiffrés tels quels (`chiffre: true`) ; la suppression du compte supprime `vaultMeta` ; jamais envoyé à l'assistant IA (l'espace de partage n'est lu par aucun module d'IA).

### Décisions du plan prises par défaut (non posées)

Rien n'est chiffré par défaut (case à cocher) ; déverrouillage non retenu sur l'appareil (option « Rester déverrouillé » non faite) ; verrouillage après 15 min ; noms et titres chiffrés ; mot de passe de 12 caractères ou phrase de 4 mots ; export oui.

### Non fait / limites connues

- **Fichiers chiffrés** : les fonctions (`chiffrerFichier` / `dechiffrerFichier`, testées avec 25 Mo) existent mais **ne sont pas branchées** au bouton « Fichier » ; seuls les textes et liens se chiffrent depuis l'interface.
- Liste des mots de passe courants embarquée : environ 150 entrées (le plan en demandait 200).
- Mesure PBKDF2 sur un iPhone ancien, vérifications sur iPhone/iPad, revue `/security-review` : **non faites**. Les sauvegardes automatiques ne contiennent pas l'espace de partage.

## [4.25.1] - 2026-11-02

### Corrigé

- Visionneuse d'images : bouton de fermeture bien visible (rond de 48 px, sous la barre d'état de l'iPhone), un tap sur l'image ou le fond ferme aussi.
- Miniatures : limite portée de 2 à 8 Mo (les photos d'iPhone font 3 à 6 Mo).
- Ajout de `cors-storage.json` : règle CORS à appliquer au bucket Storage (nécessaire pour l'aperçu et le téléchargement dans le navigateur).

## [4.25.0] - 2026-11-02

### Ajouté

- **Fichiers et images dans l'espace de partage** (extension et PWA) : bouton « 📎 Fichier » (sélecteur ouvert par un vrai clic, photothèque / Fichiers sur iPhone et iPad), **glisser-déposer** sur PC (cadre « Déposer ici » seulement pendant un glissement de fichiers), **coller une image**. Envoi avec progression (`aria-valuenow`), **Annuler**, « Interrompu — Réessayer » (téléphone verrouillé, réseau coupé), deux transferts à la fois au plus.
- **Limites** : 25 Mo par fichier, **200 Mo au total par compte** (compteur `octets` de `espacePartageMeta/usage`, modifié dans le même lot que l'élément ; barre « 38 Mo sur 200 Mo », orange dès 80 %, rouge à 100 %, avec du texte). Types refusés par extension **et** par type MIME : `exe msi bat cmd sh js jar apk dmg scr ps1` (+ `com vbs hta lnk reg`), y compris `photo.jpg.exe`. Zip accepté avec avertissement ; HEIC conservé tel quel.
- **Aucun lien public** : jamais la fonction de lien de téléchargement du SDK (un test vérifie qu'elle n'apparaît nulle part), jamais d'URL stockée. Lecture par `getBlob` (vérifiée par les règles) et URL locale `blob:` révoquée à la fermeture ; contenu gardé en mémoire de la session seulement (60 Mo au plus), jamais sur disque. **SVG et HTML : jamais d'aperçu**, téléchargement seulement, type forcé (`application/octet-stream`). Noms nettoyés (caractères de contrôle et de direction RTL retirés, NFC), chemin `partages/{uid}/{id}/{nom sûr}` (100 caractères, extension gardée), vrai nom conservé dans Firestore.
- **Aperçus** : miniature (images ≤ 2 Mo), icône par famille (PDF, document, tableur, archive, audio, vidéo, autre) quand l'aperçu est impossible (HEIC sur PC), visionneuse d'images (flèches, Échap, pincer pour zoomer), avertissement avant une archive ou un type rare. Téléchargement : feuille de partage iOS (`navigator.share({ files })`) sur écran tactile, sinon `a[download]`, sinon onglet `blob:`.
- **Pas d'orphelin** : le fichier part d'abord, puis **un seul lot** (élément + compteurs) ; si le lot est refusé (espace plein, règles) le fichier est supprimé aussitôt ; une annulation ne laisse ni fichier ni document. « Recalculer le compteur » (Réglages → Espace de partage) fait la **réconciliation** : recompte les éléments et les octets, supprime les fichiers sans élément. « Vider l'espace de partage » supprime aussi les fichiers.
- **Règles** : `storage.rules` (`partages/{uid}/{id}/{nom}` : propriétaire vérifié seul, 25 Mo, types exécutables refusés, jamais modifié, liste réservée au propriétaire) ; `firestore.rules` (type `fichier` avec `taille`, `typeMime`, `chemin` sous `partages/{uid}/`, `octets` en hausse d'exactement la taille, 200 Mo au plus). Tests d'émulateur : autre utilisateur, 25 Mo + 1, types, chemins hors dossier, compte non vérifié, 200 Mo dépassés d'un octet ; **module d'envoi contre les émulateurs** (envoi, suppression, annulation, lot refusé, réconciliation, vidage). **Suppression de compte** : `partages/{uid}/` est supprimé avec le reste (fonction et test d'émulateur). **Export RGPD** : les fichiers sont listés (nom, type, taille), jamais embarqués.
- **Décisions du plan prises par défaut** : 25 Mo / 200 Mo, mêmes types refusés qu'au plan, HEIC gardé, dossier racine `partages/`.
- **À faire par le propriétaire avant le déploiement des règles Storage** : confirmer que le forfait **Blaze** est actif, et **fixer une alerte de budget** (par exemple 5 €) dans la console Google Cloud. Le coût maximal est 200 Mo × le nombre d'utilisateurs.
- **Non fait / limites connues** : règle Storage croisée sur le quota (`firestore.get`, coûteuse et soumise à une autorisation IAM) — le quota est tenu par l'interface et par le lot Firestore, et un utilisateur malveillant pourrait envoyer des fichiers sans élément jusqu'à la réconciliation quotidienne **prévue en V4.27** ; pas d'« Annuler » après la suppression d'un fichier (il est supprimé de Storage) ; pas de bouton Épingler sur les fichiers ; vérifications manuelles du plan (iPhone installé, coupure réseau, console Firebase, alerte de budget) non faites.

## [4.24.0] - 2026-11-02

### Ajouté

- **Espace de partage : texte et liens** entre les appareils d'un même compte (extension et PWA). Bouton ⇄ en bas à gauche (visible seulement avec un compte synchronisé), pastille quand un élément arrive d'un autre appareil depuis la dernière ouverture. Panneau latéral de 380 px sur grand écran (Échap ou clic extérieur ferment, focus gardé dans le panneau), feuille plein écran sur téléphone (zones de sécurité, pas de focus automatique du clavier).
- Chaque élément : aperçu de 2 lignes, domaine pour un lien, « il y a 3 min · depuis iPhone », **Copier** (« Copié ✓ » 1,5 s + retour haptique), **Ouvrir** (liens), **Épingler**, **Supprimer** avec « Annuler » 5 s. « Coller » (lecture du presse-papiers sur geste, repli par collage manuel), « Enregistrer comme lien » proposé mais jamais appliqué seul, **doublon : l'élément existant remonte** en tête. États : vide, chargement (3 squelettes), hors ligne, erreur de lecture (« Réessayer »), limite atteinte, « Voir plus » par 50.
- **Sécurité** : tout est affiché en `textContent` (du HTML collé reste du texte) ; seuls les liens `http:` et `https:` sont cliquables (`javascript:`, `data:`, `file:`… restent du texte), `rel="noopener noreferrer"`. Le contenu n'est jamais envoyé à l'IA (test sur les modules de liste, de chat et les fonctions), ni écrit dans les journaux.
- **Base** : `users/{uid}/espacePartage/{id}` (`type`, `contenu` ≤ 20 000 caractères, `titre`, `appareil`, `epingle`, `creeLe` = heure serveur) et compteur `users/{uid}/espacePartageMeta/usage` (`nb`). Les règles ne savent pas compter : chaque ajout et chaque suppression est **un seul lot** (élément + compteur `increment`), et la règle de création vérifie `nb ≤ 200` et `nb = avant + 1` avec `getAfter`. Tests d'émulateur : autre utilisateur, champ inconnu, `creeLe` falsifié, 201ᵉ élément, compteur incohérent, **deux ajouts simultanés au 200ᵉ (un seul passe)**.
- **Lectures limitées** : un écouteur sur les 50 plus récents, arrêté quand le panneau est fermé **et** l'onglet masqué, relancé au retour.
- **Réglages → Mes données → Espace de partage** : « Vider l'espace de partage » (lots de 400), « Recalculer le compteur ». **Export RGPD** : section `espacePartage` (sans l'id), absente sans réseau ; **sauvegardes : non**. Suppression de compte : la suppression récursive couvre les deux collections (test d'émulateur ajouté).
- **Décisions du plan prises par défaut** : bouton dédié, 20 000 caractères / 200 éléments, doublon remonté, nom d'appareil automatique (type d'appareil), export oui / sauvegardes non.
- **Non fait** : le **menu clic droit « Envoyer vers NedoTab »** (permission `contextMenus`) : elle s'affiche à l'installation et désactive l'extension chez ceux qui l'ont déjà jusqu'à son acceptation ; la décision 4 du plan demande l'accord du propriétaire, elle est donc repoussée (la page NedoTab doit de toute façon faire l'écriture, le service worker n'ayant pas la session). Aussi : nom d'appareil modifiable, vérifications manuelles du plan sur appareils réels.

## [4.23.0] - 2026-11-02

### Ajouté

- **Connexion par e-mail et mot de passe**, en plus de Google, sur l'extension et la PWA (Réglages → Compte) : inscription, connexion, mot de passe oublié, bouton œil, `autocomplete` correct pour les gestionnaires de mots de passe (y compris iPhone), erreurs annoncées (`role="alert"`), « Connexion internet nécessaire » hors ligne. Une seule implémentation partagée (`src/firebase/auth.email.js`, SDK de chaque cible fourni par `#auth`) ; logique pure dans `src/core/authEmail.js`.
- **Décisions du plan prises par défaut** (recommandations) : un seul compte par adresse, mot de passe de **10 caractères** minimum sans règle de complexité, inscription **ouverte à tous**, expéditeur d'e-mails par défaut de Firebase.
- **Vérification obligatoire de l'e-mail** : écran « Vérifiez votre boîte mail » (« J'ai vérifié » recharge l'utilisateur **et** le jeton ; « Renvoyer l'e-mail » limité à 1 par minute). Les règles **Firestore et Storage** exigent `email_verified == true` ; les fonctions d'IA et de vérification des sites aussi (tests d'émulateur : un compte non vérifié n'a aucun accès, même à ses propres chemins).
- **Comptes Google et mot de passe liés** : « Ajouter un mot de passe » (après ré-authentification Google) et « Changer le mot de passe » (après ré-authentification), même `uid` donc aucune donnée ne bouge (testé sur l'émulateur Auth). Le message « Cet email est déjà utilisé avec Google… » guide l'utilisateur.
- **Suppression du compte** : ré-authentification par mot de passe pour un compte e-mail (le mot de passe est demandé, utilisé une fois, oublié) ; Google comme avant sinon.
- **Nettoyage** : fonction planifiée quotidienne `nettoyageComptesNonVerifies` (comptes e-mail jamais vérifiés après 7 jours ; jamais un compte Google ni vérifié).
- Documents : étapes de la console Firebase (`docs/firebase.md`), `docs/securite.md`, contrainte de la V5.2 (invitation VPN : e-mail **vérifié** seulement, comparaison normalisée).
- **À faire par le propriétaire avant le déploiement** : les 4 réglages de la console (voir `docs/firebase.md`) ; sans eux l'inscription par e-mail est refusée (`auth/operation-not-allowed`) et le message l'explique. Déploiement des règles et des fonctions nécessaire.
- **Non fait / à vérifier** : la page de destination du lien de vérification (page Firebase par défaut), les vérifications manuelles du plan (iPhone, extension, e-mails réels), le test de règles VPN (les règles `vpn/*` n'existent pas encore), le plafond Firebase d'envoi d'e-mails.

## [4.22.0] - 2026-11-02

### Ajouté

- **Rangée « Les plus utilisés »** sous la barre de recherche (extension et PWA) : une seule ligne de raccourcis (jusqu'à 8 icônes de 40 px, 3 au minimum selon la largeur, recalculée au redimensionnement avec un délai de 150 ms), y compris vers les sites rangés au fond d'un dossier (infobulle « Travail › Clients »). Ni retour à la ligne, ni défilement horizontal.
- **Choix des sites** (`src/core/frequents.js`, pur) : épinglés d'abord, puis score d'usage (V4.21) ; sites masqués, supprimés ou de score < 0,1 exclus. La rangée n'apparaît qu'avec au moins 10 visites **et** 3 sites éligibles (3 épinglés suffisent). Suivi désactivé : épinglés seulement.
- **Ordre figé** : calculé une fois à l'ouverture de la page, il ne bouge plus quand les statistiques changent ; seuls un site supprimé, renommé, re-iconé, épinglé/désépinglé ou masqué mettent la rangée à jour tout de suite. La rangée vue la dernière fois garde sa place dès le début (pas de saut de mise en page).
- **Interactions** : clic = comme une tuile (onglet courant, Ctrl/Cmd + clic et clic molette = nouvel onglet) et **visite comptée** par le service de la V4.21 ; `Tab` depuis la recherche, `←` `→` `Début` `Fin`, `Entrée`, `↓` depuis la barre vide ; menu (clic droit, touche Menu, appui long sur tactile) : Ouvrir dans un nouvel onglet, Afficher dans la grille, Épingler / Désépingler, **Masquer de cette rangée** (avec « Annuler »), Modifier le site. Aucun glisser-déposer.
- **Réglages → Apparence → « Les plus utilisés »** (synchronisés) : afficher la rangée, petit titre (désactivé par défaut), liste des sites masqués avec « Réafficher » (200 au plus). `reglages.frequents` n'est stocké que s'il diffère des valeurs par défaut (validation idempotente, refus de plus de 200 masqués dans `REGLAGES_MODIFIER`).
- Les pages de l'accueil (V2.11) se recalculent seules : la rangée prend sa place dans la colonne de la page, la hauteur des pages diminue et `mesure.js` (observateur de taille) ajuste les tuiles ; aucune barre de défilement. Paysage de téléphone (hauteur ≤ 480 px) : rangée masquée.
- Quand la rangée est affichée, la barre vide ne propose plus la liste des plus utilisés de la V4.21 (doublon) : `↓` va dans la rangée.
- **Non fait** : retrait automatique des identifiants masqués d'un site supprimé (la fonction `masquesObsoletes` existe mais n'est pas appelée ; ils n'ont aucun effet) ; vérifications manuelles du plan sur PC, iPhone et iPad.

## [4.21.0] - 2026-11-02

### Ajouté

- **Recherche triée par usage** : la pertinence du texte reste prioritaire, un bonus d'usage plafonné (`min(60, 20 × log2(1 + score))`) départage les correspondances proches, les sites **épinglés** passent devant (+1 000). Barre vide au focus : les 8 sites les plus utilisés (épinglés d'abord), rien tant qu'aucune visite n'est enregistrée.
- **Score « fréquence + récence »** (`src/core/usage.js`, pur) : chaque visite ajoute `2^(jours depuis 2026-01-01 / 30)` à une somme stockée par site ; le score actuel est calculé (demi-vie de 30 jours), jamais stocké. Les écritures sont des **incréments atomiques** : aucun conflit entre appareils. `EPOQUE_USAGE` et `DEMI_VIE_JOURS` (`constantes.js`) **ne doivent plus être modifiées**.
- **Base** : document `users/{uid}/stats/visites` (`poids`, `compte`, `derniere`, `majLe`), séparé de la grille ; règle explicite (3 000 entrées max, champs limités, `majLe` = heure serveur) et tests d'émulateur ; couvert par la suppression de compte (test ajouté).
- **Comptage fiable** (`src/ui/services/visites.js`) : tuile (clic, Ctrl/Cmd + clic, clic molette, Entrée), résultat de recherche, carte du chat, « Ouvrir dans un nouvel onglet ». La visite est écrite dans une **file locale durable avant la navigation** (150 ms au plus), puis envoyée en **une seule écriture** au démarrage de la page, toutes les 2 minutes et quand la page est masquée. File vidée seulement après confirmation ; lot « envoyé » vérifié au démarrage suivant (`majLe`) pour ne rien compter deux fois. Anti-doublon de 10 secondes. Hors connexion : stockage local (`visitesLocales`), ajouté à la base à la première synchronisation.
- **Épingler dans la recherche** (menu et feuille d'un site) : champ `epingle` (gardé seulement s'il vaut `true`, comme `iaExclu` en V4.20 — **pas de changement de version de schéma**, écart volontaire avec le plan : une version antérieure ignore simplement le champ).
- **Recherche intelligente** : colonne facultative `usage` (fort / moyen / faible / jamais, précédée de `epingle`) et consigne « à pertinence égale, privilégie… » ; **prompt de recherche version 4**.
- **Réglages → Mes données → Utilisation** : « Mémoriser les sites que j'ouvre depuis NedoTab » (`sansSuiviUsage`), « Partager ma fréquence d'utilisation avec l'assistant IA » (`sansUsagePourIa`), « Effacer l'historique d'utilisation ». Export (`stats`) et import (Remplacer / Fusionner pour les sites déjà présents).
- **Non fait** : nettoyage quotidien des entrées de sites supprimés (elles sont ignorées à la lecture), `onSnapshot` en continu (une lecture à chaque chargement suffit), compte du clic Ctrl/Cmd dans le chat, section de la politique de confidentialité sur l'usage (à ajouter avec la relecture du propriétaire). La vérification manuelle du plan n'a pas été faite sur appareil.

## [4.20.0] - 2026-11-02

### Ajouté

- **Confidentialité de l'IA** (Réglages → Assistant IA → Confidentialité), appliquée **côté serveur** : les fonctions lisent `reglages.ia.confidentialite` dans le document de l'utilisateur, le navigateur ne peut pas envoyer plus.
  - Titres et adresses (sans eux, recherche intelligente, chat avec sites et rangement sont désactivés et expliqués), tags et descriptions, noms de dossiers, lecture du contenu des pages pour les tags, lecture des pages par le serveur (iPhone/iPad), conservation de l'historique (sinon retour à la conversation en mémoire du navigateur, rien n'est écrit).
  - Le cache des tags tient compte du réglage « lire les pages ».
- **« Ne pas montrer à l'IA »** (menu d'un site ou d'un dossier) : `iaExclu: true` sur l'élément ; l'élément et tout le contenu d'un dossier exclu ne figurent dans aucune liste envoyée (recherche, chat, rangement, vérification), n'ont pas de tags générés et sont ignorés par le rattrapage. Validation idempotente (seul `true` est gardé), pas de changement de version de schéma.
- **Effacements** (confirmation, définitifs, export conseillé avant) : historique des conversations, cache IA, statistiques d'usage, tags et descriptions générés (annulable ; ceux écrits à la main sont gardés), clés, ou tout à la fois en désactivant l'IA. Fonction `iaEffacer` ; chaque effacement supprime exactement ce qu'il annonce.
- **Mode sans IA** : plus d'onglet Suggestions dans « Ranger mes sites » (les doublons et la vérification restent), aucun appel.
- **Documents** : section « L'assistant IA » de la politique de confidentialité (**brouillon à relire avant publication du site**), trois entrées de FAQ, modèle de checklist V1–V4 (`docs/tests/checklist-v4.md`, **non exécutée**), `docs/tests/bugs-v4.md`, revue de sécurité (`docs/securite.md`), idées de la V4 dans `docs/brainstorm.md`.
- **Non fait** : la checklist sur PC, iPhone et iPad réels, la relecture de la politique par le propriétaire, la décision sur App Check bloquant, la liste personnalisable des domaines sensibles, le suivi des coûts Firebase sur une semaine.

## [4.19.0] - 2026-11-02

### Ajouté

- **Suivi de la consommation** (Réglages → Assistant IA → « Consommation et limites… ») : appels et jetons d'aujourd'hui, du mois (graphique en barres par jour en SVG, avec valeurs lisibles et tableau par usage), des 11 mois précédents, appels évités par le cache. C'est une **estimation** fondée sur les tarifs publics (date affichée) ; le montant réel est celui du fournisseur.
  - Chaque appel payant (tags, recherche, chat, rangement ; une réponse interrompue est marquée « incomplète ») incrémente `users/{uid}/usage/{AAAA-MM}` avec des compteurs seulement : jamais de question, de message, de titre ni d'adresse. Écriture réservée aux fonctions (règles + tests d'émulateur).
  - **Prix dans `config/ia`** (`prix` par `fournisseur:modele`, `tauxChange`, `majPrix`), saisis par le propriétaire, jamais dans le code. Modèle sans prix : jetons comptés, « coût inconnu ».
  - **Limites personnelles** (jour et mois, en appels ou en euros estimés, synchronisées dans `reglages.ia.limites`) : appliquées côté serveur avant chaque appel payant (`limite-personnelle`), en plus du quota du service. Alerte à 80 % dans l'écran, suspension à 100 %.
  - **Cache des réponses** par utilisateur pour les tags (30 jours) et la recherche intelligente (24 h) : même demande, même grille, même modèle et même prompt = aucun nouvel appel ni quota consommé, comptée dans « appels évités ». Jamais pour le chat. Stocké sous `prive/` (fermé au navigateur), TTL Firestore sur `expireLe`, expiration vérifiée aussi à la lecture. L'IA désactivée ne sert plus le cache.
- Correctif : une limite personnelle en euros très petite n'était pas arrondie à zéro (elle devenait « aucune limite »).
- **Non fait** (écarts avec le plan) : bandeau d'alerte dans le chat et la barre (l'alerte est dans l'écran Consommation), prix personnalisés pour les modèles personnalisés, estimation de coût avant le rattrapage et la vérification.

## [4.18.0] - 2026-11-02

### Modifié

- **IA plus confortable sur iPhone et iPad** (présentation seulement, aucune logique métier).
  - La feuille du chat suit la zone visible du clavier iOS (`visualViewport` : hauteur et décalage, `geometrieFeuille`, fonction pure testée) ; le défilement de la page derrière est bloqué tant que la feuille est ouverte.
  - Le bouton robot se masque en descendant dans la page et réapparaît en remontant (`visibiliteRobot`), sans animation si `prefers-reduced-motion` ; la grille garde une marge basse pour qu'il ne cache pas le dernier rang.
  - Cibles tactiles de 44 px : Envoyer, cases et actions des cartes de proposition, cartes de sites, historique, onglets de « Ranger mes sites ».
- **Non fait dans cette version** (à voir sur appareil réel) : appui long sur une bulle (Partager), balayage pour supprimer dans l'historique, « Voir le résultat » en feuille plein écran, groupes repliables du rangement, rendu incrémental du streaming (aucune lenteur mesurée, donc laissé tel quel pour ne pas risquer le nettoyage DOMPurify). Aucune vérification n'a été faite sur iPhone ou iPad réels.

## [4.17.0] - 2026-11-01

### Ajouté

- **« Ranger mes sites »** (Réglages → Mes données) : doublons, sites qui ne répondent plus et suggestions de rangement. Tout passe par la carte de confirmation de la V4.16 (suppressions listées et décochées, toast « Annuler »). Pas de « Tout appliquer ».
  - **Doublons** (locaux, sans IA, même sans compte) : exacts (même adresse au `www`, schéma, casse et `/` final près) et probables (paramètres de suivi `utm_*`, `fbclid`, `gclid`, `ref`… ignorés). « Garder celle-ci » propose la suppression des autres copies.
  - **Sites qui ne répondent plus** : fonction `iaVerifierSites` (50 sites au plus par appel, adresses lues dans la grille de l'utilisateur côté serveur). Mode léger de `recupererPage` (`sonderSite` : HEAD, repli GET sur l'en-tête seul, mêmes protections anti-SSRF, 5 s, 3 redirections). Statuts : ok, redirigé, introuvable, erreur serveur, injoignable, bloqué (403/429 : rien à conclure), non vérifiable. Quota séparé de 300 vérifications par jour. Un site n'est proposé à la suppression qu'après **deux** constats identiques espacés d'au moins 10 minutes ; une adresse déplacée se met à jour d'un clic. Résultats gardés 7 jours sur l'appareil.
  - **Suggestions** : fonction `iaSuggererRangement` (prompt de rangement v1), réponse en groupes indépendants validés comme les propositions du chat ; jamais de suppression ni d'ajout, 8 groupes et 8 nouveaux dossiers au plus.
  - Écarts avec le plan : portée « accueil » ou « toute la collection » (pas un dossier précis) ; l'aperçu d'un groupe tient compte des groupes déjà appliqués (état courant) mais pas des suivants non appliqués.

## [4.16.0] - 2026-11-01

### Ajouté

- **Actions proposées par l'assistant, avec confirmation** : « crée un dossier Voyage avec mes sites de réservation », « renomme le dossier Dev »… L'assistant propose, rien ne change sans clic.
  - Le modèle termine sa réponse par un bloc JSON (`actions`), jamais affiché. Le serveur le valide strictement (`src/core/outils.js`, 6 outils, 20 actions au plus, références `sN`/`dN`/`nouveau:i` traduites en identifiants réels) et l'enregistre avec un statut (`en_attente`, `appliquee`, `partielle`, `ignoree`).
  - Le navigateur convertit la proposition en actions du store et la simule avec le même réducteur et les mêmes garde-fous que l'interface (`src/core/propositions.js`). Une action impossible est grisée avec sa raison.
  - **Carte** : cases à cocher, suppressions en rouge et décochées par défaut, « Voir le résultat », Appliquer la sélection, Ignorer, toast « Annuler ». Resimulation juste avant l'application ; une proposition ne s'applique qu'une fois, statut synchronisé entre appareils.
  - Règle Firestore : le navigateur ne peut changer que `statutProposition`, une seule fois.
  - Prompt du chat v4. Écart avec le plan : bloc JSON de repli plutôt que l'appel d'outils natif du fournisseur.

## [4.15.0] - 2026-10-31

### Ajouté

- **Historique des conversations synchronisé** : les conversations avec l'assistant sont
  enregistrées dans le compte (`users/{uid}/conversations/{id}` et `.../messages/{id}`) et
  retrouvées sur tous les appareils, en temps réel.
  - **Qui écrit quoi** : le navigateur écrit ses propres messages et renomme ; la fonction
    écrit les réponses (état `ok` ou `interrompu` avec le texte partiel), les compteurs
    (`nbMessages`, `apercu`, `majLe`) et applique les limites. Le texte des réponses est gardé
    avec les identifiants réels des sites (`[[site:<id>]]`, V4.14).
  - **L'historique envoyé au modèle vient du serveur** : `iaChat` et `iaChatFlux` reçoivent
    `{ convId }` et lisent la conversation dans Firestore (messages en erreur ignorés, rôles
    identiques fusionnés, 40 messages / 30 000 caractères au plus). Un faux historique du
    navigateur est refusé.
  - **Règles Firestore** : lecture et suppression par le propriétaire ; création d'une
    conversation et de messages `user` seulement (≤ 4 000 caractères, heure du serveur) ;
    renommage seul ; un message n'est jamais modifié. Tests d'émulateur ajoutés.
  - **Limites** : 100 conversations (les plus anciennes par `majLe` sont supprimées avec leurs
    messages), 200 messages par conversation.
  - **Interface** : bouton « Historique » dans le chat (titre, aperçu, date relative, nombre de
    messages, 20 par page), reprise d'une conversation (50 derniers messages puis « Charger les
    messages précédents »), renommage (crayon), suppression différée de 5 s avec « Annuler »
    (fonction `iaSupprimerConversation`, sans message orphelin). Titre automatique : les 6
    premiers mots de la première question.
  - **Export** : option « Inclure mes conversations avec l'assistant » ; l'import ne les relit
    pas. La suppression du compte les supprime (testé). Politique de confidentialité mise à jour.

### Modifié

- Le chat sans compte ne change pas (l'assistant demande un compte) ; en mémoire seule, le
  panneau garde l'ancien comportement (tests).

## [4.14.0] - 2026-10-31

### Ajouté

- **Le chat connaît vos sites** : l'assistant peut citer les sites enregistrés, qui apparaissent
  comme des **cartes cliquables** (icône, titre, domaine, dossier).
  - **Prompt du chat v3** : une section « Collection de l'utilisateur » (`<sites>…</sites>`,
    présentée comme une donnée) est ajoutée côté serveur ; le modèle cite `[[site:sN]]` sans
    recopier titre ni adresse. Même liste compacte et même pré-filtre que la recherche
    intelligente (basé sur le dernier message au-delà de 400 sites).
  - **Liste jointe seulement quand c'est utile** (`besoinContexteSites`, heuristique pure) :
    « mes sites », « j'ai », « mon dossier », mot d'un titre, d'un domaine ou d'un tag, ou
    suite d'une réponse qui citait déjà des sites. Sinon le prompt ne contient aucune liste
    (levier principal du coût du chat).
  - **Références sûres** : le serveur ne renvoie que les identifiants effectivement cités
    (`sites: { s12: id réel }`, `consulte: true`) ; le navigateur écrit les identifiants réels
    dans la conversation et construit les cartes en DOM, jamais en HTML. Pas de conversion dans
    les blocs de code ; référence incomplète pendant le flux affichée en texte ; identifiant
    inconnu ou site supprimé : « (site introuvable) ».
  - **« Afficher dans la grille »** : ouvre le dossier au bon niveau et met la tuile en évidence 2 s.
  - **Transparence** : « L'assistant a consulté vos sites pour cette réponse » sous la réponse.
  - **Réglage** Assistant IA → « Le chat peut consulter mes sites » : Quand c'est utile
    (défaut), Toujours, Jamais (synchronisé).
  - L'historique renvoyé au serveur remplace chaque référence passée par le titre du site.

## [4.13.0] - 2026-10-31

### Ajouté

- **Barre et chat réunis** : une question posée en mode Demander va au bon endroit.
  - **Routage local** (`src/core/routageQuestion.js`) : « comment… », « explique… », « traduis… »
    ou une question dont aucun mot n’est dans vos sites partent directement au chat, sans appel
    de recherche ; « mon outil de… », « mes sites… » restent une recherche de sites.
  - **Recherche intelligente, prompt v3** : la réponse porte une `intention` (`site`, `question`
    ou `les_deux`) ; une valeur inconnue vaut `site`. `question` ouvre le chat, `les_deux` affiche
    les résultats et ouvre le chat avec une carte « Sites correspondants » (3 au plus).
  - **Une seule conversation** : la question est ajoutée à la conversation en cours, avec la
    mention « depuis la barre de recherche ». Si une réponse est en cours d’écriture, la question
    est mise dans le champ du chat.
  - **« Demander à l’assistant à la place »** sous les résultats de sites ; en cas d’échec du
    routage, repli sur la recherche locale avec ce même choix.
  - **Réglage** Assistant IA → « Quand je pose une question dans la barre » : Automatique,
    Toujours chercher dans mes sites, Toujours ouvrir le chat (synchronisé).

### Corrigé

- Le bouton robot du chat suit maintenant les réglages de l’IA (il restait caché quand les
  réglages arrivaient après l’ouverture de la page).
- Une mise à jour de l’application web est aussi proposée dans la carte du compte des réglages
  (« Mettre à jour »), pour la retrouver après avoir fermé le bandeau.
- Prompt du chat v2 : l’assistant inventait le créateur de NedoTab ; il doit maintenant dire qu’il ne le sait pas.

## [4.12.0] - 2026-10-31

### Ajouté

- **Réponses du chat affichées au fil de l’eau** (streaming). Transport : fonction callable
  `iaChatFlux` (décision dans `docs/decisions.md`) ; `iaChat` reste le repli.
  - Adaptateur Gemini en flux (`envoyerFlux`, analyseur SSE tolérant aux paquets coupés), erreurs
    au milieu du flux, jetons comptés à la fin.
  - Serveur : mêmes validations et quota que `iaChat` (consommé au début), envois regroupés
    toutes les 50 ms, timeout 90 s, requête vers le fournisseur annulée quand le client part.
  - Interface : rendu progressif (Markdown nettoyé à chaque rendu, au plus toutes les 50 ms),
    curseur clignotant, vrai bouton **Arrêter** (« (interrompu) », texte conservé), « Réponse
    interrompue — Réessayer » en cas de coupure, repli automatique sur la réponse complète si le
    flux ne s’ouvre pas. Lecteurs d’écran : pas d’annonce par morceau, une seule à la fin.

## [4.11.0] - 2026-10-29

### Ajouté

- **Fenêtre de chat avec l'assistant** (réponse complète d'un coup ; le streaming arrive en V4.12).
  - **Bouton robot** (icône dessinée pour le projet) en bas à droite, visible si l'IA est activée ;
    `Ctrl/Cmd+I` ouvre et ferme ; hors ligne il reste visible et le panneau le dit ; sans clé, le
    panneau renvoie vers les réglages de l'assistant ; les messages d'information se décalent pour
    ne pas passer sous le bouton.
  - **Panneau** : à droite sur ordinateur et grande tablette (400 px, non modal, la page garde sa
    place à gauche), feuille plein écran sur téléphone (glisser l'en-tête vers le bas pour la
    fermer, suit la hauteur visible quand le clavier s'ouvre). Messages (vous à droite, l'assistant
    à gauche), saisie de 1 à 6 lignes (Entrée envoie, Maj+Entrée = nouvelle ligne ; sur écran
    tactile le bouton envoie), 4 000 caractères au plus (compteur dès 3 500), bouton
    « ↓ Derniers messages » si l'on remonte lire, « Arrêter » pendant l'attente, « Non envoyé —
    Réessayer » en cas d'erreur, « Copier » sur chaque réponse, « Nouvelle conversation »
    (confirmation au-delà de 4 messages), Échap ferme et rend le focus au bouton.
  - **Fonction `iaChat`** : 1 à 40 messages de 4 000 caractères au plus (30 000 au total), le dernier
    de l'utilisateur ; 1 appel du quota par message ; prompt versionné `PROMPT_CHAT_VERSION = 1`,
    température 0,5, 1 000 jetons ; le client écarte les plus anciens messages si besoin. La
    conversation n'est pas gardée (ni côté serveur ni après fermeture : l'historique est la V4.15).
  - **Rendu Markdown sûr** (`marked` + `DOMPurify`, liste blanche stricte, liens http(s) seulement
    en nouvel onglet, jamais d'image, aucun `innerHTML`), documenté dans `docs/securite.md` et testé
    contre les injections.
  - Nouvelles dépendances : `marked`, `dompurify` ; `jsdom` pour les tests (DOMPurify a besoin d'un
    DOM fidèle, ce que happy-dom n'est pas).

## [4.10.0] - 2026-10-29

### Ajouté

- **Explication de chaque résultat de la recherche intelligente** : sous chaque site, une courte
  phrase dit pourquoi il correspond (12 mots au plus, en français, fondée uniquement sur la liste
  de vos sites). Elle vient de la même réponse que le classement : aucun appel de plus, donc
  aucun coût de plus.
  - Prompt de recherche passé en **version 2** (`PROMPT_RECHERCHE_VERSION = 2`) ; jetons de sortie
    portés à 768.
  - Raison nettoyée côté serveur : HTML, adresses et retours à la ligne retirés, 120 caractères au
    plus, coupée proprement. Absente ou inutilisable : le site reste affiché sans raison.
  - Affichage : ligne secondaire en petit gris (une ligne, titre complet en infobulle), faite de
    nœuds texte ; la raison fait partie du nom de l'option pour les lecteurs d'écran.
  - Qualité (aucune raison inventée) : **à vérifier** en rejouant le jeu d'essai de la V4.9 avec une
    vraie clé.

## [4.9.0] - 2026-10-29

### Ajouté

- **Recherche intelligente dans vos propres sites** : en mode « Demander », une question en langage
  naturel (« l'outil pour retoucher des photos ajouté le mois dernier ») renvoie vos sites les plus
  pertinents, classés, dans la même liste que la recherche locale (flèches, Entrée, clic).
  - Nouvelle fonction **`iaRechercher`** : le navigateur n'envoie que la question ; le serveur lit
    la grille, construit une liste compacte (une ligne par site : identifiant court, titre,
    domaine, tags, description tronquée, dossier, mois d'ajout) et ne garde du modèle que des
    identifiants, validés (inventés ou en double retirés, 8 au plus). Température 0, date du jour
    fournie, la liste est présentée comme une donnée (balises `<sites>` neutralisées).
  - Au-delà de **400 sites**, pré-filtre côté serveur : les 150 meilleurs + des sites de chaque
    dossier, 200 lignes au plus.
  - Prompt versionné : `PROMPT_RECHERCHE_VERSION = 1`.
  - Une question = 1 appel du quota quotidien ; collection vide : aucun appel.
  - Chargement avec « Annuler », « Aucun de vos sites ne correspond » + recherche web, erreur :
    message court et **repli automatique** sur la recherche locale. La dernière question reste
    disponible tant que l'onglet est ouvert.
  - Code partagé client / serveur (`listeCompacte`, `preFiltre`), copies vérifiées par les tests.
  - Taux de réussite du jeu d'essai (`docs/tests/recherche-ia.md`) : **à mesurer** avec une vraie
    clé sur 60 sites ou plus.

## [4.8.0] - 2026-10-29

### Ajouté

- **Barre de recherche à deux modes** : « Rechercher » (par défaut, recherche locale) et
  « Demander » (une question pour l'IA). Le traitement de la question n'est pas encore branché
  (« Bientôt disponible », V4.9).
  - Sélecteur loupe / étincelle à gauche du champ (groupe de boutons radio, cibles de 44 px au
    doigt). On revient toujours en « Rechercher » à l'ouverture d'un onglet.
  - Bascule : clic, `?` tapé en premier caractère, `Tab` dans le champ vide, `Ctrl/Cmd+J` ;
    Retour arrière dans le champ vide quitte le mode question. Annonce « Mode question » /
    « Mode recherche » pour les lecteurs d'écran.
  - Mode question : bordure et lueur à la couleur d'accent, texte d'aide dédié, 3 exemples
    cliquables faits localement à partir de vos tags les plus fréquents, « Envoyer » avec Entrée,
    500 caractères au plus (compteur dès 400), touche « Envoyer » du clavier iOS.
  - IA désactivée ou hors connexion au compte : le sélecteur n'apparaît pas et `?` / `Ctrl+J` ne
    font rien. Sans clé : « Configurez l'assistant IA » avec lien vers les réglages IA. Hors
    ligne : « Connexion Internet nécessaire ».

## [4.7.0] - 2026-10-29

### Ajouté

- **Recherche dans les tags et les descriptions** (barre de recherche, sans IA ni réseau). « photo »
  trouve un site taggé « retouche photo » ; les correspondances du titre restent devant.
  - Poids : tag égal +50, début de tag +35, tag contenant +20, description (début de mot) +15,
    description (milieu) +5.
  - **Raison de la correspondance** sous le résultat : « tag : retouche photo » ou un extrait de
    60 caractères de la description, avec le mot en évidence.
  - **Filtre `#tag`** : `#dev` garde les sites dont un tag commence par « dev » ; `#dev git`
    combine filtre et recherche ; plusieurs `#` sont tous requis. `#` seul propose les 10 tags
    les plus utilisés, complétés au fil de la saisie ; un clic applique le filtre.

## [4.4.3] - 2026-10-29

### Modifié

- Nouvel onglet **Général** dans les réglages : « Ouverture des liens » (et le choix du
  navigateur sur iOS) et « Nouvel onglet » quittent Apparence pour y être regroupés.
- Barre d'onglets des réglages : sur un écran étroit, elle défile latéralement au lieu d'écraser
  les libellés.

## [4.4.2] - 2026-10-29

### Modifié

- La fenêtre de dossier s'élargit avec le réglage « Taille des cartes » (jusqu'à 90 % de la
  hauteur de l'écran), pour éviter le défilement quand les cartes sont grandes.

## [4.4.1] - 2026-10-29

### Ajouté

- **Réglage « Taille des cartes »** (Réglages > Apparence, curseur de 60 à 200 %, propre à
  chaque appareil). S'applique à l'accueil (pages et défilement), aux dossiers et aux
  sous-dossiers.

## [4.5.1] - 2026-10-29

### Ajouté

- **Réglage « Fermer le dossier en cliquant à côté »** (Général > Interface, synchronisé). Activé par défaut ; désactivé, seule la croix ou Échap ferme la fenêtre d'un dossier.

## [4.5.2] - 2026-10-29

### Ajouté

- **Réglage « Animations réduites »** (Général > Interface, synchronisé) : coupe les animations et les transitions de l'interface.

## [4.5.3] - 2026-10-29

### Ajouté

- **Réglage « Masquer la barre de recherche »** (Général > Interface, synchronisé). Le raccourci « / » est alors inactif.

## [4.5.4] - 2026-10-29

### Ajouté

- **Réglage « Afficher les titres sous les icônes »** (Général > Interface, synchronisé). Désactivé, les titres restent lisibles par les lecteurs d'écran.

## [4.5.5] - 2026-10-29

### Ajouté

- **Réglage « Confirmer avant de supprimer »** (Général > Interface, synchronisé) : demande une confirmation avant de supprimer un site ou un dossier vide (un dossier rempli la demandait déjà ; l'annulation reste possible).

## [4.5.6] - 2026-10-29

### Ajouté

- **Réglage « Vibration au glisser-déposer »** (Général > Interface, propre à l'appareil). Courte vibration quand on attrape ou dépose une icône (Android et Chrome ; sur iPhone, essai par l'astuce de l'interrupteur iOS 17.4+, non garanti).

## [4.5.7] - 2026-10-29

### Ajouté

- **Réglage « Forme des icônes »** (Apparence, propre à l'appareil) : carrées, arrondies (par défaut) ou rondes.

## [4.5.8] - 2026-10-29

### Ajouté

- **Réglage « Espacement des cartes »** (Apparence, propre à l'appareil) : serré, normal (par défaut) ou large. Agit sur l'écart entre les cartes du défilement vertical et des dossiers ; en pages, les cases remplissent l'écran, l'écart y change peu (la taille des cartes y règle l'espace).

## [4.5.9] - 2026-10-29

### Ajouté

- **Réglage « Heure et date »** (Général > Interface, propre à l'appareil) : affichées au-dessus de la barre de recherche, en 24 h ou 12 h. Masquées par défaut.

## [4.5.10] - 2026-10-29

### Ajouté

- **Réglage « Taille du texte des titres »** (Apparence, propre à l'appareil) : de 80 à 160 %.

## [4.5.11] - 2026-10-29

### Ajouté

- **Réglage « Ombre sous les icônes »** (Apparence, propre à l'appareil) : aucune, légère (par défaut) ou forte.

## [4.5.12] - 2026-10-29

### Ajouté

- **Réglage « Style des dossiers »** (Apparence, propre à l'appareil) : aperçu du contenu (par défaut) ou simple icône de dossier.

## [4.5.13] - 2026-10-29

### Ajouté

- **Réglage « Opacité de la fenêtre de dossier »** (Apparence, propre à l'appareil) : de 60 à 100 %.

## [4.5.14] - 2026-10-29

### Ajouté

- **Correctif : cartes qui se chevauchent** en défilement vertical et dans les dossiers avec une grande « Taille des cartes ». La taille s'arrête désormais là où l'icône remplit sa case.

## [4.6.0] - 2026-10-29

### Ajouté

- **Limite quotidienne réglable** (Réglages → IA) : chacun choisit sa limite d'appels IA par
  jour, de 1 au plafond du serveur (`config/ia.quotaMax`, 1 000 par défaut ; 300 sans réglage).
  Affiche les appels utilisés aujourd'hui. Utile pour « Compléter mes sites », qui épuise vite la
  limite. Fonction `iaDefinirQuota` ; la limite est stockée côté serveur (`prive/reglageQuota`),
  jamais écrite par le navigateur.

### Ajouté (V4.6)

- **Compléter mes sites** (Réglages → IA) : tags et descriptions pour les sites déjà enregistrés,
  sur demande seulement. Fenêtre qui explique que **l'action est facturée par Google sur votre
  clé Gemini**, choix de la portée (sites sans tags, un dossier, tous sauf tags écrits à la main)
  et estimation (sites, appels, quota restant aujourd'hui).
  - Traitement par lots : 2 appels simultanés au plus, 300 ms entre deux lancements, pause,
    reprise, arrêt, rapport final avec « Réessayer les échecs ». L'état est gardé sur l'appareil :
    après fermeture, le traitement se retrouve en pause, prêt à reprendre.
  - Arrêt automatique sur erreur bloquante (clé refusée ou sans crédit, assistant désactivé,
    limite quotidienne) ; une page illisible ne fait échouer que son site.
  - Verrou léger entre appareils (`reglages.ia.rattrapage`, expire après 10 minutes sans progrès).
  - Fonction `iaQuotaRestant` (lecture seule, ne consomme rien).
  - Pas encore fait : indicateur près de l'avatar, suggestion unique après l'activation de l'IA,
    affichage « Traitement en cours sur… » d'un autre appareil.

### Ajouté (V4.5)

- **Tags et description depuis la PWA (iPhone, iPad)** : sans extrait, `iaGenererTags` lit la page
  côté serveur (`recupererPage`), la résume avec le même code que l'extension (copies testées,
  parseur linkedom) puis appelle l'IA. Page illisible ou refusée : génération sur le titre et le
  domaine.
  - **Sécurité (SSRF)** : http/https, ports 80 et 443, DNS résolu avant la connexion et toutes
    les adresses vérifiées (ipaddr.js), connexion à l'IP vérifiée, redirections suivies à la main
    (3 au plus, chacune revérifiée), 6 s, 512 Ko, HTML seulement, aucun cookie, exclusions de
    confidentialité de la V4.3. 60 téléchargements par utilisateur et par jour.
  - Réglages → Assistant IA : phrase de transparence ; brouillon de confidentialité mis à jour.

### Ajouté (V4.4)

- **Tags et description générés par l'IA à l'ajout d'un site (extension).** Fonction `iaGenererTags`
  (prompt versionné `PROMPT_TAGS_VERSION = 1`, sortie JSON validée et normalisée comme côté
  navigateur, un nouvel essai si la réponse est invalide, URL / e-mail / HTML retirés de la
  description). Le contenu de la page est présenté comme une donnée, pas une instruction.
  - Service `enrichissement` : 2 générations simultanées au plus, jamais d'écrasement de tags
    écrits à la main, relance si l'adresse change. Rien pour les sites importés (V4.6) ni dans
    la PWA (V4.5).
  - Tuile : point discret pendant la génération. Édition : « Régénérer » actif.
  - Qualité observée : à noter après les vérifications manuelles du plan.

### Modifié

- **IA : Gemini seul, un modèle imposé.** Le fournisseur OpenAI, le choix du modèle par usage,
  les modèles personnalisés et la vérification des modèles sont retirés : cette vérification
  envoyait jusqu'à 10 requêtes de génération (1 024 jetons de sortie chacune) et coûtait cher.
  Le modèle vient de `config/ia.modele` ; le test de clé n'utilise plus que 256 jetons.
- Fonctions `iaListerModeles` et `iaVerifierModeles` supprimées.

## [4.3.0] - 2026-10-27

### Ajouté

- **Lecture du contenu des pages (extension)** : un résumé compact d'une page (titre,
  description, mots-clés, titres, début du texte visible, langue ; 3 000 caractères au plus),
  qui servira à l'IA en V4.4. Aucun appel IA dans cette version.
  - Nettoyage : scripts, menus, pieds de page, bandeaux cookies, popups et lignes courtes
    répétées sont retirés ; `main` / `article` sont préférés.
  - **Confidentialité** : adresses privées, URL avec jeton, domaines sensibles (banque, santé,
    messagerie…) et pages d'erreur ou de contrôle ne sont pas lus (extrait réduit, requête
    retirée de l'URL). Règles dans `docs/ia.md`.
  - Cache en mémoire (50 entrées, 10 minutes), aucun stockage durable, aucun cookie envoyé.
  - Sans la permission d'accès aux sites, ou dans l'application web : pas d'extrait.
- Réglages → Diagnostic : « Voir l'extrait d'une URL » (extension, mode debug).

### Modifié

- Les pages en `windows-1252` et autres encodages sont décodées avec leur jeu de caractères
  (en-tête `content-type`, puis `<meta charset>`).

### Vérifié à la main

- Extrait testé sur 10 sites réels avec l'outil de diagnostic : résultats bons, aucune
  heuristique à ajuster.

## [4.2.0] - 2026-10-27

### Ajouté

- **Tags et description sur chaque site**, modifiables à la main dans « Modifier le site » :
  - **Tags** : jusqu'à 10, en puces. Entrée, virgule ou point-virgule valident un tag, × le
    retire, Retour arrière dans le champ vide retire le dernier, une liste collée est découpée.
    Les tags déjà utilisés ailleurs sont suggérés.
  - **Description** : 300 caractères au plus, avec un compteur.
  - Nettoyage automatique : minuscules, sans `#`, sans doublon (accents et casse ignorés),
    30 caractères par tag, description coupée au dernier mot.
- **Protection du travail à la main** : dès que vous écrivez des tags ou une description,
  l'IA ne les écrasera jamais (`tagsManuels`). Renommer seulement ne change rien. La case
  « Laisser l'IA gérer les tags et la description » rend la main. Le bouton « Régénérer »
  est prêt mais désactivé (V4.4).
- Information-bulle d'un site (ordinateur) : le titre et la description.
- Nouvelle action `SITE_DEFINIR_IA` (utilisée dès la V4.4) : n'écrase jamais des tags écrits
  à la main, robuste au rejeu.

### Modifié (migration)

- **Schéma de données 2 → 3** : chaque site reçoit `tags`, `description`, `tagsManuels` et
  l'état `ia`, à tous les niveaux de dossiers, partout (stockage local, compte, sauvegardes,
  imports) ; la migration est idempotente. Environ 90 octets de plus par site.
- **Les versions plus anciennes passent en lecture seule** sur des données migrées : mettez à
  jour **l'extension Chrome** (zip) ; l'application web se met à jour avec « Recharger ». Le
  message affiché est « Une nouvelle version est nécessaire », avec un lien.

### Corrigé

- Le bandeau « Une nouvelle version est disponible » ne réagissait pas au clic quand le
  curseur était dans la barre de recherche (même vide) ; il explique maintenant, dans le
  bandeau, pourquoi il attend (fenêtre ouverte, déplacement ou texte en cours).

### Problèmes connus

- L'extension Chrome doit être remplacée par le zip 4.2 pour modifier les données d'un
  compte migré.
- `config/ia` n'est pas créé, OpenAI n'a pas été essayé avec une vraie clé, et la checklist de
  test de la V3 n'est toujours pas exécutée.

### Vérifié

| Contrôle                                                 | Résultat  |
| -------------------------------------------------------- | --------- |
| Application web avec un vrai compte (édition, migration) | ✔         |
| Extension Chrome 4.2 avec un vrai compte                 | non testé |
| Tests automatiques                                       | ✔ (755)   |
| Tests sur émulateurs (règles, synchro, temps réel)       | ✔ (80)    |

## [4.1.0] - 2026-10-26

### Ajouté

- **Réglages → onglet « IA »** : un interrupteur « Activer l'assistant IA » (désactivé par
  défaut), puis :
  - **Mes clés** : une ligne par fournisseur (OpenAI, Google Gemini). « Ajouter ma clé » ouvre
    une fenêtre à champ masqué ; la clé est vérifiée auprès du fournisseur, enregistrée
    chiffrée, puis le champ est vidé. On voit seulement ses 4 derniers caractères ;
    « Remplacer », « Supprimer », badge « À vérifier » si le fournisseur la refuse.
  - **Modèle par usage** (Tags, Recherche, Discussion) : les listes ne proposent que les
    modèles qui répondent avec votre clé (✓). Les listes viennent des fournisseurs eux-mêmes,
    aucun nom de modèle n'est écrit dans le code ; la vérification se fait toute seule et est
    gardée 24 h sur l'appareil ; « Revérifier mes modèles », « Afficher tous les modèles du
    fournisseur » ; bouton « Tester » (« OK · 562 ms »).
  - **Mes modèles** : ajout d'un modèle par son identifiant exact, jusqu'à 20 ; supprimer un
    modèle utilisé remet l'usage à « non défini ».
  - Guide en trois étapes à la première activation ; mode sans compte : explication.
- Les choix (activation, modèle de chaque usage, modèles ajoutés) sont des réglages
  synchronisés (`reglages.ia`), sans aucune clé.
- **Fonctions serveur** `iaListerModeles` (modèles que la clé peut utiliser, sans toucher au
  quota) et `iaVerifierModeles` (quels modèles répondent, 1 appel de quota pour 10 modèles).
- **Choix côté serveur** : le fournisseur et le modèle d'un usage sont lus par le serveur dans
  les réglages de l'utilisateur, jamais dans la requête du navigateur (`executerUsage`, prêt
  pour les fonctions IA suivantes). Un modèle retiré par le fournisseur donne « Ce modèle n'est
  pas disponible avec votre clé ».
- `iaPrete(usage)` : dit si l'IA est prête (mode local, désactivée, pas de clé, pas de modèle,
  hors ligne) pour que chaque fonction IA s'affiche ou explique quoi faire.

### Modifié

- L'ancien test temporaire de clé du diagnostic est supprimé (remplacé par l'écran).

### Problèmes connus

- `config/ia` n'est pas encore créé : pas de modèles « recommandés » ni de bouton
  « Utiliser les recommandations ». Les listes viennent des fournisseurs.
- OpenAI n'a pas été essayé avec une vraie clé (Gemini oui).
- Après avoir vidé le cache du navigateur, la première synchronisation de l'application web
  peut échouer avec « permissions refusées » : cause non trouvée.
- La checklist de test complète de la V3 n'est toujours pas exécutée.

### Vérifié

| Contrôle                                              | Résultat  |
| ----------------------------------------------------- | --------- |
| Écran IA avec un vrai compte et une clé Gemini réelle | ✔         |
| Clé OpenAI réelle                                     | non testé |
| Tests automatiques (dont écran et serveur IA)         | ✔ (679)   |
| Tests sur émulateurs (règles, fonctions)              | ✔ (78)    |

## [4.0.0] - 2026-10-26

Fondations de l'IA (aucune fonction visible pour l'utilisateur encore : tags, recherche et
discussion viennent ensuite).

### Ajouté

- **Fonctions serveur pour l'IA** (Cloud Functions, `europe-west1`) : `iaEnregistrerCle`,
  `iaSupprimerCle`, `iaEtatCles`, `iaTester`. Chaque utilisateur apporte **sa propre** clé ;
  le navigateur n'appelle jamais un fournisseur d'IA.
- **Clés chiffrées** : une clé est d'abord vérifiée auprès du fournisseur, puis enregistrée
  chiffrée (AES-256-GCM, IV unique, liée à l'utilisateur et au fournisseur) dans
  `users/{uid}/prive/ia`, un document que le navigateur ne peut ni lire ni écrire. Le secret
  de chiffrement vit dans Secret Manager. Le serveur ne renvoie que les 4 derniers caractères.
- **Quota** : 300 appels par utilisateur et par jour (heure de Paris), décompté dans une
  transaction avant l'appel au fournisseur ; modifiable dans `config/ia`.
- **Fournisseurs** : OpenAI et Google Gemini (délai de 30 s, un seul réessai sur erreur
  serveur, erreurs normalisées). Les journaux ne contiennent ni clé ni contenu de message.
- Section temporaire « Tester une clé IA » dans Réglages → Avancé → Diagnostic (remplacée par
  l'écran des réglages IA en V4.1).
- Suppression de compte (V2.10) enfin en ligne : les fonctions sont déployées.

### Modifié

- Le projet Firebase passe au forfait Blaze (obligatoire pour les fonctions), avec un budget
  de 1 € par mois et des alertes à 50 %, 80 % et 100 %.
- Le secret IA est requis pour déployer les fonctions : voir `docs/ia.md`.

### Problèmes connus

- `config/ia` n'est pas encore créé : sans lui, OpenAI et Gemini sont actifs, 300 appels par
  jour, aucun modèle suggéré.
- OpenAI n'a pas été essayé avec une vraie clé (Gemini oui, « OK » en 562 ms).
- La checklist de test complète de la V3 n'est toujours pas exécutée.

### Vérifié

| Contrôle                                        | Résultat  |
| ----------------------------------------------- | --------- |
| Clé Gemini réelle : enregistrement puis « OK »  | ✔         |
| Clé OpenAI réelle                               | non testé |
| Tests automatiques (dont 61 pour le serveur IA) | ✔         |
| Tests sur émulateurs (règles, fonctions)        | ✔ (78)    |

## [3.10.1] - 2026-10-26

### Corrigé

- **Glisser-déposer** : l'icône glissée reste sous le doigt et sous le curseur (elle partait
  ailleurs à l'écran, surtout sur iPhone) ; l'endroit d'arrivée est une case vide au lieu
  d'une deuxième icône.
- **Pages décalées** après un dépôt sur une autre page : la boîte des pages ne défile plus.
- **Réglages en deux colonnes** : la carte du compte n'est plus coupée (nom, boutons).

### Ajouté

- **Sortir une icône d'un dossier** en la glissant : hors de la fenêtre du dossier (ou
  au-dessus de son en-tête sur téléphone) pendant 0,4 s, la fenêtre s'efface, un repère
  montre où l'icône arrivera sur la page d'accueil affichée ; au dépôt, la fenêtre se ferme
  et « Annuler » est proposé. Échap annule le geste.

### Vérifié

| Appareil                               | Résultat  |
| -------------------------------------- | --------- |
| Chrome, taille ordinateur et téléphone | ✔         |
| iPhone (vrai appareil)                 | non testé |
| Tests automatiques                     | ✔ (550)   |

## [3.10.0] - 2026-10-26

### Ajouté

- **Mode diagnostic** : sept touchers rapides sur « Version installée » (Réglages → Avancé)
  l'activent ou le désactivent, et `?debug` à l'adresse l'active pour la session dans Safari.
  Un badge « DEBUG » reste visible en bas à gauche tant qu'il est actif. Il ne change pas le
  comportement de l'app.
- **Section « Diagnostic »** : version, plateforme, mode, réseau, synchro, taille des données,
  service worker, caches, capacités détectées et 50 dernières entrées du journal ; boutons
  « Copier le diagnostic », « Actualiser », « Forcer la synchronisation », « Vider le cache de
  l'interface » et « Ouvrir la console ».
- **Console Eruda** (application web seulement) : chargée à la demande depuis un fichier à
  part, jamais au démarrage, jamais dans l'extension, non gardée pour le hors ligne.
- **Journal interne** : les 500 derniers événements, en mémoire seulement, jamais envoyés ni
  enregistrés. Pas d'e-mail, de jeton ni d'adresse complète (réduite au domaine), y compris dans
  les messages d'erreur. Les erreurs non gérées y sont notées, mode diagnostic ou non.
- Site : question « Comment envoyer un diagnostic ? » dans la FAQ.
- `npm run verifier:eruda` : Eruda absent de l'extension, en fichier séparé côté web.

### Problèmes connus

- La checklist de test complète (`docs/tests/checklist-v3.md`) n'est pas encore exécutée sur
  extension, iPhone et iPad : la V3 n'est donc pas close.
- `npm run verifier:site` échoue tant que le zip de téléchargement du site n'est pas régénéré
  pour la version courante.

### Vérifié

| Appareil                       | Résultat                   |
| ------------------------------ | -------------------------- |
| iPhone (Safari, vrai appareil) | ✔ diagnostic               |
| iPad                           | non testé                  |
| Ordinateur                     | tests automatiques ✔ (542) |

## [3.9.0] - 2026-10-26

### Ajouté

- **Réglages en deux colonnes** dès 900 px de large (iPad en paysage, ordinateur) : la liste des
  sections à gauche, la section choisie à droite.
- **Aide des raccourcis** : la touche `?` affiche tous les raccourcis clavier (aussi dans
  l'extension) ; `Cmd + ,` (ou `Ctrl + ,`) ouvre les réglages. Rien ne se déclenche dans un
  champ de saisie ni au-dessus d'une fenêtre ouverte.
- **Détection de ce que l'on peut faire**, pas de l'appareil : trackpad ou souris branchés,
  clavier physique. L'indication « (/) » de la recherche apparaît avec un clavier et
  disparaît sans, y compris quand on le branche ou le débranche en cours d'usage.
- **Menu selon le pointeur** : un clic secondaire à la souris ou au trackpad ouvre le menu
  souris ; un doigt ou un stylet ouvre le menu tactile (feuille ou menu ancré à l'icône).
- Grand écran : contenu jusqu'à 1100 px, icônes de 64 px quand la grille est large ; en
  paysage court (iPhone couché), marges verticales réduites.

### Vérifié

| Appareil                             | Résultat                              |
| ------------------------------------ | ------------------------------------- |
| Navigateur de développement, 1100 px | ✔ réglages en deux colonnes, aide `?` |
| iPad (Split View, Stage Manager)     | non testé                             |
| iPad avec clavier et trackpad        | non testé                             |
| Ordinateur                           | tests automatiques ✔ (525)            |

## [3.8.0] - 2026-10-26

### Ajouté

- **Export par la feuille de partage** (iPhone, iPad) : « Exporter mes données » et l'archive
  des fonds d'écran s'envoient vers Fichiers, AirDrop, Mail… Repli sur le téléchargement quand
  le système ne sait pas partager de fichier, et dans l'extension. Fermer la feuille n'affiche
  rien ; si iOS refuse parce que la préparation a été trop longue, un bouton « Partager … »
  envoie le fichier déjà prêt. Le fichier d'export est le même que sur ordinateur.
- **Liste des sauvegardes au doigt** : dates lisibles (« Aujourd'hui 14:35 », « Hier 09:12 »,
  puis `18/10/2026`), lignes de 64 px, boutons de 44 px, pages de 20 chargées en approchant du
  bas, suppression d'une sauvegarde manuelle par balayage vers la gauche (avec confirmation).
- Aperçu d'une sauvegarde : les boutons restent en bas de l'écran, au pouce.

### Vérifié

| Appareil                       | Résultat                   |
| ------------------------------ | -------------------------- |
| iPhone (Safari, vrai appareil) | ✔                          |
| iPad                           | non testé                  |
| Ordinateur                     | tests automatiques ✔ (509) |

## [3.7.0] - 2026-10-26

### Ajouté

- **Ouverture hors ligne** (application web) : un service worker garde l'interface en cache ;
  l'app installée s'ouvre sans réseau, avec ses données (cache Firestore). Les icônes de sites
  Google déjà vues sont gardées 30 jours. Rien de Firebase (Firestore, Storage, connexion)
  n'est mis en cache par le service worker, et les pages de connexion `/__/` lui échappent.
- **Bandeau « Une nouvelle version est disponible »** avec « Recharger » : jamais de
  rechargement automatique ; refusé pendant une fenêtre ouverte, un glisser ou une saisie ;
  les modifications en attente partent avant le rechargement (3 s au plus). Recherche d'une
  nouvelle version au retour au premier plan, au plus une fois par heure.
- Après une mise à jour : message unique « Mise à jour vers la version X » avec « Nouveautés ».
  Lien « Nouveautés » dans Réglages → À propos.
- `sw.js` servi sans cache par Firebase Hosting.

### Inchangé

- L'extension Chrome n'a pas de service worker.

### Vérifié

| Appareil                       | Résultat                                      |
| ------------------------------ | --------------------------------------------- |
| iPhone (Safari, vrai appareil) | ✔ hors ligne, connexion Google                |
| Bandeau de mise à jour         | pas encore vu (demande un second déploiement) |
| Ordinateur                     | tests automatiques ✔ (499)                    |

## [3.6.0] - 2026-10-26

### Ajouté

- **Menu par appui long** (iPhone, iPad) : l'icône appuyée reste visible, agrandie, au-dessus
  d'un voile flou. Sur iPhone, feuille d'actions en bas (boutons de 52 px, « Supprimer » en
  rouge en dernier, « Annuler » à part) ; sur iPad, menu ancré à l'icône. Toucher le voile ou
  glisser ferme le menu.
- **Un seul catalogue d'actions** pour la souris et le doigt : toute action ajoutée plus tard
  apparaît dans les deux. Les actions désactivées montrent leur raison.
- **Partager…** (feuille de partage du système), uniquement là où le navigateur sait partager.
- **Mode « Modifier la grille »** : bouton « Modifier » / « OK » en haut (écran tactile), icônes
  qui tremblent avec un « − » pour supprimer (avec « Annuler »), glisser sans appui long, appui
  sur un site sans effet. Pas de tremblement si les animations sont réduites.
- Messages : bouton « Annuler » de 44 px minimum, balayage vers le bas pour fermer.
- VoiceOver : le bouton « Actions pour … » reste sur chaque icône (invisible au toucher).

### Vérifié

| Appareil                       | Résultat                   |
| ------------------------------ | -------------------------- |
| iPhone (Safari, vrai appareil) | non testé                  |
| iPad                           | non testé                  |
| Ordinateur (souris)            | tests automatiques ✔ (494) |

## [3.5.0] - 2026-10-26

### Ajouté

- **Glisser-déposer au doigt** (iPhone, iPad) : un appui long de 400 ms soulève l'icône, puis
  elle suit le doigt, affichée au-dessus pour rester visible. Réorganisation, dépôt dans un
  dossier, création d'un dossier en posant un site sur un autre (0,5 s) et dépôt sur le fil
  d'Ariane fonctionnent comme à la souris, avec les mêmes garde-fous.
- Un balayage rapide défile ou change de page sans déclencher de glisser ; la grille défile
  toute seule quand l'icône approche d'un bord.
- Un appui long sans bouger émet l'événement `appuilong` (utilisé par le menu tactile, V3.6).

### Vérifié

| Appareil                       | Résultat             |
| ------------------------------ | -------------------- |
| iPhone (Safari, vrai appareil) | ✔                    |
| iPad                           | non testé            |
| Ordinateur (souris)            | tests automatiques ✔ |

## [3.4.0] - 2026-10-25

### Ajouté

- **Pages au doigt** sur iPhone et iPad : la page suit le doigt, un glissement long ou
  rapide passe à la page voisine, sinon elle revient en place (résistance à la première et
  à la dernière page). Un glissement vertical ou un appui long sur une icône ne tourne pas
  la page.
- **Grille du téléphone** : 4 colonnes × 6 lignes (5 sur un petit iPhone), 7 × 3 en paysage.
  Les pages enregistrées (8 colonnes par défaut, synchronisées) ne changent pas : le
  téléphone coupe chaque page en écrans plus petits, et une icône déplacée sur le téléphone
  arrive au bon endroit sur l'ordinateur.
- Accueil en défilement vertical (au choix) : 4 colonnes sur iPhone, 5 ou 6 sur une largeur
  moyenne, icônes de 52 à 60 px selon la place (container queries) ; réglage « Colonnes »
  de 3 à 10.
- Téléphone : dossier en plein écran glissant depuis le bas, fenêtres (ajout, modification)
  en feuille du bas qui remonte au-dessus du clavier iOS, bouton fermer de 44 px.
- Encoche et barre d'accueil respectées partout (page, messages, feuilles).
- Tactile : pas de zoom au double toucher, léger enfoncement des icônes au toucher, lignes
  de résultats de recherche de 52 px, champs d'adresse sans majuscule ni correction
  automatique ; l'indication « (/) » disparaît sur un écran tactile sans clavier.
- Hauteur réelle de l'écran sur iOS (`100dvh`).

### Vérifié

| Appareil                                              | Portrait          | Paysage   |
| ----------------------------------------------------- | ----------------- | --------- |
| iPhone (Safari, vrai appareil)                        | ✔                 | non testé |
| Taille iPhone 375 × 812 (navigateur de développement) | ✔                 | —         |
| Ordinateur (extension, pages de 8 colonnes)           | ✔ sans changement | —         |
| iPad, Split View                                      | non testé         | non testé |

## [3.3.0] - 2026-10-25

### Ajouté

- **Synchronisation entre l'iPhone, l'iPad et l'extension Chrome** : avec le même compte
  Google, l'application web affiche les mêmes sites, dossiers et réglages, mis à jour en
  temps réel, avec la même gestion des conflits et du hors ligne que entre deux ordinateurs
  (un seul code de synchronisation pour les deux).
- Première connexion dans l'app : même choix que sur l'extension (garder les sites du
  compte, ceux de l'appareil, ou fusionner), copie de sécurité avant tout changement.
- iPhone et iPad : les modifications partent quand l'app passe en arrière-plan, et celles
  en attente repartent quand elle revient au premier plan.
- Navigation privée sans stockage : l'app fonctionne quand même (sans hors ligne) et le
  signale discrètement.
- Sauvegardes : l'appareil d'origine est affiché (Chrome, iPhone, iPad ou Navigateur).
- Préparation d'App Check pour l'app web (reCAPTCHA autorisé par la politique de sécurité ;
  clé à créer, voir `docs/firebase.md`).

### Modifié

- Textes : « cet appareil » au lieu de « cet ordinateur ».
- Règles Firestore : une sauvegarde peut venir de `iphone`, `ipad` ou `navigateur`.
- Les tests sur émulateurs tournent pour les deux cibles (`CIBLE=pwa npm run test:regles`).

### Corrigé

- Test de suppression de compte sur émulateurs : délai de « connexion récente » porté à
  10 s (le démarrage à froid de la fonction le dépassait).

## [3.2.0] - 2026-10-25

### Ajouté

- **Connexion Google dans l'application web** (iPhone, iPad, navigateur) : « Se connecter avec
  Google » ouvre la page de Google puis revient dans l'app, y compris dans l'app installée
  sur l'écran d'accueil. « Connexion… » s'affiche pendant le retour ; le choix du compte
  Google est toujours proposé. La session est gardée après fermeture de l'app.
- Même compte que l'extension : se connecter avec le même compte Google sur le PC et
  l'iPhone, c'est le même utilisateur. La synchronisation des sites arrive en 3.3 : en
  attendant, la section Compte de l'app l'indique et ne propose pas « Synchroniser ».
- Suppression du compte depuis l'app : une connexion de moins de 4 minutes suffit ; sinon
  Google redemande le compte, puis il suffit de relancer la suppression.
- Messages clairs : retour sans connexion (rien à dire), autre compte choisi, pas de réseau,
  adresse non autorisée.
- `npm run verifier:auth` : l'extension n'embarque pas la connexion par redirection, et
  l'app web n'embarque pas le code `chrome.identity`.

### Modifié

- L'extension se connecte exactement comme avant (`chrome.identity`) ; son code est
  désormais dans `src/firebase/auth.extension.js`, choisi au build.
- L'app web se connecte sur son propre domaine (`nedotab-app.web.app`, variable
  `VITE_FIREBASE_AUTH_DOMAIN_PWA`) au lieu de `firebaseapp.com`.

### Corrigé

- Retour de Google en échec (`auth/internal-error`) : la politique de sécurité du site
  autorise désormais le script de connexion de Google (`apis.google.com`).
- L'app web se connecte sur l'adresse où elle tourne (site ou préversion), sinon Safari
  bloquait le retour sur une préversion.
- La cible du build (extension ou app web) n'arrivait pas jusqu'à la configuration
  Firebase : App Check ne pouvait jamais s'activer dans l'app web.

## [3.1.0] - 2026-10-25

### Ajouté

- **Installation sur l'écran d'accueil** de l'iPhone et de l'iPad : manifeste web
  (`manifest.webmanifest`), icône iOS opaque de 180 px, icônes Android (dont une icône
  « masquable »), titre « NedoTab ». Lancée depuis son icône, l'app s'ouvre en plein écran,
  sans la barre de Safari ; la barre d'état de l'iPhone passe par-dessus le fond, et rien
  n'est caché dessous ni sous la barre d'accueil (marges de sécurité).
- Couleur de fond affichée dès l'ouverture (pas d'écran blanc), couleur de la barre du
  navigateur assortie au thème clair ou sombre.
- **Aide à l'installation** : dans Safari sur iPhone et iPad, un bandeau discret en bas
  explique « Touchez Partager, puis Sur l'écran d'accueil ». Jamais sur ordinateur ni dans
  l'app installée ; une fois fermé, il ne revient pas.
- Site vitrine : page **« NedoTab sur iPhone et iPad »** (les étapes dans Safari), liens
  depuis l'accueil et le pied de page ; FAQ : Safari et l'app de l'écran d'accueil gardent
  leurs données séparément.
- Les icônes sont toutes produites par `npm run icones` à partir d'un seul dessin, sans
  dépendance ajoutée.

### Corrigé

- Accueil en pages, grille vide : une petite tuile « + » s'affichait sous l'invitation
  « Ajoutez votre premier site ».

## [3.0.2] - 2026-10-25

### Corrigé

- iPhone et iPad : toucher la barre de recherche faisait zoomer Safari et la page défilait
  sur le côté. Safari zoome sur tout champ dont le texte fait moins de 16 px ; sur les
  écrans tactiles, les champs (recherche, fenêtres, listes des réglages) font désormais au
  moins 16 px. Le zoom de l'utilisateur reste possible.

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
