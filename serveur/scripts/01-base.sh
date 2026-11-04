#!/usr/bin/env bash
# V5.0 — Base : mises à jour, utilisateur admin-vpn, fuseau, nom d'hôte.
# À lancer en root : sudo bash 01-base.sh   (idempotent)
set -euo pipefail

ADMIN="admin-vpn"
HOSTNAME_VPN="${HOSTNAME_VPN:-nedotab-vpn}"
TIMEZONE="${TIMEZONE:-Europe/Paris}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer avec sudo." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

if ! id "$ADMIN" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$ADMIN"
fi
usermod -aG sudo "$ADMIN"

# sudo sans mot de passe (connexion par clé uniquement, pas de mot de passe défini)
echo "$ADMIN ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$ADMIN"
chmod 440 "/etc/sudoers.d/90-$ADMIN"
visudo -cf "/etc/sudoers.d/90-$ADMIN" >/dev/null

# Copie la clé publique de l'utilisateur par défaut (ubuntu) vers admin-vpn
SRC="/home/ubuntu/.ssh/authorized_keys"
DST_DIR="/home/$ADMIN/.ssh"
if [ -f "$SRC" ]; then
  install -d -m 700 -o "$ADMIN" -g "$ADMIN" "$DST_DIR"
  touch "$DST_DIR/authorized_keys"
  while IFS= read -r ligne; do
    [ -z "$ligne" ] && continue
    grep -qxF "$ligne" "$DST_DIR/authorized_keys" || echo "$ligne" >> "$DST_DIR/authorized_keys"
  done < "$SRC"
  chown "$ADMIN:$ADMIN" "$DST_DIR/authorized_keys"
  chmod 600 "$DST_DIR/authorized_keys"
fi

timedatectl set-timezone "$TIMEZONE"
hostnamectl set-hostname "$HOSTNAME_VPN"
grep -q "$HOSTNAME_VPN" /etc/hosts || echo "127.0.1.1 $HOSTNAME_VPN" >> /etc/hosts

echo "OK : base prête. Teste maintenant : ssh $ADMIN@<ip> (dans une seconde fenêtre)."
