import QRCode from "qrcode";
import { matriceVersImage } from "../../core/vpnWireguard.js";

/**
 * V5.8: QR code generated HERE, in the browser. The text holds a private key: it must never go
 * to an online QR service. Medium error correction, at least 280 px wide.
 *
 * @returns {{ data: Uint8ClampedArray, width: number, height: number }} RGBA pixels
 */
export function imageQr(texte) {
  const qr = QRCode.create(texte, { errorCorrectionLevel: "M" });
  return matriceVersImage(qr.modules);
}

/** Draws the code in a canvas (size in pixels = size of the image). */
export function dessinerQr(canvas, texte) {
  const image = imageQr(texte);
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
}

/** Erases the canvas (the code leaves the screen). */
export function effacerQr(canvas) {
  const ctx = canvas.getContext("2d");
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = canvas.height = 0;
}
