/**
 * The browser half of seller media upload, shared by `<PhotoField>` and
 * `<GalleryManager>`.
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

export async function uploadSellerMedia(
  kind: "avatar" | "cover" | "gallery",
  file: File,
): Promise<SellerUploadResult> {
  const body = new FormData();
  body.set("kind", kind);
  body.set("file", file);

  let response: Response;
  try {
    response = await fetch("/api/seller/media", { method: "POST", body });
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
