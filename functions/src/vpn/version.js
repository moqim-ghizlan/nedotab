/** The version the server agent compares (vpn/etat): strictly increasing, even within a millisecond. */
export async function monterVersion(db, maintenant = () => Date.now()) {
  const snap = await db.doc("vpn/etat").get();
  const actuel = snap.exists ? (snap.data().version ?? 0) : 0;
  const version = Math.max(maintenant(), actuel + 1);
  await db.doc("vpn/etat").set({ version });
  return version;
}
