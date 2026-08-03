"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from "lucide-react";

import { FoodImage } from "@/components/food-image";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { moveListingPhoto, removeListingPhoto } from "@/lib/actions/listing-photos";
import { uploadSellerMedia, type SellerUploadErrorKey } from "@/components/seller/upload";
import { MAX_LISTING_PHOTOS } from "@/lib/listing-form";

export interface ListingPhotoRow {
  id: string;
  pathCard: string;
  blurDataUrl: string;
}

/**
 * `FoodListingPhoto` manager — `<GalleryManager>`'s shape (Slice 13), with one
 * addition the schema itself calls for: position 0 is the hero image (Part D's
 * own comment on `sortOrder`), and it's what a `<MealCard>` actually shows
 * everywhere on the site — so it carries a visible label here rather than
 * being a fact a seller has to infer from photo order.
 *
 * ⚠ Uploads go through `/api/seller/listing-media`, not `/api/seller/media` —
 * a different route because the ownership check is one relation hop further
 * out (listing -> seller, not seller directly). `uploadSellerMedia` still
 * works for the request/response shape; only the endpoint and the `listingId`
 * field differ, so it takes an explicit `endpoint` override rather than
 * growing a second near-identical helper.
 */
export function ListingPhotoManager({ listingId, photos }: { listingId: string; photos: ListingPhotoRow[] }) {
  const t = useTranslations("seller.listingForm.photos");
  const te = useTranslations("seller.photo.errors");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<SellerUploadErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  const isFull = photos.length >= MAX_LISTING_PHOTOS;

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    const result = await uploadSellerMedia("gallery", file, {
      endpoint: "/api/seller/listing-media",
      extraFields: { listingId },
    });
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
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {photos.map((photo, index) => (
            <li key={photo.id} className="flex flex-col gap-2">
              <div className="relative">
                <FoodImage
                  src={photo.pathCard}
                  alt={t("photoAlt", { position: index + 1 })}
                  aspect="meal"
                  blurDataUrl={photo.blurDataUrl}
                  sizes="(min-width: 768px) 180px, 45vw"
                />
                {index === 0 && (
                  <StatusChip tone="accepted" className="absolute left-2 top-2">
                    {t("hero")}
                  </StatusChip>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={pending || index === 0}
                  aria-label={t("moveUp", { position: index + 1 })}
                  onClick={() => run(() => moveListingPhoto(listingId, photo.id, "up"))}
                >
                  <ArrowUp aria-hidden className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={pending || index === photos.length - 1}
                  aria-label={t("moveDown", { position: index + 1 })}
                  onClick={() => run(() => moveListingPhoto(listingId, photo.id, "down"))}
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
                    run(() => removeListingPhoto(listingId, photo.id));
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
          id="listing-photo-file"
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
          {isFull
            ? t("full", { max: MAX_LISTING_PHOTOS })
            : t("count", { count: photos.length, max: MAX_LISTING_PHOTOS })}
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
