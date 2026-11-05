#!/usr/bin/env bash
# V5.10 — Restaure une sauvegarde faite par sauvegarder.sh sur un serveur NEUF (après 01 à 20).
#   sudo CLE_PRIVEE=/chemin/cle-age.txt bash restaurer.sh vpn-AAAAMMJJ-HHMMSS.tar.gz.age
# La clé privée `age` est celle du propriétaire : elle est copiée ici le temps de la commande, puis
# SUPPRIMÉE par l'utilisateur (shred -u). Elle n'est jamais conservée sur le serveur.
# Le fichier des comptes du proxy n'est pas restauré : l'agent le régénère en une minute.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer avec sudo." >&2
  exit 1
fi
ARCHIVE="${1:?archive .age manquante}"
: "${CLE_PRIVEE:?variable CLE_PRIVEE manquante (chemin de la clé privée age)}"
[ -r "$ARCHIVE" ] && [ -r "$CLE_PRIVEE" ] || { echo "Fichier illisible." >&2; exit 1; }
command -v age >/dev/null || { echo "Installer age : apt-get install -y age" >&2; exit 1; }
command -v docker >/dev/null || { echo "Lancer d'abord 20-wireguard.sh (Docker)." >&2; exit 1; }

# Déchiffrement en mémoire : les deux lignes ne passent jamais par un fichier en clair.
CONTENU="$(age -d -i "$CLE_PRIVEE" "$ARCHIVE")"
FICHIERS="$(printf '%s\n' "$CONTENU" | sed -n 's/^FICHIERS://p' | head -n 1)"
WIREGUARD="$(printf '%s\n' "$CONTENU" | sed -n 's/^WIREGUARD://p' | head -n 1)"
unset CONTENU
[ -n "$FICHIERS" ] && [ -n "$WIREGUARD" ] || { echo "Archive invalide." >&2; exit 1; }

# Les clés serveur de WireGuard : même volume, donc mêmes clés et mêmes profils, sans que les
# invités aient à reconfigurer quoi que ce soit (même domaine, même port).
docker volume inspect wg-easy_etc_wireguard >/dev/null 2>&1 || docker volume create wg-easy_etc_wireguard >/dev/null
(cd /opt/wg-easy 2>/dev/null && docker compose stop wg-easy) || true
printf '%s' "$WIREGUARD" | base64 -d |
  docker run --rm -i -v wg-easy_etc_wireguard:/donnees busybox tar -C /donnees -xzf -
unset WIREGUARD

# Fichiers de configuration, aux mêmes endroits, droits d'origine conservés par tar.
printf '%s' "$FICHIERS" | base64 -d | tar -C / -xzf -
unset FICHIERS
chown root:vpn-agent /etc/vpn-agent/env /etc/vpn-agent/wg-easy 2>/dev/null || true
chmod 640 /etc/vpn-agent/env /etc/vpn-agent/wg-easy 2>/dev/null || true

(cd /opt/wg-easy && : > init.env && chmod 600 init.env && docker compose up -d)
systemctl reload squid 2>/dev/null || true
echo "Restauration terminée. Supprimez la clé privée copiée ici : shred -u \"$CLE_PRIVEE\""
echo "Si l'adresse IP a changé, mettez à jour le DNS (DuckDNS) puis lancez serveur/scripts/audit.sh."
