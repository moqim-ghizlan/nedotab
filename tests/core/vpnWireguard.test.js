import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { lireProfil, matriceVersImage, nomFichierConf } from "../../src/core/vpnWireguard.js";
import { imageQr } from "../../src/ui/vpn/qr.js";

const CONF = `[Interface]
PrivateKey = cle-privee-de-test-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
Address = 10.8.0.2/32, fdcc:ad94:bacf:61a4::cafe:2/128
MTU = 1420
DNS = 9.9.9.9, 149.112.112.112

[Peer]
PublicKey = cle-publique-de-test-BBBBBBBBBBBBBBBBBBBBBBBBBBBBB=
PresharedKey = cle-partagee-de-test-CCCCCCCCCCCCCCCCCCCCCCCCCCCC=
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 0
Endpoint = nedotab-vpn.duckdns.org:51820
`;

describe("QR code", () => {
  it("encodé puis décodé : redonne exactement la configuration", () => {
    const image = imageQr(CONF);
    const lu = jsQR(image.data, image.width, image.height);
    expect(lu?.data).toBe(CONF);
  });
  it("assez grand pour être scanné (280 px au moins), carré", () => {
    const image = imageQr(CONF);
    expect(image.width).toBeGreaterThanOrEqual(280);
    expect(image.height).toBe(image.width);
  });
  it("une petite matrice est agrandie, zone de silence blanche", () => {
    const img = matriceVersImage({ size: 1, data: [1] }, { minimum: 40, marge: 4 });
    expect(img.width).toBeGreaterThanOrEqual(40);
    expect([...img.data.slice(0, 4)]).toEqual([255, 255, 255, 255]);
  });
});

describe("profil reçu", () => {
  it("garde seulement les champs attendus, refuse le reste", () => {
    expect(
      lireProfil({ config: CONF, nomProfil: "p_abcdefghij", pays: "Allemagne", x: 1 }),
    ).toEqual({
      config: CONF,
      nomProfil: "p_abcdefghij",
      pays: "Allemagne",
    });
    expect(lireProfil({ config: "pas wireguard", nomProfil: "p_abcdefghij" })).toBeNull();
    expect(lireProfil({ config: CONF, nomProfil: "moi@ex.org" })).toBeNull();
    expect(lireProfil(null)).toBeNull();
  });
  it("fichier nommé d'après le profil, jamais l'e-mail", () => {
    expect(nomFichierConf("p_abcdefghij")).toBe("p_abcdefghij.conf");
  });
});
