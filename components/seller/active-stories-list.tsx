"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FoodImage } from "@/components/food-image";
import { Select } from "@/components/ui/select";
import { deleteStory } from "@/lib/actions/create-story";
import { assignStoryToHighlight } from "@/lib/actions/story-highlights";

export interface ActiveStoryRow {
  id: string;
  pathThumb: string;
  blurDataUrl: string;
  caption: string | null;
  expiresAt: string; // ISO — serialized across the server/client boundary
  highlightId: string | null;
  linkedListing: { title: string; slug: string } | null;
  viewCount: number;
}

export interface HighlightOption {
  id: string;
  title: string;
}

/**
 * `/food/stories`'s "Active now" list — everything currently driving the
 * Fresh Today rail, whether or not it is ALSO on the Menu shelf. This is
 * where "assign" (the brief's third verb for the shelf manager) actually
 * happens; the Menu shelf section itself (`<HighlightManager>`) is where a
 * shelf's own name/existence is managed and where an ALREADY-EXPIRED
 * highlighted story can still be found and unassigned.
 *
 * ⚠ View counts are `FoodStoryView` rows — authenticated unique viewers, not
 * total impressions. `FoodDemandEvent` (which DOES fire for anonymous
 * viewers too, Part E7's aggregate reach signal) carries no `storyId` column
 * at all, so a per-post anonymous count genuinely cannot be computed; only
 * the aggregate, Phase-6 "Fresh Today reach" number can ever include them.
 */
export function ActiveStoriesList({
  stories,
  highlights,
}: {
  stories: ActiveStoryRow[];
  highlights: HighlightOption[];
}) {
  const t = useTranslations("seller.stories.active");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove(storyId: string) {
    if (!window.confirm(t("removeConfirm"))) return;
    startTransition(async () => {
      await deleteStory(storyId);
      router.refresh();
    });
  }

  function assign(storyId: string, highlightId: string) {
    startTransition(async () => {
      await assignStoryToHighlight(storyId, highlightId || null);
      router.refresh();
    });
  }

  if (stories.length === 0) {
    return <p className="text-label text-ink">{t("empty")}</p>;
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stories.map((story) => {
        const hoursLeft = Math.max(0, Math.round((new Date(story.expiresAt).getTime() - Date.now()) / 3_600_000));
        return (
          <li key={story.id} className="flex flex-col gap-2 rounded-card border border-hairline bg-card p-3">
            <FoodImage src={story.pathThumb} alt="" aspect="story" blurDataUrl={story.blurDataUrl} sizes="200px" />
            {story.caption && <p className="line-clamp-2 text-label text-ink">{story.caption}</p>}
            {story.linkedListing && (
              <p className="text-caption text-ink-muted">{t("linkedTo", { title: story.linkedListing.title })}</p>
            )}
            <p className="text-caption text-ink">
              {t("expiresIn", { hours: hoursLeft })} · {t("viewCount", { count: story.viewCount })}
            </p>

            <label className="flex flex-col gap-1 text-caption text-ink">
              {t("assignLabel")}
              <Select
                value={story.highlightId ?? ""}
                disabled={pending}
                onChange={(e) => assign(story.id, e.target.value)}
              >
                <option value="">{t("assignNone")}</option>
                {highlights.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.title}
                  </option>
                ))}
              </Select>
            </label>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              className="self-start text-error hover:bg-error/10"
              onClick={() => remove(story.id)}
            >
              <Trash2 aria-hidden className="size-4" />
              {t("remove")}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
