---
name: serveur-vpn
description: Travail sur le serveur Oracle du VPN NedoTab (proxy, WireGuard, SSH, pare-feu, scripts de serveur/). À utiliser pour toute tâche V5 touchant le serveur.
---

# Serveur VPN NedoTab

## Règles
1. **Accord de l'utilisateur avant toute commande sur le serveur.** Montrer la commande, attendre le oui.
2. **Scripts idempotents et versionnés** dans `serveur/scripts/` (`set -euo pipefail`). Jamais de modification manuelle non scriptée.
3. **Deux pare-feu** : liste de sécurité Oracle **et** `ufw`. Chaque nouveau port = les deux + mise à jour du tableau de `serveur/README.md`. Jamais de port ouvert « pour tester ».
4. **SSH** : avant de recharger sshd, `sshd -t`, garder la session ouverte, tester dans une **seconde** session.
5. **Aucun secret dans le dépôt** : clés privées, mots de passe, profils WireGuard, identifiants proxy.
6. **Aucune journalisation des destinations** des utilisateurs : uniquement des volumes.
6bis. Proxy (V5.1) : `access_log none`, jamais de destination, de nom de site ni d'URL dans un journal ; empreintes bcrypt, mot de passe affiché une fois ; aucun en-tête révélant l'IP du client ; HTTPS jusqu'au proxy, jamais de proxy en clair ni sans authentification.
6ter. Accès invités (V5.2) : le serveur n'a **jamais** de clé de compte de service Firebase, seulement le jeton `VPN_JETON_AGENT` (lu dans `/etc/vpn-agent/env`, droits 640). L'agent **conserve la liste** en cas d'erreur ; il n'accepte qu'une réponse au format exact. Les secrets (`VPN_JETON_AGENT`, `VPN_CLE_CHIFFREMENT`) ne sont jamais dans le dépôt, un argument de commande ou un journal. Aucun e-mail, uid ni compte proxy dans les journaux des fonctions.
6quater. WireGuard (V5.7) : wg-easy épinglé (jamais `latest`), interface et API sur `127.0.0.1` seulement (tunnel SSH). Une configuration client contient une **clé privée** : en mémoire seulement, jamais dans un fichier, un argument, un journal, le dépôt ou un e-mail ; elle n'est stockée que chiffrée (`vpn/config/profils/{uid}`, AAD = uid). Profils gérés uniquement par l'agent ; nom de profil neutre (`p_…`), jamais l'e-mail. Les clients sont isolés entre eux et du réseau interne.
7. Ne jamais dire « anonyme » : le VPN change l'IP vue par les sites.
8. Ne pas dépasser les limites Always Free (vérifier la console).

## Checklist
- [ ] `npm run lint:serveur` (shellcheck) passe
- [ ] Script relancé deux fois sans erreur
- [ ] Ports : tableau du README à jour
- [ ] Accès SSH vérifié dans une seconde session
