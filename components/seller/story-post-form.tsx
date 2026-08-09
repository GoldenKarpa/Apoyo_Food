"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FoodImage } from "@/components/food-image";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createStory } from "@/lib/actions/create-story";
import { SELLER_FORM_IDLE, type SellerFormState } from "@/lib/actions/seller-form-state";
import type { SellerUploadErrorKey } from "@/components/seller/upload";
import { MAX_CAPTION_LENGTH } from "@/lib/story-form";
import { mediaUploadUrl } from "@/lib/media-url";

export interface StoryListingOption {
  id: string;
  title: string;
}

/**
 * The post flow — architecture Part E2: "photo -> optional caption ->
 * optional linked listing -> post", "≤3 taps". Two taps cover the minimum
 * path: pick a photo (which uploads immediately, mirroring every other photo
 * field in this app — Slice 13's `<PhotoField>`), then tap Post. Caption and
 * linked listing are additional, optional interactions, not additional taps
 * in the sense Part E2 is counting.
 *
 * ⚠ The photo uploads to the generic media route (`kind: "story"`), NOT a
 * story-specific one — Slice 4's own comment reserved that generic route
 * for exactly this shape: an entity whose photo has to exist before the
 * entity does, so there is nothing yet to scope an ownership check against.
 * `createStory` re-validates the returned keys before writing them anywhere
 * (`lib/story-form.ts`'s `isStoryStorageKey`) — the upload alone proves
 * nothing about ownership of the FINAL post, only that a signed-in user
 * produced these bytes. This form only ever renders on the seller surface, so
 * the upload always targets `mediaUploadUrl("seller")` (ecosystem ruling E14)
 * — see `lib/media-url.ts`.
 */
export function StoryPostForm({ listings }: { listings: StoryListingOption[] }) {
  const t = useTranslations("seller.stories.post");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<SellerUploadErrorKey | null>(null);
  const [photo, setPhoto] = useState<{ pathThumb: string; pathCard: string; pathFull: string; blurDataUrl: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [linkedListingId, setLinkedListingId] = useState("");
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<SellerFormState>(SELLER_FORM_IDLE);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadError(null);
    setUploading(true);

    const body = new FormData();
    body.set("kind", "story");
    body.set("file", file);
    let response: Response;
    try {
      response = await fetch(mediaUploadUrl("seller"), { method: "POST", body });
    } catch {
      setUploading(false);
      setUploadError("failed");
      return;
    }
    setUploading(false);
    if (!response.ok) {
      setUploadError(
        response.status === 401
          ? "unauthorized"
          : response.status === 413
            ? "tooLarge"
            : response.status === 429
              ? "rateLimited"
              : "invalid",
      );
      return;
    }
    setPhoto(await response.json());
  }

  function reset() {
    setPhoto(null);
    setCaption("");
    setLinkedListingId("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo) return;
    const formData = new FormData();
    formData.set("pathThumb", photo.pathThumb);
    formData.set("pathCard", photo.pathCard);
    formData.set("pathFull", photo.pathFull);
    formData.set("blurDataUrl", photo.blurDataUrl);
    formData.set("caption", caption);
    formData.set("linkedListingId", linkedListingId);

    startTransition(async () => {
      const result = await createStory(SELLER_FORM_IDLE, formData);
      setState(result);
      if (result.status === "ok") {
        reset();
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-card border border-hairline bg-card p-6">
      <h2 className="font-display text-h2 font-semibold text-ink">{t("title")}</h2>

      {photo ? (
        <div className="flex items-start gap-4">
          <FoodImage
            src={photo.pathCard}
            alt=""
            aspect="story"
            blurDataUrl={photo.blurDataUrl}
            sizes="120px"
            className="w-28 shrink-0"
            surface="seller"
          />
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            {t("changePhoto")}
          </Button>
        </div>
      ) : (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPick}
            className="sr-only"
            id="story-photo-file"
          />
          <Button type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <ImagePlus aria-hidden className="size-4" />
            {uploading ? t("uploading") : t("choosePhoto")}
          </Button>
          {uploadError && (
            <p role="alert" className="mt-2 text-label text-error">
              {t(`uploadErrors.${uploadError}`)}
            </p>
          )}
        </div>
      )}

      {photo && (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="story-caption" className="text-label font-medium text-ink">
              {t("captionLabel")}
            </label>
            <Textarea
              id="story-caption"
              value={caption}
              maxLength={MAX_CAPTION_LENGTH}
              placeholder={t("captionPlaceholder")}
              onChange={(e) => setCaption(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          {listings.length > 0 && (
            <div className="flex flex-col gap-2">
              <label htmlFor="story-listing" className="text-label font-medium text-ink">
                {t("linkedListingLabel")}
              </label>
              <Select
                id="story-listing"
                value={linkedListingId}
                onChange={(e) => setLinkedListingId(e.target.value)}
                className="max-w-xs"
              >
                <option value="">{t("linkedListingNone")}</option>
                {listings.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.title}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {state.status === "error" && (
            <p role="alert" className="text-label text-error">
              {t(`errors.${state.error}`)}
            </p>
          )}

          <div>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? t("posting") : t("post")}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
