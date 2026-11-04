#!/usr/bin/env bash
# V5.2 — Assistant exécuté en root (seule commande autorisée à vpn-agent par sudoers).
# Reçoit le fichier candidat, le VÉRIFIE ligne par ligne, le pose de façon atomique à la place du
# fichier des comptes du proxy, puis recharge Squid à chaud (connexions en cours conservées).
set -euo pipefail

CANDIDAT="${1:-}"
ETAT="${VPN_AGENT_ETAT:-/var/lib/vpn-agent}"
CIBLE="${VPN_AGENT_CIBLE:-/etc/squid/comptes}"

[ "$(id -u)" -eq 0 ] || { echo "Doit tourner en root." >&2; exit 1; }
# Uniquement le fichier de l'agent, jamais un lien ni un autre chemin.
if [ "$CANDIDAT" != "$ETAT/comptes.candidat" ] || [ ! -f "$CANDIDAT" ] || [ -L "$CANDIDAT" ]; then
  echo "Fichier refusé." >&2
  exit 1
fi
# Chaque ligne : compte:empreinte bcrypt. Un fichier vide est valide (plus aucun invité).
if grep -Eqv '^u_[a-z0-9]{10}:\$2y\$[0-9]{2}\$[./A-Za-z0-9]{53}$' "$CANDIDAT"; then
  echo "Contenu invalide, rien n'est changé." >&2
  exit 1
fi

TMP="$(mktemp "$CIBLE.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
install -m 600 -o proxy -g proxy "$CANDIDAT" "$TMP"
mv -f "$TMP" "$CIBLE"
trap - EXIT
squid -k reconfigure
