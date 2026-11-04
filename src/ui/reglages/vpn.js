import {
  adresseProxy,
  AVERTISSEMENT_INVITATION,
  DUREE_AFFICHAGE_MDP_MS,
  libelleInvite,
  LIBELLE_RESERVE,
  normaliserEmail,
  validerEmail,
} from "../../core/vpn.js";
import { demander } from "../dialogues/commun.js";
import { el } from "../dom.js";
import { creerServiceVpn } from "../services/vpn.js";
import { plateforme } from "../../platform/index.js";
import { toast } from "../toast.js";
import { blocVpnNavigateur } from "../vpnNavigateur.js";
import { blocWireguard } from "../vpn/wireguard.js";
import { blocReglesVpn } from "./reglesVpn.js";

/**
 * Settings → VPN (V5.2). The VPN is private: a guest sees "Accès accordé" and his own proxy
 * identifiers on request; anyone else sees one sentence and nothing about the server. The owner
 * (custom claim "admin", checked again by every function) also manages the guest list.
 *
 * The proxy password lives only in this screen's memory while it is shown (60 s): it is not
 * written to the synced document, the backups, the exports or the logs. The extension keeps it
 * locally from V5.3, where it is used.
 *
 * Loaded when the section becomes visible, not every time the settings open.
 */
