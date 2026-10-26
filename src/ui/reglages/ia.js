import { A } from "../../core/actions.js";
import {
  avecActif,
  avecModelePerso,
  avecRecommandations,
  avecUsage,
  EXPLICATIONS_IA,
  FOURNISSEURS,
  iaDe,
  LIBELLES_USAGES,
  sansModelePerso,
  usagesDuModele,
  USAGES,
  validerModelePerso,
} from "../../core/ia.js";
import { dateHeure } from "../../core/sauvegardes.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
import { creerServiceIa } from "../services/ia.js";
import { toast } from "../toast.js";

/** Value of a model <option>: "fournisseur|identifiant" (the provider never contains "|"). */
const valeurChoix = (c) => (c ? `${c.fournisseur}|${c.modele ?? c.id}` : "");
const lireChoix = (v) => {
  const i = v.indexOf("|");
  return i < 0 ? null : { fournisseur: v.slice(0, i), modele: v.slice(i + 1) };
};

/**
 * "Assistant IA" section of the settings (V4.1): on/off, my keys (one per provider, stored
 * encrypted on the server, never shown again), the model of each use, my own models.
 * The choices are synced settings (reglages.ia); the keys are not: only their state
 * (provider, last 4 characters, valid or not) is read from the server.
 */
export function sectionIa({ store, session, service = creerServiceIa() }) {
  let config = null; // config/ia
  let cles = null; // [{ fournisseur, fin, ajouteLe, valide }] | null while loading
  let erreurCles = null;
  /** Models each provider says the key can use: { [fournisseur]: [{ id, nom }] }. */
  const modelesDispo = {};
  /** Result of "Vérifier les modèles": { "fournisseur|id": true | false | null }. */
  const disponibilite = {};
  let verification = ""; // message under the button
  let enVerification = false;
  const racine = el("div", { class: "ia-reglages" });
  const section = el(
    "section",
    { class: "reglages-section", "aria-labelledby": "titre-ia" },
    el("h3", { id: "titre-ia", texte: "Assistant IA" }),
    racine,
  );

  const enCompte = () => session?.synchro?.lire().mode === "compte";
  const ia = () => iaDe(store.lire().reglages);
  const changer = (suivante) =>
    store.envoyer({ type: A.REGLAGES_MODIFIER, changements: { ia: suivante } });
  const nomFournisseur = (id) => config?.fournisseurs.find((f) => f.id === id)?.nom ?? id;
  const fournisseursOffertes = () =>
    (config?.fournisseurs ?? []).filter((f) => f.actif && FOURNISSEURS.includes(f.id));
  const cleDe = (id) => cles?.find((c) => c.fournisseur === id) ?? null;
  const avecCle = () => (cles ?? []).filter((c) => c.valide !== false).map((c) => c.fournisseur);

  async function charger() {
    if (!enCompte()) return;
    config = await service.config();
    const r = await service.etatCles();
    cles = r.ok ? r.valeur : null;
    erreurCles = r.ok ? null : r.erreur;
    rendre();
    // The lists of models come from the providers themselves (free, no quota used).
    await Promise.all(
      (cles ?? [])
        .filter((c) => c.valide !== false)
        .map(async (c) => {
          const m = await service.modeles(c.fournisseur);
          if (m.ok) modelesDispo[c.fournisseur] = m.valeur;
        }),
    );
    rendre();
  }

  // --- keys ------------------------------------------------------------------------------------
  /** Sheet to type a key: it is sent at once and the field is emptied, whatever happens. */
  async function demanderCle(fournisseur, remplacer) {
    const f = fournisseursOffertes().find((x) => x.id === fournisseur);
    const champ = el("input", {
      id: "ia-cle",
      type: "password",
      name: "cle-assistant",
      autocomplete: "off",
      autocapitalize: "off",
      spellcheck: "false",
      placeholder: "Collez votre clé ici",
    });
    const erreur = el("p", { class: "champ-erreur", role: "alert" });
    const ok = await demander({
      titre: `${remplacer ? "Remplacer" : "Ajouter"} ma clé ${f?.nom ?? fournisseur}`,
      contenu: [
        el(
          "div",
          { class: "champ" },
          el("label", { for: "ia-cle", texte: "Clé API" }),
          champ,
          erreur,
        ),
        f?.lienCle
          ? el("a", {
              href: f.lienCle,
              target: "_blank",
              rel: "noopener",
              texte: "Où trouver ma clé ?",
            })
          : null,
        el("p", {
          class: "reglages-note",
          texte:
            "Votre clé est chiffrée et n'est jamais affichée ni renvoyée à votre appareil. Les appels sont facturés par le fournisseur sur votre compte.",
        }),
      ].filter(Boolean),
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Enregistrer", valeur: true, principal: true },
      ],
    });
    const valeur = champ.value.trim();
    champ.value = "";
    if (!ok || !valeur) return;
    toast("Vérification de la clé auprès du fournisseur…", { duree: 3000, cle: "ia-cle" });
    const r = await service.enregistrerCle(fournisseur, valeur);
    if (!r.ok) {
      toast(r.erreur, { type: "erreur", duree: 7000, cle: "ia-cle" });
      return;
    }
    toast(`Clé …${r.valeur.fin} enregistrée`, { duree: 3000, cle: "ia-cle" });
    await charger();
  }

  async function retirerCle(fournisseur) {
    const ok = await demander({
      titre: "Supprimer ma clé",
      message: `Votre clé ${nomFournisseur(fournisseur)} sera supprimée du serveur. Vous pourrez en ajouter une autre.`,
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Supprimer", valeur: true, principal: true, danger: true },
      ],
    });
    if (!ok) return;
    const r = await service.supprimerCle(fournisseur);
    if (!r.ok) toast(r.erreur, { type: "erreur", duree: 6000 });
    await charger();
  }

  // --- models ----------------------------------------------------------------------------------
  /** "OK · 820 ms" or the reason, shown in `sortie`. */
  async function essayer(choix, sortie, bouton) {
    if (!choix) return;
    bouton.disabled = true;
    sortie.textContent = "Test en cours…";
    const r = await service.tester(choix.fournisseur, choix.modele);
    bouton.disabled = false;
    sortie.textContent = r.ok
      ? r.valeur.ok
        ? `OK · ${r.valeur.latenceMs} ms`
        : `Réponse reçue en ${r.valeur.latenceMs} ms, mais pas « OK »`
      : r.erreur;
    sortie.classList.toggle("ia-test--erreur", !r.ok);
    if (r.ok) await charger();
  }

  /** Options of a use: the suggested models, then the user's own, grouped by provider. */
  function listeModeles(usage) {
    const reglages = ia();
    const select = el("select", {
      "aria-label": `Modèle pour ${LIBELLES_USAGES[usage]}`,
      onchange: (e) => changer(avecUsage(ia(), usage, lireChoix(e.currentTarget.value))),
    });
    select.append(el("option", { value: "", texte: "Non défini" }));
    const courant = reglages.usages[usage];
    for (const id of avecCle()) {
      const groupe = el("optgroup", { label: nomFournisseur(id) });
      for (const m of config?.modelesSuggeres.filter((s) => s.fournisseur === id) ?? []) {
        const v = valeurChoix({ fournisseur: id, modele: m.id });
        groupe.append(
          el("option", {
            value: v,
            texte: `${m.nom}${m.recommandePour === usage ? " (recommandé)" : ""}`,
          }),
        );
      }
      for (const m of reglages.modelesPerso.filter((p) => p.fournisseur === id)) {
        groupe.append(
          el("option", { value: valeurChoix({ fournisseur: id, modele: m.id }), texte: m.nom }),
        );
      }
      // Then everything the provider lists for this key (nothing twice).
      const dejaLa = new Set([...groupe.querySelectorAll("option")].map((o) => o.value));
      for (const m of modelesDispo[id] ?? []) {
        const v = valeurChoix({ fournisseur: id, modele: m.id });
        if (!dejaLa.has(v)) groupe.append(el("option", { value: v, texte: m.nom }));
      }
      // Models checked with the key: the ones that answer first, the refused ones last.
      const rang = (o) =>
        disponibilite[o.value] === true ? 0 : disponibilite[o.value] === false ? 2 : 1;
      const options = [...groupe.querySelectorAll("option")];
      for (const o of options) {
        const d = disponibilite[o.value];
        if (d === true) o.textContent = `✓ ${o.textContent}`;
        if (d === false) {
          o.textContent = `✗ ${o.textContent} (indisponible)`;
          o.disabled = valeurChoix(courant) !== o.value;
        }
      }
      groupe.replaceChildren(...options.sort((a, b) => rang(a) - rang(b)));
      if (groupe.children.length) select.append(groupe);
    }
    // A model chosen earlier that is no longer in the list stays visible instead of vanishing.
    if (courant) {
      const v = valeurChoix(courant);
      const present = [...select.querySelectorAll("option")].some((o) => o.value === v);
      if (!present)
        select.append(
          el("option", {
            value: v,
            texte: `${courant.modele} (${nomFournisseur(courant.fournisseur)})`,
          }),
        );
    }
    select.value = courant ? valeurChoix(courant) : "";
    return select;
  }

  /** Asks the server which of the newest models (and the ones chosen) answer with the keys. */
  async function verifierModeles() {
    enVerification = true;
    verification = "Vérification des modèles avec votre clé…";
    rendre();
    let total = 0;
    let bons = 0;
    await Promise.all(
      avecCle().map(async (id) => {
        const choisis = USAGES.map((u) => ia().usages[u]).filter((c) => c?.fournisseur === id);
        const ids = [
          ...new Set([
            ...choisis.map((c) => c.modele),
            ...(modelesDispo[id] ?? []).map((m) => m.id),
          ]),
        ].slice(0, 10);
        if (!ids.length) return;
        const r = await service.verifierModeles(id, ids);
        if (!r.ok) {
          verification = r.erreur;
          return;
        }
        for (const m of r.valeur) {
          disponibilite[valeurChoix({ fournisseur: id, modele: m.id })] = m.ok;
          total++;
          if (m.ok) bons++;
        }
      }),
    );
    enVerification = false;
    if (total) {
      verification = `${bons} modèle${bons > 1 ? "s" : ""} disponible${bons > 1 ? "s" : ""} sur ${total} vérifié${total > 1 ? "s" : ""}. Les modèles refusés par votre clé sont marqués ✗.`;
    }
    rendre();
  }

  async function ajouterModele() {
    const fournisseur = el(
      "select",
      { id: "ia-m-fournisseur", "aria-label": "Fournisseur" },
      fournisseursOffertes().map((f) => el("option", { value: f.id, texte: f.nom })),
    );
    const id = el("input", {
      id: "ia-m-id",
      type: "text",
      autocomplete: "off",
      autocapitalize: "off",
      spellcheck: "false",
      placeholder: "ex. : le « model code » donné par le fournisseur",
    });
    const nom = el("input", {
      id: "ia-m-nom",
      type: "text",
      maxlength: "40",
      autocomplete: "off",
      placeholder: "Nom affiché",
    });
    const erreur = el("p", { class: "champ-erreur", role: "alert" });
    const champ = (etiquette, pour, controle) =>
      el("div", { class: "champ" }, el("label", { for: pour, texte: etiquette }), controle);
    const ok = await demander({
      titre: "Ajouter un modèle",
      contenu: [
        champ("Fournisseur", "ia-m-fournisseur", fournisseur),
        champ("Identifiant exact", "ia-m-id", id),
        champ("Nom affiché (facultatif)", "ia-m-nom", nom),
        erreur,
      ],
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Ajouter", valeur: true, principal: true },
      ],
    });
    if (!ok) return;
    const modele = validerModelePerso({
      fournisseur: fournisseur.value,
      id: id.value.trim(),
      nom: nom.value.trim() || id.value.trim().slice(0, 40),
      ajouteLe: Date.now(),
    });
    if (!modele) {
      toast("Identifiant invalide (lettres, chiffres et . _ : / @ - seulement).", {
        type: "erreur",
        duree: 6000,
      });
      return;
    }
    const suivante = avecModelePerso(ia(), modele);
    if (suivante === ia()) {
      toast("Ce modèle existe déjà, ou la limite de 20 modèles est atteinte.", { type: "erreur" });
      return;
    }
    changer(suivante);
    const tester = await demander({
      titre: "Tester ce modèle ?",
      message: `Un appel de test minimal (compté dans votre limite du jour) vérifie que « ${modele.nom} » répond.`,
      boutons: [
        { libelle: "Plus tard", valeur: false },
        { libelle: "Tester", valeur: true, principal: true },
      ],
    });
    if (!tester) return;
    const r = await service.tester(modele.fournisseur, modele.id);
    toast(r.ok ? `${modele.nom} : OK · ${r.valeur.latenceMs} ms` : r.erreur, {
      type: r.ok ? "info" : "erreur",
      duree: 6000,
    });
  }

  async function retirerModele(m) {
    const usages = usagesDuModele(ia(), m.fournisseur, m.id);
    const ok = await demander({
      titre: "Supprimer ce modèle",
      message: usages.length
        ? `« ${m.nom} » est utilisé pour : ${usages.map((u) => LIBELLES_USAGES[u]).join(", ")}. Ces usages passeront à « non défini ».`
        : `« ${m.nom} » sera retiré de votre liste.`,
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Supprimer", valeur: true, principal: true, danger: true },
      ],
    });
    if (ok) changer(sansModelePerso(ia(), m.fournisseur, m.id));
  }

  // --- screen ----------------------------------------------------------------------------------
  function rendre() {
    const reglages = ia();
    const compte = enCompte();
    const note = (texte) => el("p", { class: "reglages-note", texte });
    if (!compte) {
      racine.replaceChildren(note(EXPLICATIONS_IA["mode-local"]));
      return;
    }
    const prete = !!config && !!cles;
    const inactif = !reglages.actif;

    const interrupteur = el("input", {
      type: "checkbox",
      checked: reglages.actif,
      onchange: (e) => changer(avecActif(ia(), e.currentTarget.checked)),
    });
    const activation = el(
      "label",
      { class: "reglages-case" },
      interrupteur,
      el("span", { texte: "Activer l'assistant IA" }),
    );

    const lignesCles = fournisseursOffertes().map((f) => {
      const c = cleDe(f.id);
      return el(
        "li",
        { class: "ia-cle" },
        el(
          "div",
          { class: "ia-cle-texte" },
          el("strong", { texte: f.nom }),
          el("span", {
            class: c?.valide === false ? "ia-cle-etat ia-cle-etat--alerte" : "ia-cle-etat",
            texte: c
              ? c.valide === false
                ? `Clé …${c.fin} · À vérifier`
                : `Clé …${c.fin} · ajoutée le ${dateHeure(c.ajouteLe ?? Date.now()).slice(0, 10)}`
              : "Pas de clé",
          }),
        ),
        el(
          "div",
          { class: "ia-cle-actions" },
          el("button", {
            type: "button",
            class: "bouton",
            texte: c ? "Remplacer" : "Ajouter ma clé",
            disabled: inactif || !prete,
            onclick: () => demanderCle(f.id, !!c),
          }),
          c
            ? el("button", {
                type: "button",
                class: "lien-discret",
                texte: "Supprimer",
                disabled: inactif,
                "aria-label": `Supprimer ma clé ${f.nom}`,
                onclick: () => retirerCle(f.id),
              })
            : null,
        ),
      );
    });

    // First start: no key yet → three steps.
    const guide =
      reglages.actif && prete && avecCle().length === 0
        ? el(
            "ol",
            { class: "ia-guide" },
            el("li", { texte: "Choisissez un fournisseur dont vous avez une clé." }),
            el("li", { texte: "Ajoutez-la ci-dessous (« Ajouter ma clé »)." }),
            el("li", {
              texte: "Choisissez un modèle pour chaque usage, ou prenez nos recommandations.",
            }),
          )
        : null;

    const recommandations =
      reglages.actif && avecCle().length && config.modelesSuggeres.length
        ? el("button", {
            type: "button",
            class: "bouton",
            texte: "Utiliser les recommandations",
            onclick: () => changer(avecRecommandations(ia(), config.modelesSuggeres, avecCle())),
          })
        : null;

    const lignesUsages = USAGES.map((usage) => {
      const sortie = el("span", { class: "ia-test", "aria-live": "polite" });
      const bouton = el("button", {
        type: "button",
        class: "bouton",
        texte: "Tester",
        disabled: inactif || !reglages.usages[usage],
      });
      bouton.addEventListener("click", () => essayer(ia().usages[usage] ?? null, sortie, bouton));
      const select = listeModeles(usage);
      select.disabled = inactif || avecCle().length === 0;
      return el(
        "div",
        { class: "ia-usage" },
        el("label", { texte: LIBELLES_USAGES[usage] }, select),
        bouton,
        sortie,
      );
    });

    const lignesModeles = reglages.modelesPerso.map((m) =>
      el(
        "li",
        { class: "ia-modele" },
        el("span", { texte: `${m.nom} · ${nomFournisseur(m.fournisseur)}` }),
        el("code", { texte: m.id }),
        el("button", {
          type: "button",
          class: "lien-discret",
          texte: "Supprimer",
          "aria-label": `Supprimer le modèle ${m.nom}`,
          onclick: () => retirerModele(m),
        }),
      ),
    );

    // Empty slots (null) must not reach replaceChildren: they would be written as "null".
    racine.replaceChildren(
      ...[
        activation,
        note(
          "Chaque fonction IA utilise votre propre clé : les appels sont facturés par le fournisseur sur votre compte. Rien n'est envoyé tant que l'assistant est désactivé.",
        ),
        erreurCles ? el("p", { class: "compte-erreur", role: "alert", texte: erreurCles }) : null,
        !prete && !erreurCles ? note("Chargement…") : null,
        guide,
        el("h4", { texte: "Mes clés" }),
        el("ul", { class: "ia-liste" }, lignesCles),
        note("Votre clé est chiffrée et n'est jamais affichée ni renvoyée à votre appareil."),
        el("h4", { texte: "Modèle par usage" }),
        recommandations,
        el("button", {
          type: "button",
          class: "bouton",
          texte: enVerification ? "Vérification…" : "Vérifier les modèles",
          disabled: inactif || enVerification || avecCle().length === 0,
          onclick: verifierModeles,
        }),
        verification ? note(verification) : null,
        ...lignesUsages,
        el("h4", { texte: "Mes modèles" }),
        lignesModeles.length
          ? el("ul", { class: "ia-liste" }, lignesModeles)
          : note(
              "Les listes ci-dessus viennent directement de vos fournisseurs. Ajoutez ici seulement un modèle qui n'y figure pas (identifiant exact).",
            ),
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Ajouter un modèle",
          disabled: inactif || avecCle().length === 0,
          onclick: ajouterModele,
        }),
      ].filter(Boolean),
    );
  }

  rendre();
  charger();
  // Follows the settings (another device) and the account state; stops with the panel.
  let vue = JSON.stringify(store.lire().reglages.ia ?? null);
  const arretStore = store.abonner(() => {
    if (!section.isConnected) return arretStore();
    const suivante = JSON.stringify(store.lire().reglages.ia ?? null);
    if (suivante === vue) return;
    vue = suivante;
    rendre();
  });
  const arretSynchro = session?.synchro?.abonner?.(() => {
    if (!section.isConnected) return arretSynchro?.();
    if (enCompte() && !cles) charger();
    else rendre();
  });
  return { section };
}
