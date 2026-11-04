#!/usr/bin/env bash
# V5.1 — Retire un compte proxy. sudo bash compte-retirer.sh <nom>
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer avec sudo." >&2
  exit 1
fi
NOM="${1:-}"
if ! [[ "$NOM" =~ ^[a-z0-9_-]{1,32}$ ]]; then
  echo "Nom invalide." >&2
  exit 1
fi
FICHIER=/etc/squid/comptes
if ! grep -q "^$NOM:" "$FICHIER" 2>/dev/null; then
  echo "Compte $NOM introuvable." >&2
  exit 1
fi
htpasswd -D "$FICHIER" "$NOM"
chown proxy:proxy "$FICHIER"
chmod 600 "$FICHIER"
echo "Compte $NOM retiré."
