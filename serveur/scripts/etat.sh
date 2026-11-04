#!/usr/bin/env bash
# État du serveur : charge, mémoire, disque, services, mises à jour, bannissements.
# Ne lit aucun journal de trafic des utilisateurs.
set -uo pipefail

echo "== Charge ==";   uptime
echo "== Mémoire ==";  free -h
echo "== Disque ==";   df -h /
echo "== Services =="
for s in ssh fail2ban unattended-upgrades; do
  etat=$(systemctl is-active "$s" 2>/dev/null) || true
  printf '%-22s %s\n' "$s" "${etat:-inconnu}"
done
echo "== Pare-feu =="; sudo ufw status 2>/dev/null | head -20
echo "== Dernières mises à jour =="
tail -n 5 /var/log/unattended-upgrades/unattended-upgrades.log 2>/dev/null || echo "aucune"
echo "== Bannissements fail2ban =="
sudo fail2ban-client status sshd 2>/dev/null || echo "fail2ban indisponible"
[ -f /var/run/reboot-required ] && echo "!! Redémarrage requis"
exit 0
