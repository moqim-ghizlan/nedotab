#!/usr/bin/env bash
# V5.9 — Compteurs d'octets du proxy. Lancé en root par l'agent de rapport (sudo, sans argument).
# Lit le journal réduit de Squid (« compte octets_reçus octets_envoyés », JAMAIS une adresse de
# site), le vide, et n'affiche que « compte total_octets » par compte.
# Une ligne écrite entre la copie et le vidage peut être perdue : quelques octets, jamais un site.
set -euo pipefail

JOURNAL="${VPN_COMPTEURS_JOURNAL:-/var/log/squid/octets.log}"
[ -s "$JOURNAL" ] || exit 0

COPIE="$(mktemp)"
trap 'rm -f "$COPIE"' EXIT
cp -- "$JOURNAL" "$COPIE"
truncate -s 0 "$JOURNAL"

awk '$1 ~ /^u_[a-z0-9]{10}$/ && $2 ~ /^[0-9]+$/ && $3 ~ /^[0-9]+$/ { somme[$1] += $2 + $3 }
     END { for (c in somme) printf "%s %.0f\n", c, somme[c] }' "$COPIE"
