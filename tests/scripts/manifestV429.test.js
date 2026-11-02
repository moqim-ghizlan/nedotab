import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// V4.29: minimal permissions and a popup built for the extension only.
const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
const vite = readFileSync("vite.config.js", "utf8");

describe("manifeste de l'extension (V4.29)", () => {
  it("bouton de barre d'outils avec fenêtre", () => {
    expect(manifest.action.default_popup).toBe("popup.html");
    expect(manifest.action.default_title).toBe("NedoTab");
  });
  it("permissions minimales : activeTab et sidePanel, jamais tabs ni <all_urls>", () => {
    expect(manifest.permissions).toEqual(expect.arrayContaining(["activeTab", "sidePanel"]));
    expect(manifest.permissions).not.toContain("tabs");
    expect(JSON.stringify(manifest)).not.toContain("<all_urls>");
    expect(manifest.host_permissions).toBeUndefined();
  });
  it("le panneau latéral affiche la page NedoTab avec l'assistant", () => {
    expect(manifest.side_panel.default_path).toBe("newtab.html?panneau=chat");
  });
  it("popup.html dans l'entrée de l'extension seulement", () => {
    const [, pwa, extension] = vite.split(/rollupOptions: \{\s*input:/);
    expect(pwa).not.toContain("popup.html");
    expect(extension).toContain('popup: "popup.html"');
  });
  it("aucun script externe dans popup.html", () => {
    const html = readFileSync("popup.html", "utf8");
    expect(html).not.toMatch(/src="https?:/);
  });
});