export function sectionVpn({
  store = null,
  service = creerServiceVpn(),
  vpn = plateforme.capacites.vpnNavigateur ? plateforme.vpnNavigateur() : null,
} = {}) {
  const etat = {
    charge: false,
    chargement: false,
    admin: false,
    acces: undefined, // undefined: unknown · null: not invited · object: identifiers
    erreurAcces: null,
    invites: null,
    erreurInvites: null,
    visible: false, // the password is shown
    occupe: false, // a new password is being generated (the first call can take a few seconds)
  };
  let minuterie = null;
  const racine = el("div", { class: "vpn-reglages" });
  const section = el(
    "section",
    { class: "reglages-section", "aria-labelledby": "titre-vpn" },
    el("h3", { id: "titre-vpn", texte: "VPN" }),
    racine,
  );

  const note = (texte, classe = "reglages-note") => el("p", { class: classe, texte });

  const masquer = () => {
    clearTimeout(minuterie);
    minuterie = null;
    etat.visible = false;
  };
  const montrer = () => {
    etat.visible = true;
    clearTimeout(minuterie);
    minuterie = setTimeout(() => {
      masquer();
      dessiner();
    }, DUREE_AFFICHAGE_MDP_MS);
  };

  async function charger() {
    if (etat.chargement) return;
    etat.chargement = true;
    dessiner();
    etat.admin = await service.estAdmin();
    await chargerAcces();
    if (etat.admin) await chargerInvites();
    etat.chargement = false;
    etat.charge = true;
    dessiner();
  }

  /** My own access: read again after an invitation or a removal (it may have changed). */
  async function chargerAcces() {
    masquer();
    const a = await service.acces();
    if (a.ok) {
      etat.acces = a.valeur;
      etat.erreurAcces = null;
    } else if (a.code === "functions/permission-denied") {
      etat.acces = null;
      etat.erreurAcces = null;
    } else {
      etat.erreurAcces = a.erreur;
    }
  }

  async function chargerInvites() {
    const r = await service.invites();
    etat.invites = r.ok ? r.valeur.invites : null;
    etat.erreurInvites = r.ok ? null : r.erreur;
  }

  async function inviter(champ, bouton) {
    const erreur = validerEmail(champ.value);
    if (erreur) {
      toast(erreur, { type: "erreur", cle: "vpn" });
      champ.focus();
      return;
    }
    bouton.disabled = true;
    const r = await service.inviter(normaliserEmail(champ.value));
    bouton.disabled = false;
    if (!r.ok) {
      toast(r.erreur, { type: "erreur", duree: 6000, cle: "vpn" });
      return;
    }
    toast(r.valeur.statut === "acceptee" ? "Accès accordé." : "Invitation enregistrée.", {
      duree: 3000,
      cle: "vpn",
    });
    champ.value = "";
    await chargerInvites();
    // The invited address may be mine: my own access can now exist.
    if (!etat.acces) await chargerAcces();
    dessiner();
  }

  async function retirer(invite) {
    const ok = await demander({
      titre: "Retirer l'accès",
      message: `${invite.email} ne pourra plus utiliser le VPN (en moins de 2 minutes).`,
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Retirer l'accès", valeur: true, principal: true, danger: true },
      ],
    });
    if (!ok) return;
    const r = await service.revoquer(invite.email);
    if (!r.ok) {
      toast(r.erreur, { type: "erreur", duree: 6000, cle: "vpn" });
      return;
    }
    toast("Accès retiré.", { duree: 3000, cle: "vpn" });
    await chargerInvites();
    // I may have removed my own access.
    if (etat.acces) await chargerAcces();
    dessiner();
  }

  async function regenerer() {
    const ok = await demander({
      titre: "Nouveau mot de passe",
      message:
        "L'ancien mot de passe cessera de fonctionner dans la minute. Mettez à jour vos appareils avec le nouveau.",
      boutons: [
        { libelle: "Annuler", valeur: false },
        { libelle: "Générer", valeur: true, principal: true },
      ],
    });
    if (!ok) return;
    // Feedback at once: the first call (cold start of the function) can take several seconds.
    masquer();
    etat.occupe = true;
    dessiner();
    const r = await service.regenerer();
    etat.occupe = false;
    if (!r.ok || !r.valeur) {
      toast(r.erreur ?? "Le VPN est indisponible pour l'instant.", {
        type: "erreur",
        duree: 6000,
        cle: "vpn",
      });
      dessiner();
      return;
    }
    etat.acces = r.valeur;
    montrer();
    dessiner();
  }

  async function copier(texte, libelle) {
    try {
      await navigator.clipboard.writeText(texte);
      toast(`${libelle} copié.`, { duree: 2000, cle: "vpn" });
    } catch {
      toast("Copie impossible : sélectionnez le texte à la main.", { type: "erreur", cle: "vpn" });
    }
  }

  const ligneDonnee = (libelle, valeur, { copierLibelle } = {}) =>
    el(
      "div",
      { class: "vpn-donnee" },
      el("span", { class: "vpn-donnee-libelle", texte: libelle }),
      el("code", { class: "vpn-donnee-valeur", texte: valeur }),
      copierLibelle
        ? el("button", {
            type: "button",
            class: "bouton",
            texte: "Copier",
            "aria-label": `Copier ${copierLibelle}`,
            onclick: () => copier(valeur, copierLibelle),
          })
        : null,
    );

  function blocMonAcces() {
    const bloc = el("div", { class: "vpn-acces" }, el("h4", { texte: "Mon accès" }));
    if (etat.occupe) {
      bloc.append(
        el("p", {
          class: "reglages-note",
          role: "status",
          texte: "Génération du nouveau mot de passe… Quelques secondes.",
        }),
      );
      return bloc;
    }
    if (etat.erreurAcces) {
      bloc.append(
        note(etat.erreurAcces),
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Réessayer",
          onclick: () => relancer(),
        }),
      );
      return bloc;
    }
    if (!etat.acces) {
      bloc.append(
        note(LIBELLE_RESERVE),
        etat.admin
          ? note("Pour l'utiliser vous-même, invitez votre propre adresse e-mail ci-dessus.")
          : null,
      );
      return bloc;
    }
    const a = etat.acces;
    bloc.append(note("Accès accordé.", "reglages-note vpn-accorde"));
    if (!etat.visible) {
      bloc.append(
        el("button", {
          type: "button",
          class: "bouton bouton--principal",
          texte: "Afficher mes identifiants",
          onclick: () => {
            montrer();
            dessiner();
          },
        }),
      );
      return bloc;
    }
    bloc.append(
      el(
        "div",
        { class: "vpn-donnees" },
        ligneDonnee("Serveur proxy", adresseProxy(a)),
        a.pays ? ligneDonnee("Pays de sortie", a.pays) : null,
        ligneDonnee("Identifiant", a.compte, { copierLibelle: "l'identifiant" }),
        ligneDonnee("Mot de passe", a.motDePasse, { copierLibelle: "le mot de passe" }),
      ),
      note(
        "Ces informations se masquent seules après une minute. Ne les partagez avec personne : elles sont personnelles.",
      ),
      el(
        "div",
        { class: "vpn-actions" },
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Masquer",
          onclick: () => {
            masquer();
            dessiner();
          },
        }),
        el("button", {
          type: "button",
          class: "bouton",
          texte: "Nouveau mot de passe",
          onclick: regenerer,
        }),
      ),
    );
    return bloc;
  }

  function blocInvites() {
    const champ = el("input", {
      type: "email",
      id: "vpn-email",
      autocomplete: "off",
      spellcheck: "false",
      maxlength: "254",
      placeholder: "adresse@exemple.fr",
      "aria-label": "Adresse e-mail à inviter",
    });
    const bouton = el("button", {
      type: "button",
      class: "bouton bouton--principal",
      texte: "Inviter",
      onclick: () => inviter(champ, bouton),
    });
    champ.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        inviter(champ, bouton);
      }
    });
    const bloc = el(
      "div",
      { class: "vpn-invites" },
      el("h4", { texte: "Invités" }),
      note(AVERTISSEMENT_INVITATION),
      el("div", { class: "vpn-inviter" }, champ, bouton),
    );
    if (etat.erreurInvites) bloc.append(note(etat.erreurInvites));
    const liste = (etat.invites ?? []).filter((i) => i.statut !== "revoquee");
    if (etat.invites && liste.length === 0) bloc.append(note("Aucun invité pour l'instant."));
    if (liste.length > 0) {
      bloc.append(
        el(
          "ul",
          { class: "vpn-liste" },
          liste.map((i) =>
            el(
              "li",
              { class: "vpn-invite" },
              el(
                "span",
                { class: "vpn-invite-texte" },
                el("strong", { texte: i.email }),
                el("span", { class: "reglages-note", texte: libelleInvite(i) }),
              ),
              el("button", {
                type: "button",
                class: "bouton bouton--danger",
                texte: "Retirer l'accès",
                "aria-label": `Retirer l'accès de ${i.email}`,
                onclick: () => retirer(i),
              }),
            ),
          ),
        ),
      );
    }
    return bloc;
  }

  function dessiner() {
    racine.replaceChildren();
    if (!etat.charge) {
      racine.append(
        note(etat.chargement ? "Chargement…" : "Ouvrez cet onglet pour vérifier votre accès."),
      );
      return;
    }
    // V5.3: the switch of the extension (nothing in the web app: no browser proxy there).
    if (vpn)
      racine.append(
        blocVpnNavigateur({
          vpn,
          service,
          verification: plateforme.verificationVpn?.() ?? null,
          options: true,
        }).racine,
      );
    // V5.6: per-site rules (synced setting; extension only, with a state to edit).
    if (vpn && store) racine.append(blocReglesVpn({ store }).racine);
    if (etat.admin) racine.append(blocInvites());
    racine.append(blocMonAcces());
    // V5.8: WireGuard for the whole device (guests only).
    if (etat.acces && !etat.occupe) racine.append(blocWireguard({ service }).racine);
  }

  function relancer() {
    etat.charge = false;
    etat.chargement = false;
    charger();
  }

  // Loaded when the section becomes visible; at once where the browser cannot tell.
  if (typeof IntersectionObserver === "function") {
    const observateur = new IntersectionObserver((entrees) => {
      if (entrees.some((e) => e.isIntersecting) && !etat.charge && !etat.chargement) charger();
    });
    observateur.observe(section);
  } else {
    queueMicrotask(charger);
  }
  dessiner();

  return { section, charger, masquer };
}
