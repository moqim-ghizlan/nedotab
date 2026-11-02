/**
 * V4.23: accounts created with an e-mail address that was NEVER verified are deleted after 7
 * days (fake sign-ups cost nothing but pile up). Google accounts, verified accounts and recent
 * ones are untouched. Pure selection + a runner that takes the Admin Auth in argument.
 */
export const DELAI_VERIFICATION_MS = 7 * 24 * 60 * 60 * 1000;

/** Users to delete among `utilisateurs` (Admin SDK UserRecord-like objects). */
export function comptesAPurger(utilisateurs, maintenant = Date.now()) {
  return utilisateurs.filter((u) => {
    if (u.emailVerified) return false;
    const fournisseurs = (u.providerData ?? []).map((p) => p.providerId);
    // Only pure e-mail accounts: never a Google account (always verified) or any other provider.
    if (fournisseurs.length === 0 || fournisseurs.some((f) => f !== "password")) return false;
    const creation = Date.parse(u.metadata?.creationTime ?? "");
    return Number.isFinite(creation) && maintenant - creation > DELAI_VERIFICATION_MS;
  });
}

/** Walks every user (pages of 1000) and deletes the unverified ones. @returns {Promise<number>} */
export async function nettoyerComptes(auth, maintenant = Date.now()) {
  let supprimes = 0;
  let jeton;
  do {
    const page = await auth.listUsers(1000, jeton);
    const aPurger = comptesAPurger(page.users, maintenant);
    if (aPurger.length > 0) {
      const r = await auth.deleteUsers(aPurger.map((u) => u.uid));
      supprimes += r.successCount ?? aPurger.length;
    }
    jeton = page.pageToken;
  } while (jeton);
  return supprimes;
}
