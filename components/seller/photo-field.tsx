"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ImagePlus } from "lucide-react";

import { FoodImage } from "@/components/food-image";
import { Button } from "@/components/ui/button";
import { uploadSellerMedia, type SellerUploadErrorKey } from "@/components/seller/upload";

/**
 * Avatar and cover upload.
 *
 * Both go through `POST /api/seller/media`, which ingests via the Slice 4
 * pipeline and writes the resulting keys onto the seller's own row in the same
 * request. The browser never handles a storage key, so it can never ask for one
 * it does not own.
 *
 * ⚠ **EXIF, including GPS, is stripped at ingest** — Part G's hardest
 * requirement, and the one this specific control is most exposed to. A cook
 * photographs their food in their kitchen; the phone writes the kitchen's
 * coordinates into the file; publishing that on a marketplace whose fulfilment
 * model is "come to my house" would be doxxing them with their own camera. The
 * strip happens server-side in the pipeline (Slice 4 proves it by scanning
 * output bytes), never here — a client-side strip would be advice, not a
 * guarantee.
 *
 * Replacing a photo deletes the previous variants, so a seller trying five
 * photos does not leave twelve orphaned files behind (route handler).
 */
export function PhotoField({
  kind,
  currentKey,
  blurDataUrl,
}: {
  kind: "avatar" | "cover";
  currentKey: string | null;
  blurDataUrl: string | null;
}) {
  const t = useTranslations("seller.photo");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<SellerUploadErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so re-picking the SAME file still fires `change` — the
    // natural retry after a failed upload, and a silent no-op otherwise.
    event.target.value = "";
    if (!file) return;

    setError(null);
    const result = await uploadSellerMedia(kind, file);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // The row was written server-side; re-render the server component tree so
    // the new photo (and the completion model that reads it) are both current.
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4">
      {currentKey ? (
        <FoodImage
          src={currentKey}
          alt={t(kind === "avatar" ? "avatarAlt" : "coverAlt")}
          aspect={kind === "avatar" ? "thumb" : "cover"}
          blurDataUrl={blurDataUrl}
          sizes="(min-width: 768px) 480px, 100vw"
          className={kind === "avatar" ? "w-40 max-w-full" : "w-full max-w-xl"}
          surface="seller"
        />
      ) : (
        <div
          className={
            kind === "avatar"
              ? "aspect-thumb flex w-40 max-w-full items-center justify-center rounded-image border border-dashed border-hairline bg-sunken"
              : "aspect-cover flex w-full max-w-xl items-center justify-center rounded-image border border-dashed border-hairline bg-sunken"
          }
        >
          <ImagePlus aria-hidden className="size-8 text-ink" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPick}
          className="sr-only"
          id={`seller-photo-${kind}`}
        />
        <Button
          type="button"
          variant={currentKey ? "outline" : "primary"}
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? t("uploading") : currentKey ? t("replace") : t("choose")}
        </Button>
        <p className="text-caption text-ink">{t("hint")}</p>
      </div>

      {error && (
        <p role="alert" className="text-label text-error">
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  );
}
