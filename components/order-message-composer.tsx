"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FoodImage } from "@/components/food-image";
import { sendOrderMessage } from "@/lib/actions/order-message";
import { MAX_MESSAGE_LENGTH } from "@/lib/order-message-form";

/**
 * The composer's own upload call — deliberately NOT `uploadSellerMedia`
 * (`components/seller/upload.ts`): that helper defaults to the SELLER-only
 * `/api/seller/media` route, but a message can come from either party, so
 * this posts straight to the generic `/api/media/upload` route (`kind:
 * "message"`) that any authenticated session may use — the same reasoning
 * Slice 15 gave for reusing that route for Fresh Today photos.
 */
async function uploadAttachment(file: File): Promise<{ ok: true; key: string } | { ok: false }> {
  const body = new FormData();
  body.set("kind", "message");
  body.set("file", file);
  try {
    const res = await fetch("/api/media/upload", { method: "POST", body });
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
 * The order thread's composer — text and/or one photo attachment, shared by
 * both surfaces (`actor` picks the ownership guard `sendOrderMessage` runs).
 * Photo uploads first (Slice 4's pipeline), THEN the message is sent
 * referencing the resulting key — a message can't attach a photo that
 * doesn't exist yet, the same "ingest first, attach second" order Slice 15
 * established for Fresh Today.
 */
export function OrderMessageComposer({ orderId, actor }: { orderId: string; actor: "seller" | "client" }) {
  const t = useTranslations("orderThread.composer");
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [text, setText] = React.useState("");
  const [attachment, setAttachment] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(false);
    const result = await uploadAttachment(file);
    setUploading(false);
    if (result.ok) setAttachment(result.key);
    else setError(true);
  }

  async function handleSend() {
    if (!text.trim() && !attachment) return;
    setSending(true);
    setError(false);
    const formData = new FormData();
    formData.set("text", text.trim());
    formData.set("attachmentPath", attachment ?? "");
    const result = await sendOrderMessage(orderId, actor, formData);
    setSending(false);
    if (!result.ok) {
      setError(true);
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
          <FoodImage src={attachment} alt="" aspect="thumb" sizes="96px" />
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
      {error && <p className="text-caption text-error">{t("error")}</p>}
    </div>
  );
}
