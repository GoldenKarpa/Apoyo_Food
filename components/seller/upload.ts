/**
 * The browser half of seller media upload, shared by `<PhotoField>`,
 * `<GalleryManager>` and (Slice 14) `<ListingPhotoManager>`.
 *
 * ⚠ The server's own `detail` string is deliberately DISCARDED. Route handlers
 * answer in English ("File exceeds 10 MB limit"), and the seller surface
 * defaults to `es` — surfacing that text would put the one untranslated
 * sentence in the app directly in front of a Spanish-first cook, at the moment
 * they are already confused about why their photo did not upload. The status
 * code is mapped to a message key instead, and the catalogue says it in their
 * language.
 */

export type SellerUploadErrorKey = "tooLarge" | "invalid" | "rateLimited" | "unauthorized" | "failed";

export type SellerUploadResult = { ok: true } | { ok: false; error: SellerUploadErrorKey };

export interface UploadOptions {
  /**
   * Defaults to `/api/seller/media`. Slice 14's listing photos go through
   * `/api/seller/listing-media` instead — a different ownership check (listing
   * -> seller, one relation hop further out than a seller's own media), same
   * request/response shape, so this is an override rather than a second helper.
   */
  endpoint?: string;
  /** Extra form fields the target route needs — e.g. `{ listingId }`. */
  extraFields?: Record<string, string>;
}

export async function uploadSellerMedia(
  kind: "avatar" | "cover" | "gallery",
  file: File,
  options: UploadOptions = {},
): Promise<SellerUploadResult> {
  const body = new FormData();
  body.set("kind", kind);
  body.set("file", file);
  for (const [key, value] of Object.entries(options.extraFields ?? {})) {
    body.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(options.endpoint ?? "/api/seller/media", { method: "POST", body });
  } catch {
    // A dropped connection mid-upload is a normal event on a phone.
    return { ok: false, error: "failed" };
  }

  if (response.ok) return { ok: true };

  switch (response.status) {
    case 401:
      return { ok: false, error: "unauthorized" };
    case 413:
      return { ok: false, error: "tooLarge" };
    case 422:
      return { ok: false, error: "invalid" };
    case 429:
      return { ok: false, error: "rateLimited" };
    default:
      return { ok: false, error: "failed" };
  }
}
