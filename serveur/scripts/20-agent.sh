#!/usr/bin/env bash
# V5.2 — Installe l'agent de synchronisation des comptes. Idempotent.
# sudo VPN_AGENT_URL=https://europe-west1-<projet>.cloudfunctions.net/vpnAgentSynchro bash 20-agent.sh
# Le jeton secret est demandé en saisie masquée (jamais en argument, jamais dans l'historique).
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer avec sudo." >&2
  exit 1
fi
: "${VPN_AGENT_URL:?variable VPN_AGENT_URL manquante}"
[[ "$VPN_AGENT_URL" =~ ^https://[A-Za-z0-9./_-]+$ ]] || { echo "Adresse invalide." >&2; exit 1; }

RACINE="$(dirname "$(readlink -f "$0")")/.."
[ -f "$RACINE/agent/vpn-agent.sh" ] || RACINE="$HOME"
for f in agent/vpn-agent.sh agent/vpn-agent-appliquer.sh systemd/vpn-agent.service systemd/vpn-agent.timer; do
  [ -f "$RACINE/$f" ] || { echo "Fichier manquant : $f (copier serveur/agent et serveur/systemd)." >&2; exit 1; }
done

id vpn-agent >/dev/null 2>&1 ||
  useradd --system --home-dir /var/lib/vpn-agent --create-home --shell /usr/sbin/nologin vpn-agent
install -d -m 700 -o vpn-agent -g vpn-agent /var/lib/vpn-agent

install -m 755 -o root -g root "$RACINE/agent/vpn-agent.sh" /usr/local/sbin/vpn-agent
install -m 750 -o root -g root "$RACINE/agent/vpn-agent-appliquer.sh" /usr/local/sbin/vpn-agent-appliquer
install -m 644 "$RACINE/systemd/vpn-agent.service" /etc/systemd/system/vpn-agent.service
install -m 644 "$RACINE/systemd/vpn-agent.timer" /etc/systemd/system/vpn-agent.timer

# sudo : une seule commande, un seul utilisateur
echo 'vpn-agent ALL=(root) NOPASSWD: /usr/local/sbin/vpn-agent-appliquer /var/lib/vpn-agent/comptes.candidat' \
  > /etc/sudoers.d/90-vpn-agent
chmod 440 /etc/sudoers.d/90-vpn-agent
visudo -cf /etc/sudoers.d/90-vpn-agent >/dev/null

# Jeton : demandé une seule fois, gardé dans /etc/vpn-agent/env (droits 640, groupe vpn-agent)
install -d -m 750 -o root -g vpn-agent /etc/vpn-agent
if [ ! -s /etc/vpn-agent/env ] || [ "${CHANGER_JETON:-0}" = "1" ]; then
  read -r -s -p "Jeton de l agent (saisie masquée) : " JETON < /dev/tty
  echo
  [[ "$JETON" =~ ^[A-Za-z0-9_-]{20,}$ ]] || { echo "Jeton invalide (20 caractères minimum : A-Z a-z 0-9 _ -)." >&2; exit 1; }
  umask 027
  printf 'VPN_AGENT_URL=%s\nVPN_AGENT_JETON=%s\n' "$VPN_AGENT_URL" "$JETON" > /etc/vpn-agent/env
  unset JETON
fi
chown root:vpn-agent /etc/vpn-agent/env
chmod 640 /etc/vpn-agent/env

systemctl daemon-reload
systemctl enable --now vpn-agent.timer
systemctl start vpn-agent.service || true
echo "OK : l agent tourne chaque minute. Journal : journalctl -u vpn-agent -n 20 (nombre de comptes seulement)."
