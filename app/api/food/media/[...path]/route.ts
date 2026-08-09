import type { NextRequest } from "next/server";
import { serveMedia } from "@/lib/media/serve";

/**
 * The **seller surface's** media serve route (ecosystem ruling E14, closing
 * the deferral DEPLOYMENT.md §6b predicted at first deploy).
 *
 * Identical behaviour to `/api/media/*` — same shared handler
 * (`lib/media/serve.ts`), same traversal guard, same public-content posture —
 * but namespaced under `/api/food/*`, the only API prefix nginx proxies to
 * this app on the portal host. Without it, any photo rendered on
 * `portal.apoyolime.com/food/*` (a seller's own avatar/cover/gallery, listing
 * photos, order-message attachments) resolves against portal-web and
 * 404s/500s with nothing in this app's own error log.
 *
 * Not auth-gated, matching its buyer-surface twin: these are the same public
 * storefront images, and gating one copy while the other is open would be
 * security theatre with a cache-miss cost.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  return serveMedia(segments);
}
