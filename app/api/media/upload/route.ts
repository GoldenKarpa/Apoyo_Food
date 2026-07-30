import { NextRequest, NextResponse } from "next/server";
import { getFoodSession } from "@/lib/session";
import { INGEST_PRESETS, isIngestPreset } from "@/lib/media/ingest";
import { maxUploadBytes } from "@/lib/media/validate";

/**
 * Server-mediated upload (architecture Part C): browser → this route → validate
 * → sharp variants → storage. **Deliberately not presigned direct-to-bucket**,
 * and the reason is a security one, not a convenience one: a direct-to-storage
 * upload would let a client put bytes in the bucket without the variant
 * pipeline or the EXIF strip ever running. Routing every byte through here is
 * what makes "no raw uploads anywhere" true rather than aspirational.
 *
 * ⚠ Auth: any authenticated user may upload. Per-resource ownership — "is this
 * YOUR listing / YOUR profile / YOUR Fresh Today post" — is enforced by the
 * slices that own those resources (13/14/15), because the resource doesn't
 * exist yet to be owned. What this route guarantees now is that an ANONYMOUS
 * request can never write to storage, which is the part that must not wait.
 */
export async function POST(req: NextRequest) {
  const session = await getFoodSession();
  if (!session) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "VALIDATION", detail: "Expected multipart/form-data" }, { status: 400 });
  }

  const kind = String(form.get("kind") ?? "");
  if (!isIngestPreset(kind)) {
    return NextResponse.json(
      { error: "VALIDATION", detail: `Unknown upload kind "${kind}"` },
      { status: 422 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "VALIDATION", detail: "Missing file" }, { status: 422 });
  }

  // Cheap pre-check off the declared size, so an oversized upload is rejected
  // before it is buffered into memory. `assertImageUploadValid` re-checks the
  // real byte length inside the pipeline — the declared size is client input
  // and is not trusted on its own.
  if (file.size > maxUploadBytes()) {
    return NextResponse.json(
      { error: "VALIDATION", detail: `File exceeds ${Math.floor(maxUploadBytes() / (1024 * 1024))} MB limit` },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await INGEST_PRESETS[kind](buffer, file.type);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    // Validation failures from the pipeline (bad magic bytes, disallowed type,
    // oversized) are caller-safe messages by construction — see
    // lib/media/validate.ts. Anything else is reported generically.
    const message = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: "VALIDATION", detail: message }, { status: 422 });
  }
}
