#!/usr/bin/env bash
# V5.1 — Proxy HTTPS (Squid) avec authentification et certificat Let's Encrypt.
# sudo DOMAINE=nedotab-vpn.duckdns.org IP_PUBLIQUE=152.70.4.45 EMAIL=<ton e-mail> bash 10-proxy.sh
# Idempotent. Avant : ouvrir TCP 80 et 443 dans la liste de sécurité Oracle.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer avec sudo." >&2
  exit 1
fi
: "${DOMAINE:?variable DOMAINE manquante}"
: "${IP_PUBLIQUE:?variable IP_PUBLIQUE manquante}"
: "${EMAIL:?variable EMAIL manquante (pour le certificat)}"

MODELE="$(dirname "$(readlink -f "$0")")/../proxy/squid.conf.modele"
[ -f "$MODELE" ] || MODELE="$HOME/proxy/squid.conf.modele"
[ -f "$MODELE" ] || { echo "Modèle squid.conf.modele introuvable." >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y squid apache2-utils certbot

# Pare-feu système : 80 (certificat seulement) et 443 (proxy)
ufw allow 80/tcp comment 'Certificat Lets Encrypt'
ufw allow 443/tcp comment 'Proxy HTTPS'

# Hook de renouvellement : copie le certificat pour Squid puis recharge, sans coupure
install -d -m 750 -o root -g proxy /etc/squid/tls
install -d /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/squid.sh <<HOOK_EOF
#!/usr/bin/env bash
set -euo pipefail
install -m 640 -o root -g proxy "/etc/letsencrypt/live/$DOMAINE/fullchain.pem" /etc/squid/tls/fullchain.pem
install -m 640 -o root -g proxy "/etc/letsencrypt/live/$DOMAINE/privkey.pem" /etc/squid/tls/privkey.pem
systemctl reload squid || systemctl restart squid
HOOK_EOF
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/squid.sh

# Certificat (le port 80 doit être libre : Squid n'y écoute pas)
if [ ! -d "/etc/letsencrypt/live/$DOMAINE" ]; then
  systemctl stop squid || true
  certbot certonly --standalone --non-interactive --agree-tos -m "$EMAIL" -d "$DOMAINE"
fi
/etc/letsencrypt/renewal-hooks/deploy/squid.sh || true

# Comptes : fichier vide, droits stricts
[ -f /etc/squid/comptes ] || install -m 600 -o proxy -g proxy /dev/null /etc/squid/comptes

# Configuration
sed "s|@IP_PUBLIQUE@|$IP_PUBLIQUE|g" "$MODELE" > /etc/squid/squid.conf
squid -k parse

# Service : redémarrage automatique + durcissement systemd
install -d /etc/systemd/system/squid.service.d
cat > /etc/systemd/system/squid.service.d/durcissement.conf <<'UNIT_EOF'
[Service]
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes
ProtectHome=yes
PrivateTmp=yes
ProtectSystem=strict
ReadWritePaths=/var/log/squid /var/spool/squid /run
UNIT_EOF
systemctl daemon-reload

# Journaux : 7 jours
sed -i 's/^\(\s*\)rotate .*/\1rotate 7/' /etc/logrotate.d/squid || true

systemctl enable squid
systemctl restart squid
sleep 2
systemctl is-active squid
echo "OK : proxy sur https://$DOMAINE:443. Ajouter un compte : sudo bash ~/scripts/compte-ajouter.sh <nom>"
