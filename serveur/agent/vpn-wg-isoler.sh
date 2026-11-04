#!/usr/bin/env bash
# V5.7 — Isolement des clients WireGuard. Lancé en root par l'agent (sudo, sans argument) après
# chaque synchro, et au démarrage. Idempotent : chaque règle n'est ajoutée que si elle manque.
# Les règles sont posées DANS le conteneur wg-easy (l'interface wg0 y vit), en tête de FORWARD :
#   - un client ne peut pas joindre un autre client (wg0 → wg0) ;
#   - un client ne peut atteindre ni les réseaux privés ni le réseau interne d'Oracle
#     (10/8, 172.16/12, 192.168/16, 100.64/10, 169.254/16), donc ni le serveur lui-même
#     ni son réseau Docker ; Internet reste joignable.
# Rien n'est journalisé hors « isolement : OK ».
set -euo pipefail

CONTENEUR="${VPN_WG_CONTENEUR:-wg-easy}"
DOCKER="${VPN_WG_DOCKER:-docker}"
IFACE="wg0"

regle() { # regle <iptables|ip6tables> <arguments de règle...>
  local outil="$1"
  shift
  "$DOCKER" exec "$CONTENEUR" "$outil" -C FORWARD "$@" 2>/dev/null ||
    "$DOCKER" exec "$CONTENEUR" "$outil" -I FORWARD 1 "$@"
}

"$DOCKER" inspect -f '{{.State.Running}}' "$CONTENEUR" 2>/dev/null | grep -qx true ||
  { echo "isolement : conteneur arrêté" >&2; exit 1; }

# Ordre : chaque règle est insérée en tête, la dernière insérée passe en premier ; peu importe,
# ce sont toutes des DROP indépendants.
regle iptables -i "$IFACE" -o "$IFACE" -j DROP
for plage in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 169.254.0.0/16; do
  regle iptables -i "$IFACE" -d "$plage" -j DROP
done
regle ip6tables -i "$IFACE" -o "$IFACE" -j DROP
for plage in fc00::/7 fe80::/10; do
  regle ip6tables -i "$IFACE" -d "$plage" -j DROP
done
echo "isolement : OK" >&2
