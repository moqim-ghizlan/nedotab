#!/usr/bin/env bash
# V5.1 — Ajoute un compte proxy. Le mot de passe s'affiche UNE SEULE FOIS ; seule l'empreinte
# bcrypt est enregistrée. sudo bash compte-ajouter.sh <nom>
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer avec sudo." >&2
  exit 1
fi
NOM="${1:-}"
if ! [[ "$NOM" =~ ^[a-z0-9_-]{1,32}$ ]]; then
  echo "Nom invalide (a-z, 0-9, - et _, 32 max)." >&2
  exit 1
fi
FICHIER=/etc/squid/comptes
[ -f "$FICHIER" ] || install -m 600 -o proxy -g proxy /dev/null "$FICHIER"
if grep -q "^$NOM:" "$FICHIER"; then
  echo "Le compte $NOM existe déjà (utiliser compte-retirer.sh d'abord)." >&2
  exit 1
fi

MDP="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32)"
printf '%s\n' "$MDP" | htpasswd -B -C 10 -i "$FICHIER" "$NOM" >/dev/null
chown proxy:proxy "$FICHIER"
chmod 600 "$FICHIER"

echo "Compte : $NOM"
echo "Mot de passe (à copier maintenant, il ne sera plus affiché) : $MDP"
