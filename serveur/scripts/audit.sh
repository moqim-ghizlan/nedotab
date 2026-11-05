#!/usr/bin/env bash
# V5.10 — Audit de sécurité du serveur : LECTURE SEULE, rien n'est modifié.
#   sudo bash audit.sh | tee audit-AAAA-MM-JJ.txt
# Chaque contrôle affiche OK ou ÉCART. Code de sortie : nombre d'écarts (0 = aucun).
# À consigner dans docs/securite-serveur.md avec la date.
set -uo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer avec sudo." >&2
  exit 1
fi
ECARTS=0
ok() { echo "OK     $1"; }
ecart() { echo "ÉCART  $1"; ECARTS=$((ECARTS + 1)); }
verifier() { # verifier <libellé> <commande...>
  local libelle="$1"
  shift
  if "$@" >/dev/null 2>&1; then ok "$libelle"; else ecart "$libelle"; fi
}
droits() { # droits <fichier> <droits attendus séparés par des espaces>
  [ -e "$1" ] || { echo "ABSENT $1 (non installé)"; return; }
  local d
  d="$(stat -c %a "$1")"
  case " $2 " in *" $d "*) ok "droits de $1 ($d)" ;; *) ecart "droits de $1 : $d (attendu : $2)" ;; esac
}

echo "== Ports en écoute (ss -tulpn) =="
ss -H -tuln | awk '{print $1, $5}' | sort -u
# Autorisés : 22/tcp, 80/tcp (certificat), 443/tcp, 51820/udp ; 51821/tcp seulement sur 127.0.0.1.
INATTENDUS="$(ss -H -tuln | awk '{print $1, $5}' | grep -Ev '127\.0\.0\.(1|53|54):|\[::1\]:|^udp .*:(68|123)$|:(22|80|443)$|^udp .*:51820$|^udp .*%lo:' || true)"
[ -z "$INATTENDUS" ] && ok "aucun port inattendu en écoute" || { ecart "ports inattendus :"; echo "$INATTENDUS"; }
ss -H -tln | awk '$4 ~ /:51821$/ {print $4}' | grep -qvE '^127\.0\.0\.1:51821$' &&
  ecart "l'interface wg-easy n'écoute pas qu'en local" || ok "interface wg-easy (51821) en local seulement"

echo "== SSH =="
S="$(sshd -T 2>/dev/null)"
echo "$S" | grep -qx 'passwordauthentication no' && ok "mot de passe SSH refusé" || ecart "mot de passe SSH autorisé"
echo "$S" | grep -Eqx 'permitrootlogin (no|prohibit-password|without-password)' && ok "connexion root par mot de passe refusée" || ecart "PermitRootLogin"
verifier "fail2ban actif" systemctl is-active --quiet fail2ban

echo "== Pare-feu =="
ufw status | grep -q '^Status: active' && ok "ufw actif" || ecart "ufw inactif"
verifier "règles Docker : FORWARD présent" iptables -S FORWARD
docker exec wg-easy iptables -C FORWARD -i wg0 -o wg0 -j DROP >/dev/null 2>&1 && ok "clients WireGuard isolés entre eux" || ecart "isolation client → client absente (vpn-wg-isoler)"
docker exec wg-easy iptables -C FORWARD -i wg0 -d 169.254.0.0/16 -j DROP >/dev/null 2>&1 && ok "métadonnées Oracle (169.254/16) inaccessibles aux clients WireGuard" || ecart "169.254.0.0/16 accessible aux clients WireGuard"

echo "== Mises à jour =="
verifier "mises à jour automatiques actives" systemctl is-enabled --quiet unattended-upgrades
[ -f /var/run/reboot-required ] && ecart "redémarrage requis (noyau à jour non chargé)" || ok "aucun redémarrage en attente"
uptime -s

echo "== Fichiers sensibles =="
droits /etc/vpn-agent/env "640 600"
droits /etc/vpn-agent/wg-easy "640 600"
droits /etc/vpn-agent/sauvegarde.conf "600"
droits /etc/squid/comptes "600 640"
droits /var/lib/vpn-agent/compteurs.json "600"
droits /opt/wg-easy/init.env "600"
[ -s /opt/wg-easy/init.env ] && ecart "init.env n'est pas vide (INIT_* à vider après installation)" || ok "init.env vide"

echo "== Proxy =="
grep -q '^forwarded_for delete' /etc/squid/squid.conf && ok "pas d'en-tête révélant l'IP (forwarded_for delete)" || ecart "forwarded_for"
grep -q '^via off' /etc/squid/squid.conf && ok "via off" || ecart "via"
grep -q '^access_log none' /etc/squid/squid.conf && ok "pas de journal d'accès Squid classique" || ecart "access_log none absent"
grep -E '^access_log' /etc/squid/squid.conf | grep -v 'none' | grep -vq 'octets' && ecart "un journal d'accès autre que « octets »" || ok "seul journal : volumes (format octets)"
grep -q '^logformat octets %un %>st %<st$' /etc/squid/squid.conf && ok "format du journal de volumes = compte + octets" || echo "INFO   journal de volumes non installé (21-rapport.sh)"
grep -q '^acl interne dst' /etc/squid/squid.conf && ok "destinations internes bloquées" || ecart "destinations internes"

echo "== Journaux : aucune destination =="
# Une adresse web dans un journal du proxy ou du conteneur serait un écart.
TROUVE="$(grep -rEl 'https?://|CONNECT ' /var/log/squid 2>/dev/null || true)"
[ -z "$TROUVE" ] && ok "aucune adresse web dans /var/log/squid" || { ecart "adresses web dans : $TROUVE"; }
docker logs wg-easy 2>&1 | grep -Eq 'https?://[a-z0-9.-]+\.[a-z]{2,}/' && echo "INFO   des adresses apparaissent dans les journaux de wg-easy : vérifier à la main (docker logs wg-easy)" || ok "journaux de wg-easy sans adresse web"

echo "== Versions épinglées =="
grep -E 'image:' /opt/wg-easy/docker-compose.yml
grep -q ':latest' /opt/wg-easy/docker-compose.yml && ecart "image « latest »" || ok "image wg-easy épinglée"
squid -v 2>/dev/null | head -n 1
echo "Consulter les avis de sécurité officiels : wg-easy (GitHub Security), Squid (squid-cache.org/Advisories)."

echo
echo "$ECARTS écart(s)."
exit "$ECARTS"
