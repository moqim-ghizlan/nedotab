#!/usr/bin/env bash
# V5.5 — Résolveur DNS du serveur : systemd-resolved vers Quad9 et Cloudflare, en TLS quand
# c'est possible. Le proxy résout les noms des sites pour les utilisateurs : ce choix décide qui
# voit ces noms. Idempotent. Lancer avec : sudo bash 30-dns.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer avec sudo." >&2
  exit 1
fi

DOSSIER=/etc/systemd/resolved.conf.d
FICHIER="$DOSSIER/nedotab.conf"
install -d -m 755 "$DOSSIER"

CONTENU='[Resolve]
DNS=9.9.9.9 149.112.112.112 1.1.1.1
FallbackDNS=
DNSOverTLS=opportunistic
DNSSEC=allow-downgrade
Cache=yes
'

if [ "$(cat "$FICHIER" 2>/dev/null || true)" != "${CONTENU%$'\n'}" ]; then
  printf '%s' "$CONTENU" > "$FICHIER"
  systemctl restart systemd-resolved
  echo "Résolveur configuré."
else
  echo "Résolveur déjà configuré."
fi

# Contrôle : le serveur sait résoudre un nom.
resolvectl query example.org >/dev/null && echo "Résolution OK." || { echo "Résolution impossible." >&2; exit 1; }
