# Déployer la V5.3 → V5.10 et faire les essais réels

Ordre à suivre. Chaque bloc dit **où** on tape, **ce qu'on doit voir**, et **quand s'arrêter**.
Rien n'a encore été exécuté. Les commandes sur le serveur ne se lancent qu'avec l'accord du propriétaire.

Lecture : 🖥 = votre PC · 🌐 = console Oracle / navigateur · 🔧 = serveur (SSH `admin-vpn@nedotab-vpn.duckdns.org`).

## 0. Avant de commencer (🖥)
```bash
npm test && npm run build:extension && npm run build:pwa && npm run verifier
git status --short   # seul site/installation.html peut rester modifié
```
Sauvegarde de l'existant : exportez vos données depuis Réglages (au cas où).

## 1. Clé de sauvegarde `age` (🖥, une fois)
```bash
age-keygen -o cle-age.txt          # affiche « Public key: age1… »
```
- Copier la ligne **Public key** (elle sert à l'étape 5).
- Ranger `cle-age.txt` dans votre gestionnaire de mots de passe **et** une 2ᵉ copie hors ligne. Sans elle, les sauvegardes sont illisibles.

## 2. Firebase : fonctions et règles (🖥)
Les secrets `VPN_JETON_AGENT` et `VPN_CLE_CHIFFREMENT` existent déjà (V5.2). Vérifier :
```bash
firebase functions:secrets:access VPN_JETON_AGENT --project prod >/dev/null && echo ok
```
Déployer (toutes les fonctions VPN, y compris `vpnAgentProfils`, `vpnAgentDeposerProfil`, `vpnAgentRapport`, `vpnSurveillance`, `vpnTacheQuotidienne`) :
```bash
npm run deployer:fonctions
npm run deployer:regles
```
Attendu : aucune erreur. En cas de refus du planificateur, activer l'API Cloud Scheduler dans la console Google Cloud.
Vérifier l'accès fermé : `curl -s -o /dev/null -w '%{http_code}\n' <url vpnAgentProfils>` → **401**.

## 3. Extension et site (🖥)
```bash
npm run package        # build + vérification + zip dans release/
npm run build:site && npm run verifier:site
```
- Recharger l'extension dans Chrome (`chrome://extensions` → Recharger). Chrome peut demander d'accepter les permissions **proxy**, **webRequest**, **privacy**.
- **Relire** la charte (`src/core/vpnCharte.js`) et la section VPN de `site/confidentialite.html` **avant** de publier le site.
- Publication de la web app et du site : seulement après votre relecture (`npm run deployer:pwa`).

## 4. Oracle (🌐)
Liste de sécurité du sous-réseau → règle d'entrée **UDP 51820** (source 0.0.0.0/0). Ne **pas** ouvrir 51821.

## 5. Serveur (🔧) — dans cet ordre
Copier les fichiers : `scp -r serveur admin-vpn@nedotab-vpn.duckdns.org:~/`

| # | Commande | Attendu |
|---|---|---|
| a | `sudo bash ~/scripts/20-wireguard.sh` avec `DOMAINE=nedotab-vpn.duckdns.org` | affiche **une seule fois** le mot de passe `admin-wg` : le ranger tout de suite |
| b | `sudo bash ~/scripts/21-rapport.sh` | « OK : rapport de volumes toutes les 15 minutes » |
| c | `sudo AGE_DESTINATAIRE=age1… bash ~/scripts/22-sauvegarde.sh` | première archive dans `/var/backups/vpn` |
| d | `journalctl -u vpn-wg-agent -n 5` | « wg : N profils, +X -Y, Z deposes » |
| e | `sudo bash ~/scripts/audit.sh \| tee audit-$(date +%F).txt` | **0 écart** (sinon : corriger puis relancer) |

Si l'étape a échoue (« L'API de wg-easy ne répond pas ») : `cd /opt/wg-easy && sudo docker compose logs --tail 30`. C'est ici que les routes lues dans le code v15.5.0 sont éprouvées pour la première fois. Ne pas contourner : noter le message dans `docs/tests/bugs-v5.md`.

Récupérer la sauvegarde sur votre PC : `scp admin-vpn@nedotab-vpn.duckdns.org:/var/backups/vpn/vpn-*.tar.gz.age ~/sauvegardes-vpn/` puis vérifier qu'elle se déchiffre : `age -d -i cle-age.txt <archive> | head -c 20` (doit afficher `FICHIERS:`).

## 6. Premiers contrôles de l'écran propriétaire (🖥)
Réglages → VPN → Invités : cliquer **Activer** (surveillance), puis attendre 30 minutes : « Serveur : en ligne ».

## 7. Essais réels (cocher `docs/tests/checklist-v5.md`)
Dans cet ordre, car chaque étape prépare la suivante :
1. **Votre propre accès** : s'inviter soi-même, accepter la **charte**, activer le VPN Chrome → pays et IP du serveur (indicateur) ; badge « ON ».
2. **Fuites** (domaine 29) : « Tester les fuites », puis les sites de test WebRTC et DNS → consigner dans `docs/tests/fuites-vpn.md`.
3. **Règles par site** (30) : une exception en direct, vérifier l'IP vue.
4. **WireGuard** (31) : afficher le QR (Réglages → VPN) → scanner avec l'app WireGuard d'un iPhone → IP du serveur dans un autre navigateur. Puis fichier `.conf` sur un PC. Puis « Ouvrir dans WireGuard » depuis la PWA iPhone : **noter si l'import marche**.
5. **Isolement** : deux appareils connectés, `ping` de l'adresse WireGuard de l'autre → échec ; `curl http://169.254.169.254` depuis un client → échec.
6. **Suivi** (32) : télécharger un gros fichier via WireGuard ; volume visible sous 15 min. Limite de 1 Go, alerte, coupure, rétablissement. « Couper maintenant » ≤ 2 min.
7. **Résilience** (33), à part et à un moment calme : sauvegarde restaurée, **reconstruction chronométrée** (`serveur/RECONSTRUIRE.md`), puis chaque rotation (`docs/rotation.md`) en notant la date.

## 8. Clôture
- Tous les bugs bloquants et majeurs corrigés (`docs/tests/bugs-v5.md`).
- Charte et confidentialité relues puis publiées.
- Seulement alors : marquer la V5 terminée dans `docs/roadmap.md`.

## Retour arrière
- Fonctions : redéployer le tag précédent (`git checkout v5.9.0 -- functions && npm run deployer:fonctions`).
- Serveur : `cd /opt/wg-easy && sudo docker compose down` coupe WireGuard sans toucher au proxy ; `sudo systemctl disable --now vpn-wg-agent.timer vpn-rapport.timer`.
- Extension : réinstaller le zip de la version précédente (garder le même dossier).
