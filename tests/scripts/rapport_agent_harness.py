"""Harnais de test de serveur/agent/vpn-rapport-agent.py : fausses E/S, aucun reseau.

Entree JSON : { "etat": {...}, "proxy": "texte", "wg": [clients], "tx": int, "code": 200 }
Sortie JSON : le rapport envoye, l'etat ecrit, le journal et l'erreur eventuelle.
"""
import importlib.util
import json
import sys

spec = importlib.util.spec_from_file_location("agent", sys.argv[1])
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)

sc = json.load(sys.stdin)
envoyes, ecrits, journal = [], [], []


def http(methode, url, entetes, corps=None):
    if methode == "GET":
        return 200, json.dumps(sc.get("wg", [])).encode()
    envoyes.append(json.loads(corps))
    return sc.get("code", 200), b"{}"


io = {
    "http": http,
    "proxy": lambda: sc.get("proxy", ""),
    "tx_serveur": lambda: sc.get("tx", 0),
    "etat_lire": lambda: sc.get("etat", {}),
    "etat_ecrire": ecrits.append,
    "cfg": {"jeton": "j" * 24, "url_rapport": "https://f.test/vpnAgentRapport", "wg_utilisateur": "a", "wg_mdp": "b"},
    "journal": journal.append,
}
erreur = None
try:
    agent.rapporter(io)
except agent.Echec as e:
    erreur = str(e)
print(json.dumps({
    "envoyes": envoyes,
    "etat": ecrits[-1] if ecrits else None,
    "journal": journal,
    "erreur": erreur,
    "diff": [agent.difference(a, b, c) for a, b, c in sc.get("diffs", [])],
    "iface": agent.interface_par_defaut(sc["route"]) if "route" in sc else None,
}))
