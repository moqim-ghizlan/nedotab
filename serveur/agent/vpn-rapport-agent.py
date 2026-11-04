#!/usr/bin/env python3
"""V5.9 - Rapport de trafic : des VOLUMES, jamais une destination.

Lance toutes les 15 minutes par vpn-rapport.timer (utilisateur vpn-agent). Il rassemble :
  - proxy : octets par compte u_xxxxxxxxxx (assistant root vpn-compteurs : journal Squid reduit a
    « compte octets », sans adresse de site, vide a chaque lecture) ;
  - WireGuard : difference des compteurs rx/tx par profil p_xxxxxxxxxx (API locale de wg-easy) ;
  - serveur : octets sortants de l'interface reseau principale.
puis envoie la difference a vpnAgentRapport. L'etat (derniers releves, octets proxy pas encore
envoyes) est dans un fichier 600 ; il n'est mis a jour QUE si l'envoi a reussi.
"""
import base64
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

COMPTE = re.compile(r"^u_[a-z0-9]{10}$")
PROFIL = re.compile(r"^p_[a-z0-9]{10}$")
WG = "http://127.0.0.1:51821"
URL_HTTPS = re.compile(r"^https://[A-Za-z0-9./_-]+$")


class Echec(Exception):
    pass


def difference(courant, precedent, base_inconnue=False):
    """Octets depuis le dernier releve. Un compteur qui diminue (redemarrage) repart de zero.

    Pas de releve precedent : premier passage de l'agent (base_inconnue) = on prend la base sans
    compter l'historique ; sinon c'est un profil neuf, dont le compteur est parti de zero."""
    if precedent is None:
        return 0 if base_inconnue else courant
    return courant if courant < precedent else courant - precedent


def interface_par_defaut(table_routes):
    """Interface de la route par defaut dans /proc/net/route, sinon None."""
    for ligne in table_routes.splitlines()[1:]:
        champs = ligne.split()
        if len(champs) > 7 and champs[1] == "00000000" and int(champs[7], 16) == 0:
            return champs[0]
    return None


def lire_proxy(sortie):
    """Lignes « u_xxxxxxxxxx octets » de l'assistant ; tout autre contenu est ignore."""
    octets = {}
    for ligne in sortie.splitlines():
        mots = ligne.split()
        if len(mots) == 2 and COMPTE.match(mots[0]) and mots[1].isdigit():
            octets[mots[0]] = octets.get(mots[0], 0) + int(mots[1])
    return octets


def construire(etat, proxy, wg, tx_serveur):
    """-> (rapport, nouvel_etat). Rien n'est supposé : premier releve = base, pas de volume."""
    attente = dict(etat.get("proxy_attente", {}))
    for compte, n in proxy.items():
        attente[compte] = attente.get(compte, 0) + n
    premier = "wg" not in etat
    precedents = etat.get("wg", {})
    par_compte = {c: {"octetsProxy": n, "octetsWireguard": 0} for c, n in attente.items()}
    for nom, (rx, tx) in wg.items():
        d = par_compte.setdefault(nom, {"octetsProxy": 0, "octetsWireguard": 0})
        avant = precedents.get(nom)
        d["octetsWireguard"] = difference(rx, avant[0] if avant else None, premier) + difference(
            tx, avant[1] if avant else None, premier
        )
    par_compte = {c: v for c, v in par_compte.items() if v["octetsProxy"] or v["octetsWireguard"]}
    rapport = {
        "parCompte": par_compte,
        "serveur": {"octetsSortants": difference(tx_serveur, etat.get("tx_serveur"), True)},
    }
    nouvel = {"wg": {n: [rx, tx] for n, (rx, tx) in wg.items()}, "tx_serveur": tx_serveur, "proxy_attente": {}}
    return rapport, nouvel, attente


def http_reel(methode, url, entetes, corps=None):
    requete = urllib.request.Request(url, data=corps, method=methode, headers=entetes)
    try:
        with urllib.request.urlopen(requete, timeout=20) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise Echec("reseau") from e


def lire_wg(http, entetes):
    code, corps = http("GET", WG + "/api/client", entetes)
    if code != 200:
        raise Echec(f"wg-easy http {code}")
    try:
        clients = json.loads(corps.decode("utf-8"))
    except ValueError as e:
        raise Echec("json") from e
    if not isinstance(clients, list):
        raise Echec("forme")
    sortie = {}
    for c in clients:
        nom = c.get("name") if isinstance(c, dict) else None
        if isinstance(nom, str) and PROFIL.match(nom):
            rx, tx = c.get("transferRx"), c.get("transferTx")
            sortie[nom] = (rx if isinstance(rx, int) else 0, tx if isinstance(tx, int) else 0)
    return sortie


