/**
 * V5.9: the daily job of the VPN (without Firebase around). It lifts the cuts that no longer
 * apply (new month, limit raised, server back under its allowance) and deletes the figures older
 * than 12 months. A cut decided by the owner ("manuel") is never lifted here.
 */
import { GO, jourParis, moisAvant } from "./temps.js";
import { LIMITE_DEFAUT_GO, LIMITE_SERVEUR_GO, SEUIL_SERVEUR_COUPURE } from "./rapport.js";
import { monterVersion } from "./version.js";

export const CONSERVATION_MOIS = 12;

export async function tacheQuotidienne(db, maintenant = () => Date.now()) {
  const { mois } = jourParis(maintenant());
  const config = (await lireDoc(db, "vpn/config")) ?? {};
  const serveur = await lireDoc(db, `vpn/config/serveur/${mois}`);
  const serveurSature =
    (serveur?.total ?? 0) >=
    SEUIL_SERVEUR_COUPURE * (config.limiteServeurGo ?? LIMITE_SERVEUR_GO) * GO;

  let retablis = 0;
  const acces = await db.collection("vpn/config/acces").get();
  for (const d of acces.docs) {
    const a = d.data();
    let leve = false;
    if (a.suspendu === "limite") {
      const u = await lireDoc(db, `vpn/config/usage/${d.id}_${mois}`);
      const limiteGo =
        a.limiteMensuelleGo === undefined
          ? (config.limiteParDefautGo ?? LIMITE_DEFAUT_GO)
          : a.limiteMensuelleGo;
      leve = limiteGo === null || (u?.total ?? 0) < limiteGo * GO;
    } else if (a.suspendu === "securite") {
      leve = !serveurSature;
    }
    if (leve) {
      await db.doc(`vpn/config/acces/${d.id}`).set({ suspendu: null }, { merge: true });
      retablis += 1;
    }
  }
  if (retablis) await monterVersion(db, maintenant);

  // Retention: 12 months of figures.
  const limite = moisAvant(mois, CONSERVATION_MOIS);
  let supprimes = 0;
  for (const chemin of ["vpn/config/usage", "vpn/config/serveur"]) {
    const docs = await db.collection(chemin).get();
    for (const d of docs.docs) {
      const m = d.id.slice(-7); // "{uid}_{AAAA-MM}" or "{AAAA-MM}"
      if (/^\d{4}-\d{2}$/.test(m) && m < limite) {
        await d.ref.delete();
        supprimes += 1;
      }
    }
  }
  return { retablis, supprimes };
}

async function lireDoc(db, chemin) {
  const s = await db.doc(chemin).get();
  return s.exists ? s.data() : null;
}
