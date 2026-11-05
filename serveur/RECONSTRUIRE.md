# Reconstruire le serveur VPN (objectif : moins de 30 minutes)

Scénario : l'instance Oracle a été récupérée, détruite ou compromise. Les invités ne doivent **pas**
avoir à reconfigurer WireGuard : on garde le **même domaine**, le **même port** et les **mêmes clés
serveur** (elles sont dans la sauvegarde chiffrée).

> Statut : procédure **écrite mais pas encore chronométrée**. Elle n'est valable qu'après un essai
> réel (voir « Chronométrer » en bas). Toute commande sur le serveur se fait avec votre accord.

## Ce qu'il vous faut avant (à garder hors du serveur)
- La **clé privée `age`** (celle qui correspond à `AGE_DESTINATAIRE`) dans votre gestionnaire de mots de passe.
- Une **archive** `vpn-AAAAMMJJ-HHMMSS.tar.gz.age` récente (copiée par `scp`, ou prise dans `/var/backups/vpn` si l'ancien serveur répond encore).
- Le jeton de l'agent (`VPN_JETON_AGENT`, Secret Manager Firebase) et l'URL `vpnAgentSynchro`.
- L'accès à DuckDNS (ou au DNS du domaine) et à la console Oracle.

## Étapes (chronométrer chacune)
1. **Nouvelle VM** (console Oracle, Ubuntu LTS ARM, `VM.Standard.A1.Flex`), clé SSH publique ajoutée. Liste de sécurité : TCP 22, 80, 443, UDP 51820. *(5 min)*
2. **DNS** : pointer le domaine (DuckDNS) vers la nouvelle IP **avant** le certificat. *(2 min)*
3. **Scripts de base** : copier `serveur/` (`scp -r serveur admin@<ip>:~/`), puis `sudo bash` dans l'ordre : `01-base.sh`, `02-ssh.sh`, `03-parefeu.sh`, `04-maj.sh`. *(5 min)*
4. **Proxy** : `10-proxy.sh` (variables `DOMAINE`, `IP_PUBLIQUE`, `EMAIL`), puis `20-agent.sh` (jeton demandé en saisie masquée). *(5 min)*
5. **WireGuard** : `20-wireguard.sh` crée un volume **neuf** ; on l'écrase tout de suite à l'étape 6. *(5 min)*
6. **Restauration** :
   ```bash
   scp ~/sauvegardes-vpn/vpn-AAAAMMJJ-HHMMSS.tar.gz.age admin-vpn@<domaine>:~/
   scp ~/cle-age.txt admin-vpn@<domaine>:~/        # temporaire
   ssh admin-vpn@<domaine>
   sudo apt-get install -y age
   sudo CLE_PRIVEE=$HOME/cle-age.txt bash ~/scripts/restaurer.sh ~/vpn-AAAAMMJJ-HHMMSS.tar.gz.age
   shred -u ~/cle-age.txt
   ```
   Les clés serveur et les profils WireGuard reviennent ; les comptes du proxy sont régénérés par l'agent en une minute. *(3 min)*
7. **Sauvegarde** : `22-sauvegarde.sh` (même clé publique `age`). *(1 min)*
8. **Suivi** : `21-rapport.sh`. *(1 min)*
9. **Vérifier** : `sudo bash ~/scripts/audit.sh` (aucun écart), `serveur/tests/tester-proxy.sh` depuis votre PC, et un téléphone avec **son ancien profil WireGuard** : l'adresse vue doit être celle de la nouvelle IP. *(3 min)*

## Pièges
- **Clés serveur restaurées mais DNS pas à jour** : les invités ne se connectent plus. Vérifier `nslookup <domaine>` avant de conclure.
- **Certificat** : `10-proxy.sh` en redemande un ; le DNS doit déjà pointer sur la nouvelle machine.
- **Archive sans la clé privée `age`** : irrécupérable. Gardez la clé privée dans deux endroits.
- Les **statistiques** et la **liste des invités** sont dans Firebase : rien à restaurer.

## Chronométrer (à faire une fois)
Faire l'essai sur une seconde VM gratuite si les limites Always Free le permettent, sinon recréer
l'instance pendant une période calme. Noter ci-dessous l'heure de début, de fin et chaque étape.

| Étape | Durée | Remarque |
|---|---|---|
| 1 à 9 | *à mesurer* | |

Total : *à mesurer* (objectif < 30 min). Date de l'essai : *à renseigner*.
