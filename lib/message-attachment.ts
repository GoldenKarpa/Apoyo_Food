import { mediaUploadUrl } from "@/lib/media-url";

/**
 * The conversation composer's photo upload.
 *
 * Deliberately NOT `uploadSellerMedia` (`components/seller/upload.ts`): that
 * helper always targets a seller-only route, but a message can come from either
 * party, so this posts straight to the generic media-upload route
 * (`kind: "message"`) that any authenticated session may use — the same
 * reasoning Slice 15 gave for reusing that route for Fresh Today photos.
 *
 * ⚠ The composer renders on BOTH surfaces (`actor` says which), so unlike
 * `<StoryPostForm>` it cannot hardcode a surface — `mediaUploadUrl(actor)`
 * picks `/api/media/upload` (buyer, Food's own domain) or
 * `/api/food/media/upload` (seller, portal.apoyolime.com/food) per ecosystem
 * ruling E14. Getting this wrong breaks only in production, since one origin
 * serves both surfaces in local dev.
 *
 * ## ⚠ Why this lives here rather than inside the composer
 *
 * Extracted at PD-S10's review. It is the ONE mutation on the conversation
 * surface that is a `fetch` rather than a Server Action, and while it sat
 * inline in the component it was also the one mutation the demo's
 * `useFoodActions()` seam could not intercept. That meant the paperclip in
 * `/food/demo` performed a REAL authenticated upload — writing real WebP
 * variants into the server's `uploads/` tree, spending the visitor's real
 * rate-limit budget, and orphaning files no retention sweep collects — while
 * the demo's own banner promised that nothing is saved.
 *
 * It is now a plain exported function that the registry holds a reference to,
 * so the real product behaviour is unchanged and the demo can substitute its
 * own. Do not re-inline it.
 */
export async function uploadMessageAttachment(
  file: File,
  actor: "seller" | "client",
): Promise<{ ok: true; key: string } | { ok: false }> {
  const body = new FormData();
  body.set("kind", "message");
  body.set("file", file);
  try {
    const res = await fetch(mediaUploadUrl(actor === "seller" ? "seller" : "buyer"), {
      method: "POST",
      body,
    });
    if (!res.ok) return { ok: false };
    // Every ingest preset returns `PhotoVariantPaths` (`lib/media/ingest.ts`'s
    // `toPhotoPaths`) — the route hands that back as-is, so the response is
    // `{pathThumb, pathCard, pathFull, blurDataUrl}`, never a raw
    // `{variants: {...}}` shape (that's `ingestImage`'s own internal return
    // type, one layer further down than anything this route exposes).
    const data = (await res.json()) as { pathCard?: string };
    return data.pathCard ? { ok: true, key: data.pathCard } : { ok: false };
  } catch {
    // A dropped connection mid-upload is a normal event on a phone.
    return { ok: false };
  }
}
