#!/usr/bin/env bash
# V5.0 — Pare-feu du système. Choix : ufw (remplace les règles iptables préinstallées par Oracle).
# Entrée refusée par défaut, SSH (22) autorisé, sortie autorisée.
# N'ouvre PAS d'autre port : chaque version ouvre le sien (et la liste de sécurité Oracle aussi).
# sudo bash 03-parefeu.sh   (idempotent)
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancer avec sudo." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get install -y ufw

# Les images Oracle ont des règles iptables « REJECT » persistantes qui bloquent tout sauf SSH.
# On les retire pour que ufw soit le seul maître, puis on les empêche de revenir.
if dpkg -s netfilter-persistent >/dev/null 2>&1; then
  systemctl disable --now netfilter-persistent || true
  apt-get purge -y netfilter-persistent iptables-persistent || true
fi
iptables -F || true
iptables -X || true

# Autoriser SSH AVANT d'activer, sinon on se coupe l'accès
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw --force enable
ufw status verbose

echo "OK : seul le port 22 est ouvert côté système. Penser aussi à la liste de sécurité Oracle."
