#!/usr/bin/env python3
"""V5.7 - Agent WireGuard : un profil wg-easy par invite actif, rien d'autre.

Lance chaque minute par vpn-wg-agent.timer (utilisateur vpn-agent). Il lit la liste des invites
(vpnAgentProfils), la compare aux clients de wg-easy (API locale 127.0.0.1) puis :
  - supprime les clients dont l'invite n'est plus actif (la connexion est coupee) ;
  - cree les clients manquants ;
  - depose la configuration de ceux dont la base n'a pas encore de copie chiffree.

Regles :
  - en cas d'erreur, de reponse invalide ou de doute, RIEN n'est supprime (liste conservee) ;
  - seuls les clients nommes p_xxxxxxxxxx sont geres : les autres ne sont jamais touches ;
  - une configuration contient une CLE PRIVEE : elle reste en memoire, jamais dans un fichier,
    un argument de commande ou un journal ; le journal ne contient que des nombres.
API de wg-easy v15.5.0 : non documentee par le projet, lue dans le code du tag (voir README).
"""
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request

NOM = re.compile(r"^p_[a-z0-9]{10}$")
WG = "http://127.0.0.1:51821"
URL_HTTPS = re.compile(r"^https://[A-Za-z0-9./_-]+$")


class Echec(Exception):
    """Doute ou erreur : on s'arrete sans rien supprimer."""


def http_reel(methode, url, entetes, corps=None):
    requete = urllib.request.Request(url, data=corps, method=methode, headers=entetes)
    try:
        with urllib.request.urlopen(requete, timeout=20) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise Echec("reseau") from e


def _json(octets, forme):
    try:
        valeur = json.loads(octets.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as e:
        raise Echec("json") from e
    if not forme(valeur):
        raise Echec("forme")
    return valeur


def _profils_ok(v):
    return (
        isinstance(v, dict)
        and set(v) == {"profils"}
        and isinstance(v["profils"], list)
        and all(
            isinstance(p, dict)
            and set(p) == {"nomProfil", "depose"}
            and isinstance(p["nomProfil"], str)
            and NOM.match(p["nomProfil"])
            and isinstance(p["depose"], bool)
            for p in v["profils"]
        )
    )


def _entier(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _clients_ok(v):
    return isinstance(v, list) and all(
        isinstance(c, dict) and _entier(c.get("id")) and isinstance(c.get("name"), str) for c in v
    )


def synchroniser(http, cfg, journal=lambda m: print(m, file=sys.stderr)):
    """http(methode, url, entetes, corps) -> (code, octets)."""
    fonction = {"Authorization": "Bearer " + cfg["jeton"], "Accept": "application/json"}
    basic = base64.b64encode(f"{cfg['wg_utilisateur']}:{cfg['wg_mdp']}".encode()).decode()
    wg = {"Authorization": "Basic " + basic, "Accept": "application/json"}

    code, corps = http("GET", cfg["url_profils"], fonction)
    if code != 200:
        raise Echec(f"profils http {code}")
    souhaites = {p["nomProfil"]: p["depose"] for p in _json(corps, _profils_ok)["profils"]}

    code, corps = http("GET", WG + "/api/client", wg)
    if code != 200:
        raise Echec(f"wg-easy liste http {code}")
    existants = {c["name"]: c["id"] for c in _json(corps, _clients_ok) if NOM.match(c["name"])}

    supprimes = crees = deposes = 0
    # 1. Revocations d'abord : couper un acces est plus urgent que d'en creer un.
    for nom, identifiant in existants.items():
        if nom in souhaites:
            continue
        code, _ = http("DELETE", f"{WG}/api/client/{identifiant}", wg)
        if code == 200:
            supprimes += 1
        else:
            journal(f"suppression refusee (http {code})")
    # 2. Creations et depots.
    for nom, depose in souhaites.items():
        if nom in existants and depose:
            continue
        identifiant = existants.get(nom)
        if identifiant is None:
            envoi = json.dumps({"name": nom, "expiresAt": None}).encode()
            entetes = {**wg, "Content-Type": "application/json"}
            code, corps = http("POST", WG + "/api/client", entetes, envoi)
            if code != 200:
                journal(f"creation refusee (http {code})")
                continue
            try:
                reponse = _json(corps, lambda v: isinstance(v, dict) and _entier(v.get("clientId")))
            except Echec:
                journal("creation : reponse inattendue")
                continue
            identifiant = reponse["clientId"]
            crees += 1
        code, conf = http("GET", f"{WG}/api/client/{identifiant}/configuration", wg)
        if code != 200:
            journal(f"configuration illisible (http {code})")
            continue
        envoi = json.dumps(
            {"nomProfil": nom, "configuration": conf.decode("utf-8", "replace")}
        ).encode()
        del conf
        entetes = {**fonction, "Content-Type": "application/json"}
        code, _ = http("POST", cfg["url_depot"], entetes, envoi)
        del envoi
        if code == 200:
            deposes += 1
        else:
            journal(f"depot refuse (http {code}), nouvel essai a la prochaine minute")
    journal(f"wg : {len(souhaites)} profils, +{crees} -{supprimes}, {deposes} deposes")
    return {"profils": len(souhaites), "crees": crees, "supprimes": supprimes, "deposes": deposes}


def lire_env(chemin):
    valeurs = {}
    with open(chemin, encoding="utf-8") as f:
        for ligne in f:
            cle, _, valeur = ligne.rstrip("\n").partition("=")
            valeurs[cle] = valeur
    return valeurs


def configuration(env_agent, env_wg):
    try:
        e = lire_env(env_agent)
        w = lire_env(env_wg)
    except OSError as err:
        raise Echec("environnement illisible") from err
    url = e.get("VPN_AGENT_URL", "")
    jeton = e.get("VPN_AGENT_JETON", "")
    if not URL_HTTPS.match(url) or not re.match(r"^[A-Za-z0-9_-]{20,}$", jeton):
        raise Echec("environnement invalide")
    if not w.get("WG_UTILISATEUR") or not w.get("WG_MOT_DE_PASSE"):
        raise Echec("identifiants wg-easy manquants")
    base = url.rsplit("/", 1)[0]
    cfg = {
        "jeton": jeton,
        "url_profils": e.get("VPN_WG_URL_PROFILS") or base + "/vpnAgentProfils",
        "url_depot": e.get("VPN_WG_URL_DEPOT") or base + "/vpnAgentDeposerProfil",
        "wg_utilisateur": w["WG_UTILISATEUR"],
        "wg_mdp": w["WG_MOT_DE_PASSE"],
    }
    if not (URL_HTTPS.match(cfg["url_profils"]) and URL_HTTPS.match(cfg["url_depot"])):
        raise Echec("adresse invalide")
    return cfg


def main():
    try:
        cfg = configuration(
            os.environ.get("VPN_AGENT_ENV", "/etc/vpn-agent/env"),
            os.environ.get("VPN_WG_ENV", "/etc/vpn-agent/wg-easy"),
        )
        synchroniser(http_reel, cfg)
    except Echec as e:
        print(f"vpn-wg-agent : {e}, rien n'est modifie", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
