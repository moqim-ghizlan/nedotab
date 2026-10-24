/**
 * Minimal ZIP writer (V2.10, backgrounds download): files are stored without compression
 * (pictures are already compressed), so no dependency is needed. Pure: bytes in, bytes out.
 */
const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(octets) {
  let c = 0xffffffff;
  for (const o of octets) c = TABLE_CRC[(c ^ o) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS date and time of a JavaScript date (ZIP headers). */
function dateDos(d) {
  return {
    heure: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    jour: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * @param {{ nom: string, octets: Uint8Array }[]} fichiers names in UTF-8, unique
 * @returns {Uint8Array} the ZIP archive
 */
export function creerZip(fichiers, date = new Date()) {
  const encodeur = new TextEncoder();
  const { heure, jour } = dateDos(date);
  const locaux = [];
  const centraux = [];
  let decalage = 0;
  for (const { nom, octets } of fichiers) {
    const nomOctets = encodeur.encode(nom);
    const crc = crc32(octets);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, heure, true);
    local.setUint16(12, jour, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, octets.length, true);
    local.setUint32(22, octets.length, true);
    local.setUint16(26, nomOctets.length, true);
    locaux.push(new Uint8Array(local.buffer), nomOctets, octets);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, heure, true);
    central.setUint16(14, jour, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, octets.length, true);
    central.setUint32(24, octets.length, true);
    central.setUint16(28, nomOctets.length, true);
    central.setUint32(42, decalage, true);
    centraux.push(new Uint8Array(central.buffer), nomOctets);
    decalage += 30 + nomOctets.length + octets.length;
  }
  const tailleCentrale = centraux.reduce((n, p) => n + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, fichiers.length, true);
  fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentrale, true);
  fin.setUint32(16, decalage, true);
  const parties = [...locaux, ...centraux, new Uint8Array(fin.buffer)];
  const resultat = new Uint8Array(parties.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parties) {
    resultat.set(p, i);
    i += p.length;
  }
  return resultat;
}
