/**
 * Queue of local operations not yet confirmed by the server (V2.9). Pure: the persistence
 * is in the platform layer. An operation: { idOp, action, creeLe, libelle?, nature? }.
 */
import { A } from "./actions.js";

export const FILE_MAX = 500;

/**
 * Adds an operation. A restoration replaces everything queued before it (those operations
 * were about the state it replaces). Beyond FILE_MAX, the queue is compacted into a single
 * operation holding the local state (`etatLocal`), a case of a very long time offline.
 * @returns {{ file, compactee: boolean }}
 */
export function ajouter(file, operation, etatLocal) {
  if (operation.action.type === A.GRILLE_RESTAURER) return { file: [operation], compactee: false };
  const suivante = [...file, operation];
  if (suivante.length <= FILE_MAX || !etatLocal) return { file: suivante, compactee: false };
  return {
    file: [
      {
        idOp: operation.idOp,
        creeLe: operation.creeLe,
        libelle: "Modifications faites hors ligne",
        nature: null,
        action: {
          type: A.SYNCHRO_APPLIQUER,
          grille: etatLocal.grille,
          reglages: etatLocal.reglages,
        },
      },
    ],
    compactee: true,
  };
}

/** Removes every operation up to `idOp` included (sent and confirmed). Unknown: unchanged. */
export function retirerJusqua(file, idOp) {
  const i = file.findIndex((o) => o.idOp === idOp);
  return i < 0 ? file : file.slice(i + 1);
}

/** Valid operations only (persisted data may be damaged). */
export function validerFile(file) {
  return (Array.isArray(file) ? file : []).filter(
    (o) =>
      o &&
      typeof o.idOp === "string" &&
      Number.isFinite(o.creeLe) &&
      o.action &&
      typeof o.action.type === "string",
  );
}

/** Several queues (other tabs, closed tabs) merged in creation order, without duplicates. */
export function fusionnerFiles(...files) {
  const vus = new Set();
  return files
    .flat()
    .filter((o) => !vus.has(o.idOp) && vus.add(o.idOp))
    .sort((a, b) => a.creeLe - b.creeLe);
}
