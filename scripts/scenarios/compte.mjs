// V2.1 browser scenario (extension built with VITE_UTILISER_EMULATEURS=true, Auth emulator
// running): Firebase not loaded without an account, sign-in, avatar, session restored on
// reload without any window, sign-out.
import { attendre } from "../navigateur.mjs";

export async function scenarioCompte({ nav, url, verifier, dossier }) {
  const chargesFirebase = new Set();
  nav.surEvenement((m) => {
    if (
      m.method === "Network.requestWillBeSent" &&
      /\/assets\/firebase-/.test(m.params.request.url)
    ) {
      chargesFirebase.add(m.params.request.url);
    }
  });
  const p = await nav.ouvrir();
  await p.envoyer("Network.enable");
  await p.sombre(false);
  await p.aller(url);
  await attendre(500);
  verifier("Sans compte : aucun fichier Firebase chargé", chargesFirebase.size === 0);
  verifier(
    "Sans compte : pas d'avatar",
    await p.eval(`document.querySelector(".bouton-compte").hidden`),
  );

  await p.eval(`document.querySelector(".bouton-reglages").click()`);
  await attendre(200);
  const section = await p.eval(`document.querySelector(".compte")?.textContent ?? ""`);
  verifier(
    "Réglages : section Compte et bouton Google",
    section.includes("Se connecter avec Google"),
    section,
  );
  await p.capture(`${dossier}/compte-deconnecte.png`);
  await p.eval(`document.querySelector(".bouton-google").click()`);
  await attendre(2500);
  verifier("Connexion : Firebase chargé à la demande", chargesFirebase.size === 1);
  const profil = await p.eval(`document.querySelector(".compte-identite")?.textContent ?? ""`);
  verifier(
    "Connecté : nom et e-mail affichés",
    profil.includes("Testeur NedoTab") && profil.includes("testeur@nedotab.test"),
    profil,
  );
  verifier(
    "Avatar en haut à droite",
    await p.eval(
      `!document.querySelector(".bouton-compte").hidden && !!document.querySelector(".bouton-compte .avatar")`,
    ),
  );
  await p.capture(`${dossier}/compte-connecte.png`);

  // Reload: avatar from the indicator at once, session restored without window
  await p.aller(url);
  await attendre(150);
  verifier(
    "Rechargement : avatar affiché tout de suite",
    await p.eval(`!document.querySelector(".bouton-compte").hidden`),
  );
  await attendre(2000);
  const restaure = await p.eval(
    `chrome.storage.local.get("pref:compte").then((r) => r["pref:compte"])`,
  );
  verifier(
    "Session restaurée sans fenêtre",
    restaure?.connecte === true && restaure.email === "testeur@nedotab.test",
  );
  // Chrome's own first tab is also a new tab page: only a sign-in window would be a problem.
  const urls = (await nav.envoyer("Target.getTargets")).targetInfos.map((t) => t.url);
  verifier(
    "Aucune fenêtre de connexion ouverte",
    !urls.some((u) => /accounts.google|oauth|signin/i.test(u)),
    urls.join(", "),
  );

  // The user exists in the Auth emulator
  const comptes = await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-nedotab/config")
    .then(() =>
      fetch(
        "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-nedotab/accounts:query",
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer owner" },
          body: "{}",
        },
      ),
    )
    .then((r) => r.json())
    .catch(() => ({}));
  verifier(
    "Utilisateur présent dans Authentication (émulateur)",
    (comptes.userInfo ?? []).some((u) => u.email === "testeur@nedotab.test"),
  );

  // Sign out
  await p.eval(`document.querySelector(".bouton-compte").click()`);
  await attendre(200);
  await p.eval(
    `[...document.querySelectorAll(".compte button")].find((b) => b.textContent === "Se déconnecter").click()`,
  );
  await attendre(300);
  await p.eval(
    `[...document.querySelectorAll("dialog[open] button")].find((b) => b.textContent.startsWith("Oui")).click()`,
  );
  await attendre(800);
  verifier(
    "Déconnexion : avatar retiré",
    await p.eval(`document.querySelector(".bouton-compte").hidden`),
  );
  verifier(
    "Déconnexion : indicateur effacé",
    (await p.eval(
      `chrome.storage.local.get("pref:compte").then((r) => r["pref:compte"] ?? null)`,
    )) === null,
  );
  chargesFirebase.clear();
  await p.aller(url);
  await attendre(600);
  verifier("Après déconnexion : Firebase n'est plus chargé", chargesFirebase.size === 0);
  verifier("Aucune erreur console (compte)", p.erreurs.length === 0, p.erreurs.join(" | "));
}
