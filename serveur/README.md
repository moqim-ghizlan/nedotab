# Serveur VPN NedoTab (V5)

Serveur Linux gratuit (Oracle Cloud « Always Free »), point de sortie Internet du VPN privé.
Il doit pouvoir être **recréé de zéro** avec les scripts de `serveur/scripts/`.

## Architecture
| Élément | Valeur |
|---|---|
| Fournisseur | Oracle Cloud, offre Always Free |
| Région (définitive) | Allemagne — Francfort |
| Machine | `VM.Standard.A1.Flex`, 2 OCPU / 12 Go max, Ubuntu Server LTS ARM |
| Domaine | `nedotab-vpn.duckdns.org` (DuckDNS) |
| Utilisateur d'administration | `admin-vpn` (clé SSH uniquement) |
| Pare-feu système | **ufw** (le `iptables` préinstallé par Oracle est retiré) |

IP, domaine : voir `docs/identifiants.md`. Aucun secret dans ce dépôt.

## Ports ouverts (à tenir à jour à chaque version)
Il y a **deux** pare-feu : la liste de sécurité Oracle **et** `ufw`. Ouvrir un port = les deux.

| Port | Proto | Usage | Version | Oracle | ufw |
|---|---|---|---|---|---|
| 22 | TCP | SSH (clé uniquement) | V5.0 | oui | oui |
| 80 | TCP | Certificat Let's Encrypt seulement (rien n'écoute hors renouvellement) | V5.1 | oui | oui |
| 443 | TCP | Proxy HTTPS (Squid, authentification obligatoire) | V5.1 | oui | oui |

## Se connecter
```bash
ssh -i ~/.ssh/vpn-nedotab admin-vpn@<domaine>
```

## Scripts (idempotents, à lancer dans l'ordre, avec `sudo bash`)
| Script | Rôle |
|---|---|
| `01-base.sh` | mises à jour, utilisateur `admin-vpn`, fuseau, nom d'hôte |
| `02-ssh.sh` | SSH durci + fail2ban (5 essais, ban 1 h). `ALLOW_UBUNTU=0` retire `ubuntu` une fois `admin-vpn` vérifié |
| `03-parefeu.sh` | ufw : tout refusé en entrée sauf 22 |
| `04-maj.sh` | mises à jour de sécurité auto, redémarrage à 4 h |
| `etat.sh` | charge, mémoire, disque, services, bannissements |
| `10-proxy.sh` | V5.1 : Squid (HTTPS 443), certificat, service durci. Variables `DOMAINE`, `IP_PUBLIQUE`, `EMAIL` |
| `compte-ajouter.sh <nom>` | V5.1 : crée un compte, mot de passe de 32 caractères affiché **une seule fois**, empreinte bcrypt enregistrée |
| `compte-retirer.sh <nom>` | V5.1 : retire un compte (effet immédiat, sans coupure). Depuis la V5.2, les comptes viennent de Firebase : ces deux scripts ne servent plus qu'au dépannage (l'agent écrase le fichier à chaque changement) |
| `20-agent.sh` | V5.2 : agent de synchronisation (utilisateur `vpn-agent`, timer d'une minute). Variable `VPN_AGENT_URL` ; le jeton est demandé en saisie masquée |

Copier les scripts : `scp -r serveur/scripts serveur/proxy admin-vpn@<domaine>:~/` (ou `ubuntu@` avant `01`).

## Agent de synchronisation (V5.2)
Le serveur n'a **aucune clé de compte de service Firebase** : il appelle la fonction HTTP `vpnAgentSynchro` avec un jeton secret (`VPN_JETON_AGENT`, aussi dans Secret Manager). Compromis, il ne donne pas accès à Firestore.
- Chaque minute (`vpn-agent.timer`), `/usr/local/sbin/vpn-agent` lit la liste des comptes actifs. Si la **version** a changé, il écrit le fichier des comptes et recharge Squid à chaud (`vpn-agent-appliquer`, seule commande autorisée par `sudoers`).
- **En cas de panne, de réponse invalide ou de doute, la liste actuelle est conservée** : une panne de Firebase ne coupe personne. La réponse doit correspondre exactement au format attendu (liste blanche), sinon elle est ignorée.
- Journal : `journalctl -u vpn-agent -n 20` (« synchro, N comptes » seulement : jamais un compte ni une empreinte).
- Fichiers : `/etc/vpn-agent/env` (URL + jeton, droits 640, groupe `vpn-agent`), `/var/lib/vpn-agent/version`.
- Retrait d'un invité : effectif en 2 minutes au plus (1 minute de synchro + 30 secondes de cache d'authentification de Squid). Une connexion déjà ouverte n'est pas coupée avant sa fin.
- **Rotation du jeton** : générer un nouveau jeton (`openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 48`), `firebase functions:secrets:set VPN_JETON_AGENT`, redéployer `vpnAgentSynchro`, puis sur le serveur `sudo CHANGER_JETON=1 VPN_AGENT_URL=<url> bash ~/scripts/20-agent.sh`.

## Proxy (V5.1)
- Squid, `https_port 443`, comptes dans `/etc/squid/comptes` (bcrypt, droits 600). Choix expliqué dans `docs/decisions.md`.
- Destinations internes et privées interdites ; ports de destination 80 et 443 seulement.
- **Journaux** : `access_log none`. Aucune destination n'est écrite ; `cache.log` ne garde que les erreurs, 7 jours.
- **Certificat** : expire le 2027-02-02, renouvelé par `certbot.timer` (2 tentatives par jour dès 30 jours avant). Risque connu : les DNS de DuckDNS renvoient parfois `SERVFAIL` (test à blanc échoué le 2026-11-04). À relancer : `sudo certbot renew --dry-run`. Remède durable : un domaine personnel (autre fournisseur DNS).
- Limite : sans identifiants, Squid répond 407 et révèle qu'il est un proxy.
- Test depuis le PC : `serveur/tests/tester-proxy.sh` (variables `PROXY_DOMAINE`, `PROXY_COMPTE`, `PROXY_MDP`, `PROXY_IP`).

## Mises à jour automatiques
Journal : `/var/log/unattended-upgrades/unattended-upgrades.log`. Test : `sudo unattended-upgrade --dry-run`.

## Instances inactives
Oracle peut récupérer les instances Always Free inactives. Vérifier la politique actuelle dans la
documentation Oracle. Le trafic des utilisateurs (dès la V5.3) maintient normalement l'activité.

## « Je me suis bloqué dehors »
Console Oracle → Instance → **Console connection** (console série) → se connecter, puis supprimer
`/etc/ssh/sshd_config.d/10-durcissement.conf` et `sudo systemctl reload ssh`.
