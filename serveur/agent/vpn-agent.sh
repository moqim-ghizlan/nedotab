#!/usr/bin/env bash
# V5.2 — Agent de synchronisation des comptes du VPN (lancé chaque minute par vpn-agent.timer,
# sous l'utilisateur « vpn-agent »). Il appelle la fonction vpnAgentSynchro avec un jeton secret ;
# si la version a changé, il remplace le fichier des comptes du proxy.
# Règle d'or : en cas de panne, de réponse invalide ou de doute, le fichier actuel est CONSERVÉ.
# Rien n'est journalisé sauf « version, N comptes » : jamais un compte, une empreinte, un site.
set -uo pipefail

ENV_FILE="${VPN_AGENT_ENV:-/etc/vpn-agent/env}"
ETAT="${VPN_AGENT_ETAT:-/var/lib/vpn-agent}"
CURL="${VPN_AGENT_CURL:-curl}"
APPLIQUER="${VPN_AGENT_APPLIQUER:-sudo /usr/local/sbin/vpn-agent-appliquer}"

journal() { echo "vpn-agent : $*" >&2; }
lire_env() { sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | head -n 1; }

[ -r "$ENV_FILE" ] || { journal "fichier d environnement illisible"; exit 1; }
URL="$(lire_env VPN_AGENT_URL)"
JETON="$(lire_env VPN_AGENT_JETON)"
[[ "$URL" =~ ^https://[A-Za-z0-9./_-]+$ ]] || { journal "adresse invalide"; exit 1; }
[[ "$JETON" =~ ^[A-Za-z0-9_-]{20,}$ ]] || { journal "jeton invalide"; exit 1; }

mkdir -p "$ETAT"
CORPS="$(mktemp "$ETAT/reponse.XXXXXX")"
CANDIDAT="$ETAT/comptes.candidat"
trap 'rm -f "$CORPS"' EXIT

# Le jeton passe par l'entrée standard (pas dans la liste des processus).
CODE="$(printf 'header = "Authorization: Bearer %s"\n' "$JETON" |
  "$CURL" -sS -K - --max-time 20 --proto '=https' -o "$CORPS" -w '%{http_code}' "$URL" 2>/dev/null)" ||
  { journal "échec réseau, liste conservée"; exit 1; }
[ "$CODE" = "200" ] || { journal "réponse HTTP $CODE, liste conservée"; exit 1; }

# Liste blanche : la réponse doit avoir EXACTEMENT la forme attendue, sinon on ne touche à rien.
ENTREE='\{"compte":"u_[a-z0-9]{10}","empreinte":"\$2y\$[0-9]{2}\$[./A-Za-z0-9]{53}"\}'
if ! grep -Eq "^\{\"version\":[0-9]{1,16},\"comptes\":\[(${ENTREE}(,${ENTREE})*)?\]\}\$" "$CORPS"; then
  journal "réponse invalide, liste conservée"
  exit 1
fi

VERSION="$(sed -E 's/^\{"version":([0-9]+),.*/\1/' "$CORPS")"
[ "$VERSION" = "$(cat "$ETAT/version" 2>/dev/null || true)" ] && exit 0

umask 077
grep -oE '"compte":"u_[a-z0-9]{10}","empreinte":"[^"]+"' "$CORPS" |
  sed -E 's/"compte":"([^"]+)","empreinte":"([^"]+)"/\1:\2/' > "$CANDIDAT" || true
NB="$(wc -l < "$CANDIDAT" | tr -d ' ')"

# shellcheck disable=SC2086  # APPLIQUER peut contenir « sudo commande »
if $APPLIQUER "$CANDIDAT"; then
  printf '%s\n' "$VERSION" > "$ETAT/version"
  journal "synchro, $NB comptes (version $VERSION)"
else
  journal "application impossible, liste conservée"
  exit 1
fi
