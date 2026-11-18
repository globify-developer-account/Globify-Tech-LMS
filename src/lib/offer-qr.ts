import QRCode from "qrcode";
import { BRAND_MARK_INNER_SVG, BRAND_MARK_VIEWBOX } from "@/lib/brand-mark-svg";

/**
 * A print-ready QR code (SVG) for a link, with the Globify Tech mark on a white
 * badge in the centre. Error correction H recovers ~30% of the symbol, so the
 * badge (about 7% of the area) doesn't stop it scanning. Works in the browser.
 */
export async function brandedQrSvg(url: string, sizePx = 1024): Promise<string> {
  const qr = (await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "H", margin: 2, color: { dark: "#0B1530", light: "#FFFFFF" } })).trim();
  const n = Number(qr.match(/viewBox="0 0 (\d+) \d+"/)?.[1]);
  if (!n) throw new Error("Unexpected QR code output");
  const logo = n * 0.2;
  const pad = n * 0.025;
  const at = (n - logo) / 2;
  const badge = `<rect x="${at - pad}" y="${at - pad}" width="${logo + 2 * pad}" height="${logo + 2 * pad}" rx="${pad * 1.5}" fill="#FFFFFF"/>`;
  const mark = `<svg x="${at}" y="${at}" width="${logo}" height="${logo}" viewBox="${BRAND_MARK_VIEWBOX}" shape-rendering="geometricPrecision">${BRAND_MARK_INNER_SVG}</svg>`;
  return qr.replace(/^<svg /, `<svg width="${sizePx}" height="${sizePx}" `).replace(/<\/svg>$/, `${badge}${mark}</svg>`);
}
