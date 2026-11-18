/** Holds a campaign discount code from a scanned /o/:code link until the visitor enrols. */
export const OFFER_COOKIE = "gt_offer";

/** Discount codes are stored upper-case; keep letters, digits and dashes only. */
export function normalizeOfferCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);
}
