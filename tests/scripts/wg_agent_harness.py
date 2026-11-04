"""Harnais de test de serveur/agent/vpn-wg-agent.py : faux wg-easy et fausses fonctions.

Lit un scenario JSON sur l'entree standard, execute synchroniser() et ecrit un compte rendu JSON
(appels effectues, deposes, journal, erreur). Aucun reseau.
"""
import importlib.util
import json
import sys

spec = importlib.util.spec_from_file_location("agent", sys.argv[1])
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)

sc = json.load(sys.stdin)
clients = [dict(c) for c in sc.get("clients", [])]
appels, deposes, journal = [], [], []
suivant = [100]
CLE_PRIVEE = "CLE-PRIVEE-SECRETE-DE-TEST"


def http(methode, url, entetes, corps=None):
    appels.append([methode, url])
    if url == "https://f.test/vpnAgentProfils":
        if sc.get("profils_code", 200) != 200:
            return sc["profils_code"], b""
        brut = sc["profils_brut"] if "profils_brut" in sc else json.dumps({"profils": sc["profils"]})
        return 200, brut.encode()
    if url == "https://f.test/vpnAgentDeposerProfil":
        if sc.get("depot_code", 200) == 200:
            d = json.loads(corps); deposes.append({"nomProfil": d["nomProfil"], "a_cle": CLE_PRIVEE in d["configuration"]})
        return sc.get("depot_code", 200), b"{}"
    if url == agent.WG + "/api/client" and methode == "GET":
        if sc.get("wg_code", 200) != 200:
            return sc["wg_code"], b""
        brut = sc["wg_brut"] if "wg_brut" in sc else json.dumps(clients)
        return 200, brut.encode()
    if url == agent.WG + "/api/client" and methode == "POST":
        nom = json.loads(corps)["name"]
        suivant[0] += 1
        clients.append({"id": suivant[0], "name": nom})
        return 200, json.dumps({"success": True, "clientId": suivant[0]}).encode()
    if methode == "DELETE":
        return 200, b'{"success":true}'
    if url.endswith("/configuration"):
        return 200, f"[Interface]\nPrivateKey = {CLE_PRIVEE}\n\n[Peer]\n".encode()
    return 404, b""


cfg = {
    "jeton": "j" * 24,
    "url_profils": "https://f.test/vpnAgentProfils",
    "url_depot": "https://f.test/vpnAgentDeposerProfil",
    "wg_utilisateur": "admin",
    "wg_mdp": "mdp-wg",
}
erreur = None
try:
    agent.synchroniser(http, cfg, journal.append)
except agent.Echec as e:
    erreur = str(e)
print(json.dumps({"appels": appels, "deposes": deposes, "journal": journal, "erreur": erreur}))
