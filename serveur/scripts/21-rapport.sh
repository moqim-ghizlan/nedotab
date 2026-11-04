#!/usr/bin/env bash
# V5.9 — Suivi du trafic : journal Squid réduit (compte + octets, aucune destination), assistant
# de lecture des compteurs, agent de rapport toutes les 15 minutes. Idempotent.
#   sudo bash 21-rapport.sh   (après 10-proxy.sh, 20-agent.sh et 20-wireguard.sh)
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer avec sudo." >&2
  exit 1
fi
RACINE="$(dirname "$(readlink -f "$0")")/.."
[ -f "$RACINE/agent/vpn-rapport-agent.py" ] || RACINE="$HOME"
for f in agent/vpn-rapport-agent.py agent/vpn-compteurs.sh systemd/vpn-rapport.service systemd/vpn-rapport.timer; do
  [ -f "$RACINE/$f" ] || { echo "Fichier manquant : $f." >&2; exit 1; }
done
[ -s /etc/vpn-agent/wg-easy ] || { echo "Lancer d'abord 20-wireguard.sh." >&2; exit 1; }

# Journal réduit de Squid : « compte octets_reçus octets_envoyés ». logformat sans %ru ni %>a.
CONF=/etc/squid/squid.conf
if ! grep -q '^logformat octets ' "$CONF"; then
  cp -a "$CONF" "$CONF.avant-v59"
  cat >> "$CONF" <<'CONF'

# V5.9 — volumes par compte (jamais de destination)
logformat octets %un %>st %<st
access_log stdio:/var/log/squid/octets.log octets
CONF
fi
squid -k parse
install -m 640 -o proxy -g adm /dev/null /var/log/squid/octets.log 2>/dev/null || touch /var/log/squid/octets.log
systemctl reload squid

install -d -m 700 -o vpn-agent -g vpn-agent /var/lib/vpn-agent
install -m 755 -o root -g root "$RACINE/agent/vpn-rapport-agent.py" /usr/local/sbin/vpn-rapport
install -m 750 -o root -g root "$RACINE/agent/vpn-compteurs.sh" /usr/local/sbin/vpn-compteurs
install -m 644 "$RACINE/systemd/vpn-rapport.service" /etc/systemd/system/vpn-rapport.service
install -m 644 "$RACINE/systemd/vpn-rapport.timer" /etc/systemd/system/vpn-rapport.timer
echo 'vpn-agent ALL=(root) NOPASSWD: /usr/local/sbin/vpn-compteurs' > /etc/sudoers.d/92-vpn-rapport
chmod 440 /etc/sudoers.d/92-vpn-rapport
visudo -cf /etc/sudoers.d/92-vpn-rapport >/dev/null

systemctl daemon-reload
systemctl enable --now vpn-rapport.timer
echo "OK : rapport de volumes toutes les 15 minutes. Journal : journalctl -u vpn-rapport -n 10."
echo "Contrôle de confidentialité : head -3 /var/log/squid/octets.log ne doit montrer que « compte octets octets »."
