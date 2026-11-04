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

Copier les scripts : `scp -r serveur/scripts admin-vpn@<domaine>:~/` (ou `ubuntu@` avant `01`).

## Mises à jour automatiques
Journal : `/var/log/unattended-upgrades/unattended-upgrades.log`. Test : `sudo unattended-upgrade --dry-run`.

## Instances inactives
Oracle peut récupérer les instances Always Free inactives. Vérifier la politique actuelle dans la
documentation Oracle. Le trafic des utilisateurs (dès la V5.3) maintient normalement l'activité.

## « Je me suis bloqué dehors »
Console Oracle → Instance → **Console connection** (console série) → se connecter, puis supprimer
`/etc/ssh/sshd_config.d/10-durcissement.conf` et `sudo systemctl reload ssh`.
