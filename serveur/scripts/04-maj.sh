#!/usr/bin/env bash
# V5.0 — Mises à jour de sécurité automatiques, redémarrage nocturne à 4 h.
# sudo bash 04-maj.sh   (idempotent)
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer avec sudo." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get install -y unattended-upgrades

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF_A'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF_A

cat > /etc/apt/apt.conf.d/52nedotab-maj <<'EOF_B'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF_B

systemctl enable --now unattended-upgrades
unattended-upgrade --dry-run
echo "OK. Journal : /var/log/unattended-upgrades/unattended-upgrades.log"
