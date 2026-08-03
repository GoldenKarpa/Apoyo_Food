"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from "lucide-react";
import type { FoodSellerPhoto } from "@prisma/client";

import { FoodImage } from "@/components/food-image";
import { Button } from "@/components/ui/button";
import { moveSellerPhoto, removeSellerPhoto } from "@/lib/actions/seller-photos";
import { uploadSellerMedia, type SellerUploadErrorKey } from "@/components/seller/upload";
import { MAX_GALLERY_PHOTOS } from "@/lib/seller-profile";

/**
 * The `FoodSellerPhoto` gallery manager — add, reorder, remove.
 *
 * Slice 8 seeded two gallery photos per seller and Slice 11 renders them on the
 * public profile; this is the first surface that lets a real seller put them
 * there. Photos are 4:3 through the same preset as meal photography (Slice 4's
 * `seller-gallery`), because they ARE food shots.
 *
 * ⚠ Removal deletes a row the seller owns, and nothing else — the action scopes
 * its query by `{ id, sellerId }`, so a photo id lifted from another seller's
 * page resolves to nothing. It is also confirmed in the browser first: a
 * one-tap destructive control next to a reorder control is a mis-tap waiting to
 * happen on a phone.
 */
export function GalleryManager({ photos }: { photos: FoodSellerPhoto[] }) {
  const t = useTranslations("seller.gallery");
  const te = useTranslations("seller.photo.errors");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<SellerUploadErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  const isFull = photos.length >= MAX_GALLERY_PHOTOS;

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    const result = await uploadSellerMedia("gallery", file);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {photos.length === 0 ? (
        <p className="rounded-card border border-dashed border-hairline bg-sunken p-6 text-label text-ink">
          {t("empty")}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="flex flex-col gap-2">
              <FoodImage
                src={photo.pathCard}
                alt={photo.caption ?? t("photoAlt", { position: index + 1 })}
                aspect="meal"
                blurDataUrl={photo.blurDataUrl}
                sizes="(min-width: 768px) 240px, 45vw"
              />
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={pending || index === 0}
                  aria-label={t("moveUp", { position: index + 1 })}
                  onClick={() => run(() => moveSellerPhoto(photo.id, "up"))}
                >
                  <ArrowUp aria-hidden className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={pending || index === photos.length - 1}
                  aria-label={t("moveDown", { position: index + 1 })}
                  onClick={() => run(() => moveSellerPhoto(photo.id, "down"))}
                >
                  <ArrowDown aria-hidden className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={pending}
                  aria-label={t("remove", { position: index + 1 })}
                  className="ml-auto text-error hover:bg-error/10"
                  onClick={() => {
                    if (!window.confirm(t("removeConfirm"))) return;
                    run(() => removeSellerPhoto(photo.id));
                  }}
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPick}
          className="sr-only"
          id="seller-gallery-file"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={pending || isFull}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus aria-hidden className="size-4" />
          {pending ? t("adding") : t("add")}
        </Button>
        <p className="text-caption text-ink">
          {isFull ? t("full", { max: MAX_GALLERY_PHOTOS }) : t("count", { count: photos.length, max: MAX_GALLERY_PHOTOS })}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-label text-error">
          {te(error)}
        </p>
      )}
    </div>
  );
}
