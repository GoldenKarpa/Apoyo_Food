"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FoodImage } from "@/components/food-image";
import { sendOrderMessage, sendThreadMessage } from "@/lib/actions/order-message";
import { MAX_MESSAGE_LENGTH } from "@/lib/order-message-form";
import { mediaUploadUrl } from "@/lib/media-url";

/**
 * The composer's own upload call — deliberately NOT `uploadSellerMedia`
 * (`components/seller/upload.ts`): that helper always targets a seller-only
 * route, but a message can come from either party, so this posts straight to
 * the generic media-upload route (`kind: "message"`) that any authenticated
 * session may use — the same reasoning Slice 15 gave for reusing that route
 * for Fresh Today photos.
 *
 * ⚠ This composer renders on BOTH surfaces (`actor` says which), so unlike
 * `<StoryPostForm>` it cannot hardcode a surface — `mediaUploadUrl(actor)`
 * picks `/api/media/upload` (buyer, client.apoyolime.com's own domain) or
 * `/api/food/media/upload` (seller, portal.apoyolime.com/food) per ecosystem
 * ruling E14. Getting this wrong breaks only in production, since one origin
 * serves both surfaces in local dev.
 */
async function uploadAttachment(
  file: File,
  actor: "seller" | "client",
): Promise<{ ok: true; key: string } | { ok: false }> {
  const body = new FormData();
  body.set("kind", "message");
  body.set("file", file);
  try {
    const res = await fetch(mediaUploadUrl(actor === "seller" ? "seller" : "buyer"), { method: "POST", body });
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

/**
 * Where a composed message is sent. PC-1 gave this component a second
 * destination: an order's detail page still sends against the order (so the
 * message records which order it was about), while the Messages section sends
 * against the persistent thread, with no order in context.
 */
export type ComposerTarget = { kind: "order"; orderId: string } | { kind: "thread"; threadId: string };

/**
 * The conversation composer — text and/or one photo attachment, shared by both
 * surfaces (`actor` picks the ownership guard the action runs) and, since
 * PC-1, by both destinations (`target`). Photo uploads first (Slice 4's
 * pipeline), THEN the message is sent referencing the resulting key — a
 * message can't attach a photo that doesn't exist yet, the same "ingest first,
 * attach second" order Slice 15 established for Fresh Today.
 *
 * ⚠ **The file and export keep their `Order…` names on purpose.** They are now
 * generic, but every rename here is a delete-and-recreate of a file two order
 * pages import, and the accuracy gained is not worth that churn. Read
 * "Order" as "the conversation", not as "bound to an order".
 *
 * ⚠ Rendering this component is NOT what decides whether a message may be
 * sent. The gate is server-side in `resolveThreadAccess`, re-derived on every
 * send; a caller that renders a composer it shouldn't gets a `blocked` result,
 * not a written message. The pages below it decide whether to render one at
 * all — that is UX, not enforcement.
 */
export function OrderMessageComposer({ target, actor }: { target: ComposerTarget; actor: "seller" | "client" }) {
  const t = useTranslations("orderThread.composer");
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [text, setText] = React.useState("");
  const [attachment, setAttachment] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<"generic" | "blocked" | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    const result = await uploadAttachment(file, actor);
    setUploading(false);
    if (result.ok) setAttachment(result.key);
    else setError("generic");
  }

  async function handleSend() {
    if (!text.trim() && !attachment) return;
    setSending(true);
    setError(null);
    const formData = new FormData();
    formData.set("text", text.trim());
    formData.set("attachmentPath", attachment ?? "");
    const result =
      target.kind === "order"
        ? await sendOrderMessage(target.orderId, actor, formData)
        : await sendThreadMessage(target.threadId, actor, formData);
    setSending(false);
    if (!result.ok) {
      // `blocked` means the seller closed post-order conversation (or the last
      // open order closed) while this composer was on screen — a stale page,
      // not a failure to retry. Saying "try again" there would be a lie.
      setError(result.reason === "blocked" ? "blocked" : "generic");
      return;
    }
    setText("");
    setAttachment(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-hairline bg-card p-4">
      {attachment && (
        <div className="relative w-24">
          <FoodImage
            src={attachment}
            alt=""
            aspect="thumb"
            sizes="96px"
            surface={actor === "seller" ? "seller" : "buyer"}
          />
          <button
            type="button"
            aria-label={t("removeAttachment")}
            onClick={() => setAttachment(null)}
            className="tap-target absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-pill bg-ink text-card"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <Textarea
        value={text}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder={t("placeholder")}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center justify-between gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={uploading || !!attachment}
          onClick={() => fileInputRef.current?.click()}
          aria-label={t("attach")}
        >
          {uploading ? <span className="text-caption">…</span> : <Paperclip aria-hidden className="h-5 w-5" />}
        </Button>
        <Button type="button" onClick={handleSend} disabled={sending || uploading || (!text.trim() && !attachment)}>
          <Send aria-hidden className="h-4 w-4" />
          {sending ? t("sending") : t("send")}
        </Button>
      </div>
      {error && <p className="text-caption text-error">{t(error === "blocked" ? "blocked" : "error")}</p>}
    </div>
  );
}
