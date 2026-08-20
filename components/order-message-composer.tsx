"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FoodImage } from "@/components/food-image";
import { useFoodActions } from "@/lib/actions/registry";
import { MAX_MESSAGE_LENGTH } from "@/lib/order-message-form";

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
  const actions = useFoodActions();
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
    const result = await actions.uploadMessageAttachment(file, actor);
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
        ? await actions.sendOrderMessage(target.orderId, actor, formData)
        : await actions.sendThreadMessage(target.threadId, actor, formData);
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
