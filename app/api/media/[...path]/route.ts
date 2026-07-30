import { NextRequest, NextResponse } from "next/server";
import { readMedia, safeStorageKey } from "@/lib/storage";

/**
 * Public media serve route — the local-disk driver's read side.
 *
 * **Deliberately NOT auth-gated.** Listing, seller and Fresh Today photos are
 * anonymous-browsable storefront content (architecture F3: "anonymous browsing
 * everywhere; auth gates only at commitment"), unlike Salon/Portal's private
 * ID-document routes. The traversal guard still applies regardless: an attacker
 * does not need the content to be private to benefit from a `../../` payload
 * reading an arbitrary file off disk.
 *
 * ⚠ Phase 9's seller-verification documents must NOT be served through here.
 * Part G puts them in a separate private bucket under Salon's locked policy —
 * signed URLs, admin-only, audit log, ~30-day retention.
 *
 * Sits under `/api/media/*`, which the host-gating middleware already leaves
 * reachable on both hosts with no change: it matches `/api/*` (never blocked on
 * `portal.*`) and doesn't match `/food/*` (never blocked on `food.*`).
 *
 * Content-Type is derived from the STORED extension, never from client input —
 * there is no client input here at all, since the URL can only ever name a key
 * this app itself wrote.
 */

const EXTENSION_MIME: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;

  // Reject anything that isn't exactly `<category>/<filename>` before it reaches
  // storage. `safeStorageKey` is the same guard `resolveStorageKey` applies
  // internally, called here explicitly so a malformed URL 404s without even
  // attempting a filesystem read.
  const key = segments.join("/");
  if (!safeStorageKey(key)) {
    return new NextResponse(null, { status: 404 });
  }

  const { buffer, exists } = await readMedia(key);
  if (!exists) {
    return new NextResponse(null, { status: 404 });
  }

  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const contentType = EXTENSION_MIME[ext] ?? "application/octet-stream";

  // Node's Buffer satisfies BodyInit at runtime but not structurally under
  // lib.dom's generic Uint8Array<ArrayBuffer> — wrap rather than fight the type.
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Storage keys carry a random id and are never reused for different
      // content — immutable, cacheable indefinitely.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
