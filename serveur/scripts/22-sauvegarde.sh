#!/usr/bin/env bash
# V5.10 — Installe la sauvegarde chiffrée hebdomadaire. Idempotent.
#   sudo AGE_DESTINATAIRE=age1... [DESTINATION=moi@mon-pc:~/sauvegardes-vpn] bash 22-sauvegarde.sh
# La clé PUBLIQUE vient de `age-keygen` lancé sur VOTRE ordinateur ; la clé privée n'est jamais
# copiée ici (elle sert seulement à restaurer, voir RECONSTRUIRE.md).
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer avec sudo." >&2
  exit 1
fi
: "${AGE_DESTINATAIRE:?variable AGE_DESTINATAIRE manquante (clé publique age1...)}"
[[ "$AGE_DESTINATAIRE" =~ ^age1[a-z0-9]{50,}$ ]] || { echo "Clé publique invalide." >&2; exit 1; }

RACINE="$(dirname "$(readlink -f "$0")")/.."
[ -f "$RACINE/scripts/sauvegarder.sh" ] || RACINE="$HOME"
for f in scripts/sauvegarder.sh scripts/restaurer.sh systemd/vpn-sauvegarde.service systemd/vpn-sauvegarde.timer; do
  [ -f "$RACINE/$f" ] || { echo "Fichier manquant : $f." >&2; exit 1; }
done

apt-get install -y age
install -d -m 750 /etc/vpn-agent
umask 077
printf 'AGE_DESTINATAIRE=%s\nDESTINATION=%s\n' "$AGE_DESTINATAIRE" "${DESTINATION:-}" > /etc/vpn-agent/sauvegarde.conf
install -m 750 -o root -g root "$RACINE/scripts/sauvegarder.sh" /usr/local/sbin/vpn-sauvegarder
install -m 750 -o root -g root "$RACINE/scripts/restaurer.sh" /usr/local/sbin/vpn-restaurer
install -m 644 "$RACINE/systemd/vpn-sauvegarde.service" /etc/systemd/system/vpn-sauvegarde.service
install -m 644 "$RACINE/systemd/vpn-sauvegarde.timer" /etc/systemd/system/vpn-sauvegarde.timer
systemctl daemon-reload
systemctl enable --now vpn-sauvegarde.timer
systemctl start vpn-sauvegarde.service
echo "OK : sauvegarde chiffrée chaque dimanche. Archives : /var/backups/vpn (chiffrées)."
if [ -n "${DESTINATION:-}" ]; then
  echo "Copie hors du serveur : créer la clé /root/.ssh/sauvegarde_ed25519 et l'autoriser sur $DESTINATION (voir README)."
fi
