#!/usr/bin/env bash
# V5.1 — Teste le proxy depuis ton ordinateur. Aucun secret en dur :
#   PROXY_DOMAINE=nedotab-vpn.duckdns.org PROXY_COMPTE=<nom> PROXY_MDP=<mot de passe> \
#   PROXY_IP=152.70.4.45 bash serveur/tests/tester-proxy.sh
set -uo pipefail

: "${PROXY_DOMAINE:?manquant}" "${PROXY_COMPTE:?manquant}" "${PROXY_MDP:?manquant}" "${PROXY_IP:?manquant}"
PROXY="https://$PROXY_DOMAINE:443"
ECHECS=0

# Appel curl dont les identifiants passent par stdin (pas dans la liste des processus)
requete() { # $1 = mot de passe ("-" = aucun identifiant), $2 = URL
  if [ "$1" = "-" ]; then
    curl -s -o /dev/null -w '%{http_code}' --max-time 20 -x "$PROXY" "$2" 2>/dev/null
  else
    printf 'proxy-user = "%s:%s"\n' "$PROXY_COMPTE" "$1" |
      curl -s -o /dev/null -w '%{http_code}' --max-time 20 -x "$PROXY" -K - "$2" 2>/dev/null
  fi
}
verifier() { # $1 = libellé, $2 = attendu ("200" ou "refus"), $3 = code obtenu
  if { [ "$2" = "200" ] && [ "$3" = "200" ]; } || { [ "$2" = "refus" ] && [ "$3" != "200" ]; }; then
    echo "OK    $1 ($3)"
  else
    echo "ECHEC $1 (code $3, attendu $2)"
    ECHECS=$((ECHECS + 1))
  fi
}

verifier "avec identifiants, site HTTPS" 200 "$(requete "$PROXY_MDP" https://example.com)"
verifier "sans identifiants" refus "$(requete - https://example.com)"
verifier "mauvais mot de passe" refus "$(requete "mauvais-mot-de-passe" https://example.com)"
verifier "métadonnées cloud 169.254.169.254" refus "$(requete "$PROXY_MDP" http://169.254.169.254/)"
verifier "boucle locale 127.0.0.1" refus "$(requete "$PROXY_MDP" http://127.0.0.1/)"
verifier "réseau privé 10.0.0.73" refus "$(requete "$PROXY_MDP" http://10.0.0.73/)"
verifier "port 22 interdit" refus "$(requete "$PROXY_MDP" http://example.com:22/)"

IP_VUE="$(printf 'proxy-user = "%s:%s"\n' "$PROXY_COMPTE" "$PROXY_MDP" |
  curl -s --max-time 20 -x "$PROXY" -K - https://api.ipify.org 2>/dev/null)"
if [ "$IP_VUE" = "$PROXY_IP" ]; then
  echo "OK    IP vue par les sites = $IP_VUE"
else
  echo "ECHEC IP vue = '$IP_VUE', attendu $PROXY_IP"
  ECHECS=$((ECHECS + 1))
fi

# En-têtes reçus par un site en HTTP : ni X-Forwarded-For ni Via ne doivent apparaître
EN_TETES="$(printf 'proxy-user = "%s:%s"\n' "$PROXY_COMPTE" "$PROXY_MDP" |
  curl -s --max-time 20 -x "$PROXY" -K - http://httpbin.org/headers 2>/dev/null)"
if [ -z "$EN_TETES" ]; then
  echo "ECHEC en-têtes : aucune réponse du service de test"
  ECHECS=$((ECHECS + 1))
elif printf '%s' "$EN_TETES" | grep -qiE 'x-forwarded-for|"via"'; then
  echo "ECHEC en-têtes : X-Forwarded-For ou Via présent"
  ECHECS=$((ECHECS + 1))
else
  echo "OK    aucun en-tête révélant l'IP du client"
fi

if [ "$ECHECS" -eq 0 ]; then
  echo "Tout est bon."
else
  echo "$ECHECS échec(s)."
  exit 1
fi
