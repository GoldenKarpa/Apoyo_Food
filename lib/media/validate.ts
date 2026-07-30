/**
 * Upload validation — size cap + magic-byte sniffing, so a request cannot lie
 * about what it is sending (architecture Part G: "MIME sniff + size caps").
 * Restricted to the three formats a phone camera or a "save image" from
 * WhatsApp/Instagram actually produces.
 *
 * Adapted from Demia's `lib/uploads.ts`, narrowed: there is no PDF case here.
 * Unlike Salon/Demia's ID-verification uploads, Food has no document upload in
 * this plan — sellers only ever upload photos. Phase 9's seller verification
 * adds documents, and Part G is explicit that those go to a SEPARATE private
 * bucket under Salon's locked policy, not through this path.
 */

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

type MagicCheck = (b: Buffer) => boolean;

const MAGIC: Record<AllowedImageType, MagicCheck> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) =>
    b[0] === 0x52 && // R
    b[1] === 0x49 && // I
    b[2] === 0x46 && // F
    b[3] === 0x46 && // F
    b[8] === 0x57 && // W
    b[9] === 0x45 && // E
    b[10] === 0x42 && // B
    b[11] === 0x50, // P
};

export function maxUploadBytes(): number {
  const maxMb = parseInt(process.env.MAX_UPLOAD_MB ?? "10", 10) || 10;
  return maxMb * 1024 * 1024;
}

/** Throws with a caller-safe message on any validation failure. */
export function assertImageUploadValid(
  buffer: Buffer,
  declaredMimeType: string,
): asserts declaredMimeType is AllowedImageType {
  if (buffer.length > maxUploadBytes()) {
    throw new Error(`File exceeds ${Math.floor(maxUploadBytes() / (1024 * 1024))} MB limit`);
  }
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(declaredMimeType)) {
    throw new Error(`File type "${declaredMimeType}" is not allowed`);
  }
  const check = MAGIC[declaredMimeType as AllowedImageType];
  if (buffer.length < 12 || !check(buffer)) {
    throw new Error(`File content does not match declared type "${declaredMimeType}"`);
  }
}