def rapporter(io):
    """io : http, proxy() -> texte, tx_serveur() -> int, etat_lire(), etat_ecrire(), cfg, journal."""
    etat = io["etat_lire"]()
    proxy = lire_proxy(io["proxy"]())
    basic = base64.b64encode(f"{io['cfg']['wg_utilisateur']}:{io['cfg']['wg_mdp']}".encode()).decode()
    wg = lire_wg(io["http"], {"Authorization": "Basic " + basic})
    rapport, nouvel, attente = construire(etat, proxy, wg, io["tx_serveur"]())
    # Les octets proxy deja vides du journal ne doivent pas se perdre si l'envoi echoue.
    en_cas_d_echec = dict(etat, proxy_attente=attente)
    envoi = json.dumps(rapport).encode()
    entetes = {"Authorization": "Bearer " + io["cfg"]["jeton"], "Content-Type": "application/json"}
    try:
        code, _ = io["http"]("POST", io["cfg"]["url_rapport"], entetes, envoi)
    except Echec:
        io["etat_ecrire"](en_cas_d_echec)
        raise
    if code != 200:
        io["etat_ecrire"](en_cas_d_echec)
        raise Echec(f"rapport http {code}")
    io["etat_ecrire"](nouvel)
    io["journal"](f"rapport : {len(rapport['parCompte'])} comptes")
    return rapport


def lire_env(chemin):
    valeurs = {}
    with open(chemin, encoding="utf-8") as f:
        for ligne in f:
            cle, _, valeur = ligne.rstrip("\n").partition("=")
            valeurs[cle] = valeur
    return valeurs


def main():
    env_agent = os.environ.get("VPN_AGENT_ENV", "/etc/vpn-agent/env")
    env_wg = os.environ.get("VPN_WG_ENV", "/etc/vpn-agent/wg-easy")
    chemin_etat = os.environ.get("VPN_RAPPORT_ETAT", "/var/lib/vpn-agent/compteurs.json")
    try:
        e, w = lire_env(env_agent), lire_env(env_wg)
        url, jeton = e.get("VPN_AGENT_URL", ""), e.get("VPN_AGENT_JETON", "")
        if not URL_HTTPS.match(url) or not re.match(r"^[A-Za-z0-9_-]{20,}$", jeton):
            raise Echec("environnement invalide")
        cfg = {
            "jeton": jeton,
            "url_rapport": e.get("VPN_WG_URL_RAPPORT") or url.rsplit("/", 1)[0] + "/vpnAgentRapport",
            "wg_utilisateur": w.get("WG_UTILISATEUR", ""),
            "wg_mdp": w.get("WG_MOT_DE_PASSE", ""),
        }
        if not URL_HTTPS.match(cfg["url_rapport"]) or not cfg["wg_utilisateur"]:
            raise Echec("configuration invalide")

        def etat_lire():
            try:
                with open(chemin_etat, encoding="utf-8") as f:
                    return json.load(f)
            except (OSError, ValueError):
                return {}

        def etat_ecrire(etat):
            tmp = chemin_etat + ".tmp"
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(etat, f)
            os.replace(tmp, chemin_etat)

        def proxy():
            cmd = os.environ.get("VPN_COMPTEURS", "sudo /usr/local/sbin/vpn-compteurs").split()
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=False)
            return r.stdout if r.returncode == 0 else ""

        def tx_serveur():
            with open("/proc/net/route", encoding="utf-8") as f:
                iface = interface_par_defaut(f.read())
            if not iface or not re.match(r"^[A-Za-z0-9_.-]+$", iface):
                raise Echec("interface introuvable")
            with open(f"/sys/class/net/{iface}/statistics/tx_bytes", encoding="utf-8") as f:
                return int(f.read().strip())

        rapporter({
            "http": http_reel, "proxy": proxy, "tx_serveur": tx_serveur, "etat_lire": etat_lire,
            "etat_ecrire": etat_ecrire, "cfg": cfg,
            "journal": lambda m: print(m, file=sys.stderr),
        })
    except (Echec, OSError, ValueError) as err:
        print(f"vpn-rapport : {type(err).__name__}, rien n'est perdu", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
