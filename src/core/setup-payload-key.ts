/** Canonical key for comparing setup payloads (QR vs manual entry). */
export function setupPayloadIdentityKey(payload: string): string {
  const raw = payload.trim();
  if (/^mt:/i.test(raw)) {
    return `MT:${raw.slice(3).replace(/\s+/g, "")}`;
  }
  return raw.replace(/[\s-]/g, "").toLowerCase();
}
