#!/usr/bin/env bash
# V5.7 — WireGuard : Docker, wg-easy (image épinglée), isolement des clients, agent de profils.
# Idempotent. À lancer APRÈS 20-agent.sh (le jeton de l'agent doit exister dans /etc/vpn-agent/env).
#   sudo DOMAINE=nedotab-vpn.duckdns.org bash 20-wireguard.sh
# Le mot de passe de l'interface wg-easy est généré ici, affiché UNE fois (à ranger dans le
# gestionnaire de mots de passe) et gardé pour l'agent dans /etc/vpn-agent/wg-easy (640).
# Ouvre UDP 51820 dans ufw. La liste de sécurité Oracle doit AUSSI l'ouvrir (console Oracle).
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer avec sudo." >&2
  exit 1
fi
: "${DOMAINE:?variable DOMAINE manquante}"
[[ "$DOMAINE" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "Domaine invalide." >&2; exit 1; }
[ -s /etc/vpn-agent/env ] || { echo "Lancer d'abord 20-agent.sh." >&2; exit 1; }
# Adresses des fonctions de profils, rapport : les fonctions v2 n'ont pas toutes la même forme
# d'adresse (vpnAgentSynchro est en *.run.app) : on les écrit EXPLICITEMENT dans l'environnement.
URL_FONCTIONS="${URL_FONCTIONS:-https://europe-west1-nedotab-app.cloudfunctions.net}"
[[ "$URL_FONCTIONS" =~ ^https://[A-Za-z0-9.-]+$ ]] || { echo "URL_FONCTIONS invalide." >&2; exit 1; }

RACINE="$(dirname "$(readlink -f "$0")")/.."
[ -f "$RACINE/wireguard/docker-compose.yml" ] || RACINE="$HOME"
for f in wireguard/docker-compose.yml agent/vpn-wg-agent.py agent/vpn-wg-isoler.sh \
  systemd/vpn-wg-agent.service systemd/vpn-wg-agent.timer; do
  [ -f "$RACINE/$f" ] || { echo "Fichier manquant : $f (copier serveur/wireguard, agent, systemd)." >&2; exit 1; }
done

export DEBIAN_FRONTEND=noninteractive

# --- Docker, depuis le dépôt officiel (paquets signés)
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
systemctl enable --now docker

# --- Pare-feu système : UDP 51820 (Docker publie ce port lui-même, ufw le documente et le garde)
ufw allow 51820/udp comment 'WireGuard' >/dev/null

# --- wg-easy
install -d -m 750 /opt/wg-easy
install -m 644 "$RACINE/wireguard/docker-compose.yml" /opt/wg-easy/docker-compose.yml
install -d -m 750 -o root -g vpn-agent /etc/vpn-agent

PREMIERE=0
if ! docker volume inspect wg-easy_etc_wireguard >/dev/null 2>&1; then
  PREMIERE=1
  MDP="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32)"
  umask 077
  # Premier démarrage seulement : INIT_* (doc wg-easy « unattended setup »). Vidé ensuite.
  cat > /opt/wg-easy/init.env <<EOF
INIT_ENABLED=true
INIT_USERNAME=admin-wg
INIT_PASSWORD=${MDP}
INIT_HOST=${DOMAINE}
INIT_PORT=51820
INIT_DNS=9.9.9.9,149.112.112.112
INIT_ALLOWED_IPS=0.0.0.0/0,::/0
EOF
  umask 027
  printf 'WG_UTILISATEUR=admin-wg\nWG_MOT_DE_PASSE=%s\n' "$MDP" > /etc/vpn-agent/wg-easy
  chown root:vpn-agent /etc/vpn-agent/wg-easy
  chmod 640 /etc/vpn-agent/wg-easy
else
  : > /opt/wg-easy/init.env
fi
chmod 600 /opt/wg-easy/init.env

(cd /opt/wg-easy && docker compose up -d)

# --- Attendre l'API locale, puis vider init.env (les variables INIT_* ne servent qu'une fois)
UTILISATEUR="$(sed -n 's/^WG_UTILISATEUR=//p' /etc/vpn-agent/wg-easy)"
for _ in $(seq 1 30); do
  if printf 'user = "%s:%s"\n' "$UTILISATEUR" "$(sed -n 's/^WG_MOT_DE_PASSE=//p' /etc/vpn-agent/wg-easy)" |
    curl -sf -K - -o /dev/null http://127.0.0.1:51821/api/client; then
    PRET=1
    break
  fi
  sleep 2
done
if [ "${PRET:-0}" != 1 ]; then
  echo "L'API de wg-easy ne répond pas : docker compose logs --tail 30 (dans /opt/wg-easy)." >&2
  exit 1
fi
: > /opt/wg-easy/init.env

# --- Adresses des fonctions pour les agents (profils, dépôt, rapport) : remplacées à chaque lancement
sed -i '/^VPN_WG_URL_/d' /etc/vpn-agent/env
printf 'VPN_WG_URL_PROFILS=%s/vpnAgentProfils
VPN_WG_URL_DEPOT=%s/vpnAgentDeposerProfil
VPN_WG_URL_RAPPORT=%s/vpnAgentRapport
'   "$URL_FONCTIONS" "$URL_FONCTIONS" "$URL_FONCTIONS" >> /etc/vpn-agent/env
chown root:vpn-agent /etc/vpn-agent/env
chmod 640 /etc/vpn-agent/env

# --- Agent de profils et isolement
id vpn-agent >/dev/null 2>&1 || { echo "Utilisateur vpn-agent absent : lancer 20-agent.sh." >&2; exit 1; }
install -m 755 -o root -g root "$RACINE/agent/vpn-wg-agent.py" /usr/local/sbin/vpn-wg-agent
install -m 750 -o root -g root "$RACINE/agent/vpn-wg-isoler.sh" /usr/local/sbin/vpn-wg-isoler
install -m 644 "$RACINE/systemd/vpn-wg-agent.service" /etc/systemd/system/vpn-wg-agent.service
install -m 644 "$RACINE/systemd/vpn-wg-agent.timer" /etc/systemd/system/vpn-wg-agent.timer
echo 'vpn-agent ALL=(root) NOPASSWD: /usr/local/sbin/vpn-wg-isoler' > /etc/sudoers.d/91-vpn-wg
chmod 440 /etc/sudoers.d/91-vpn-wg
visudo -cf /etc/sudoers.d/91-vpn-wg >/dev/null

/usr/local/sbin/vpn-wg-isoler
systemctl daemon-reload
systemctl enable --now vpn-wg-agent.timer

echo "OK : WireGuard sur UDP 51820, interface sur 127.0.0.1:51821 (tunnel SSH)."
if [ "$PREMIERE" = 1 ]; then
  echo "Identifiant de l'interface : admin-wg"
  echo "Mot de passe (affiché UNE seule fois, à ranger dans votre gestionnaire) : ${MDP}"
fi
echo "Penser à ouvrir UDP 51820 dans la liste de sécurité Oracle."
echo "Vérifier les règles effectives : sudo iptables -S ; sudo docker exec wg-easy iptables -S FORWARD"
