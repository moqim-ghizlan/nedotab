#!/usr/bin/env bash
# V5.10 — Sauvegarde CHIFFRÉE de la configuration du serveur (jamais en clair sur le disque).
#   sudo bash sauvegarder.sh            (hebdomadaire via vpn-sauvegarde.timer, et avant une mise à jour)
# Contenu : volume de wg-easy (clés du serveur et des clients), configuration Squid SANS le fichier
# des comptes (l'agent le régénère), environnement de l'agent, identifiants wg-easy de l'agent,
# modèle docker-compose. Les certificats se régénèrent : non sauvegardés.
# Chiffrement : `age` vers une CLÉ PUBLIQUE ; la clé privée reste chez le propriétaire, jamais ici.
# Configuration : /etc/vpn-agent/sauvegarde.conf (droits 600)
#   AGE_DESTINATAIRE=age1...            clé publique du propriétaire
#   DESTINATION=moi@mon-pc:~/sauvegardes-vpn   (facultatif) copie hors du serveur par scp
# Sans DESTINATION, l'archive chiffrée reste dans /var/backups/vpn : à récupérer à la main.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer avec sudo." >&2
  exit 1
fi
CONF="${VPN_SAUVEGARDE_CONF:-/etc/vpn-agent/sauvegarde.conf}"
[ -r "$CONF" ] || { echo "Configuration absente : $CONF" >&2; exit 1; }
AGE_DESTINATAIRE="$(sed -n 's/^AGE_DESTINATAIRE=//p' "$CONF" | head -n 1)"
DESTINATION="$(sed -n 's/^DESTINATION=//p' "$CONF" | head -n 1)"
[[ "$AGE_DESTINATAIRE" =~ ^age1[a-z0-9]{50,}$ ]] || { echo "AGE_DESTINATAIRE invalide (clé publique « age1… »)." >&2; exit 1; }
command -v age >/dev/null || { echo "Installer age : apt-get install -y age" >&2; exit 1; }

DOSSIER=/var/backups/vpn
install -d -m 700 "$DOSSIER"
HORODATAGE="$(date +%Y%m%d-%H%M%S)"
SORTIE="$DOSSIER/vpn-$HORODATAGE.tar.gz.age"
umask 077

TMP_LISTE="$(mktemp)"
trap 'rm -f "$TMP_LISTE"' EXIT
{
  echo /etc/squid/squid.conf
  echo /etc/vpn-agent/env
  echo /etc/vpn-agent/wg-easy
  echo /opt/wg-easy/docker-compose.yml
} > "$TMP_LISTE"

# Un seul flux, jamais en clair sur le disque : deux archives (fichiers de configuration, volume de
# wg-easy) en base64 sur deux lignes, chiffrées par age.
(
  tar -czf - --files-from "$TMP_LISTE" --ignore-failed-read 2>/dev/null |
    base64 -w0 | sed 's/^/FICHIERS:/'
  echo
  docker run --rm -v wg-easy_etc_wireguard:/donnees:ro busybox tar -C /donnees -czf - . |
    base64 -w0 | sed 's/^/WIREGUARD:/'
  echo
) | age -r "$AGE_DESTINATAIRE" > "$SORTIE"

[ -s "$SORTIE" ] || { echo "Sauvegarde vide : abandon." >&2; rm -f "$SORTIE"; exit 1; }
chmod 600 "$SORTIE"

if [ -n "$DESTINATION" ]; then
  [[ "$DESTINATION" =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._/~-]+$ ]] || { echo "DESTINATION invalide." >&2; exit 1; }
  scp -q -o BatchMode=yes -o StrictHostKeyChecking=yes -i /root/.ssh/sauvegarde_ed25519 "$SORTIE" "$DESTINATION/" &&
    echo "Copie hors du serveur : OK" ||
    echo "Copie hors du serveur impossible : l'archive reste dans $DOSSIER." >&2
fi

# On garde les 8 dernières archives sur le serveur.
# shellcheck disable=SC2012
ls -1t "$DOSSIER"/vpn-*.tar.gz.age 2>/dev/null | tail -n +9 | xargs -r rm -f --
echo "Sauvegarde chiffrée : $SORTIE ($(stat -c %s "$SORTIE") octets)"
