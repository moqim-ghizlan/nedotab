// Tiny Chrome DevTools Protocol driver over --remote-debugging-pipe (no dependency).
// Loads dist/extension as an unpacked extension so the real chrome.* APIs are available.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CANDIDATS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].filter(Boolean);

export async function lancerChrome({ headless = true, largeur = 1280, hauteur = 800 } = {}) {
  const exe = CANDIDATS.find((c) => existsSync(c));
  if (!exe) throw new Error("Chrome introuvable (définir CHROME_PATH)");
  const profil = mkdtempSync(join(tmpdir(), "nedotab-chrome-"));
  const args = [
    "--remote-debugging-pipe",
    "--enable-unsafe-extension-debugging",
    `--user-data-dir=${profil}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=${largeur},${hauteur}`,
  ];
  if (headless) args.push("--headless=new");
  const proc = spawn(exe, args, { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  const ecriture = proc.stdio[3];
  const lecture = proc.stdio[4];
  let id = 0;
  const attentes = new Map();
  const ecouteurs = new Set();
  let tampon = "";
  lecture.on("data", (morceau) => {
    tampon += morceau.toString("utf8");
    let i;
    while ((i = tampon.indexOf("\0")) >= 0) {
      const msg = JSON.parse(tampon.slice(0, i));
      tampon = tampon.slice(i + 1);
      if (msg.id && attentes.has(msg.id)) {
        const { ok, ko } = attentes.get(msg.id);
        attentes.delete(msg.id);
        msg.error ? ko(new Error(`${msg.error.message} ${msg.error.data || ""}`)) : ok(msg.result);
      } else ecouteurs.forEach((f) => f(msg));
    }
  });
  const envoyer = (method, params = {}, sessionId) =>
    new Promise((ok, ko) => {
      const msg = { id: ++id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      attentes.set(msg.id, { ok, ko });
      ecriture.write(JSON.stringify(msg) + "\0");
    });

  const navigateur = {
    envoyer,
    surEvenement: (f) => ecouteurs.add(f),
    async chargerExtension(chemin = "dist/extension") {
      const r = await envoyer("Extensions.loadUnpacked", { path: resolve(chemin) });
      return r.id;
    },
    async ouvrir(url) {
      const { targetId } = await envoyer("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await envoyer("Target.attachToTarget", { targetId, flatten: true });
      const page = creerPage(envoyer, sessionId, targetId, ecouteurs);
      await page.envoyer("Page.enable");
      await page.envoyer("Runtime.enable");
      await page.envoyer("Emulation.setDeviceMetricsOverride", {
        width: largeur,
        height: hauteur,
        deviceScaleFactor: 1,
        mobile: false,
      });
      if (url) await page.aller(url);
      return page;
    },
    async fermer() {
      try {
        await envoyer("Browser.close");
      } catch {
        /* already closed */
      }
      await new Promise((r) => setTimeout(r, 300));
      proc.kill();
      try {
        rmSync(profil, { recursive: true, force: true });
      } catch {
        /* Chrome may still hold files */
      }
    },
  };
  return navigateur;
}

function creerPage(envoyer, sessionId, targetId, ecouteurs) {
  creerPage.devant = targetId; // a new tab opens in the foreground
  const erreurs = [];
  ecouteurs.add((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.exceptionThrown")
      erreurs.push(msg.params.exceptionDetails.exception?.description || "exception");
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error")
      erreurs.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  });
  const page = {
    targetId,
    erreurs,
    envoyer: (m, p) => envoyer(m, p, sessionId),
    /** Input events only reach the foreground tab: bring this one to the front first. */
    async premierPlan() {
      if (creerPage.devant === targetId) return;
      await page.envoyer("Page.bringToFront");
      creerPage.devant = targetId;
    },
    async aller(url) {
      await page.envoyer("Page.navigate", { url });
      await attendre(600);
    },
    async eval(expression) {
      const r = await page.envoyer("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description);
      return r.result.value;
    },
    async capture(fichier) {
      const { data } = await page.envoyer("Page.captureScreenshot", { format: "png" });
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const { dirname } = await import("node:path");
      mkdirSync(dirname(fichier), { recursive: true });
      writeFileSync(fichier, Buffer.from(data, "base64"));
    },
    async taille(largeur, hauteur, mobile = false) {
      await page.envoyer("Emulation.setDeviceMetricsOverride", {
        width: largeur,
        height: hauteur,
        deviceScaleFactor: 1,
        mobile,
      });
    },
    async sombre(actif) {
      await page.envoyer("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: actif ? "dark" : "light" }],
      });
    },
    async touche(key, options = {}) {
      await page.premierPlan();
      const base = {
        key,
        code: options.code || key,
        windowsVirtualKeyCode: options.vk || 0,
        modifiers: options.modifiers || 0,
      };
      await page.envoyer("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
      if (options.texte)
        await page.envoyer("Input.dispatchKeyEvent", {
          type: "char",
          text: options.texte,
          ...base,
        });
      await page.envoyer("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    },
    /** Puts local files in the <input type=file> matched by `selecteur`, then fires "change". */
    async fichiers(selecteur, chemins) {
      const { result } = await page.envoyer("Runtime.evaluate", {
        expression: `document.querySelector(${JSON.stringify(selecteur)})`,
      });
      await page.envoyer("DOM.setFileInputFiles", { files: chemins, objectId: result.objectId });
    },
    async taper(texte) {
      await page.premierPlan();
      await page.envoyer("Input.insertText", { text: texte });
    },
    async souris(type, x, y, options = {}) {
      await page.premierPlan();
      await page.envoyer("Input.dispatchMouseEvent", {
        type,
        x,
        y,
        button: options.button || "left",
        buttons: options.buttons ?? (type === "mouseReleased" ? 0 : 1),
        clickCount: options.clickCount ?? 1,
      });
    },
  };
  return page;
}

export const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
