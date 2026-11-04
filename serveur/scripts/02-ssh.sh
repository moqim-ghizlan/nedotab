#!/usr/bin/env bash
# V5.0 — Durcissement SSH + fail2ban.
# Garder la session actuelle OUVERTE, tester l'accès dans une seconde session avant de la fermer.
# sudo bash 02-ssh.sh   (idempotent)
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer avec sudo." >&2
  exit 1
fi

# Tant que admin-vpn n'est pas vérifié, on garde « ubuntu ». Pour le retirer : ALLOW_UBUNTU=0
ALLOW_UBUNTU="${ALLOW_UBUNTU:-1}"
USERS="admin-vpn"
[ "$ALLOW_UBUNTU" = "1" ] && USERS="$USERS ubuntu"

if [ ! -s /home/admin-vpn/.ssh/authorized_keys ]; then
  echo "Refus : admin-vpn n'a pas de clé SSH (lancer 01-base.sh d'abord)." >&2
  exit 1
fi

CONF="/etc/ssh/sshd_config.d/10-durcissement.conf"
cat > "$CONF" <<CONF_EOF
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
AllowUsers $USERS
MaxAuthTries 3
CONF_EOF
chmod 644 "$CONF"

# Vérifier AVANT de recharger : en cas d'erreur, on restaure et on s'arrête
if ! sshd -t; then
  rm -f "$CONF"
  echo "Configuration SSH invalide, fichier retiré." >&2
  exit 1
fi
systemctl reload ssh || systemctl reload sshd

export DEBIAN_FRONTEND=noninteractive
apt-get install -y fail2ban
cat > /etc/fail2ban/jail.d/sshd.local <<'JAIL_EOF'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
JAIL_EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "OK : SSH durci (utilisateurs : $USERS). Ouvre une SECONDE session pour vérifier."
