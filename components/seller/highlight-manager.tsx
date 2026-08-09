"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FoodImage } from "@/components/food-image";
import { Input } from "@/components/ui/input";
import {
  assignStoryToHighlight,
  createHighlight,
  deleteHighlight,
  renameHighlight,
} from "@/lib/actions/story-highlights";
import { SELLER_FORM_IDLE, type SellerFormState } from "@/lib/actions/seller-form-state";
import { MAX_HIGHLIGHTS_PER_SELLER, MAX_HIGHLIGHT_TITLE_LENGTH } from "@/lib/story-form";

export interface HighlightRow {
  id: string;
  title: string;
  stories: { id: string; pathThumb: string; blurDataUrl: string }[];
}

/**
 * The Menu shelf manager (architecture Part E2 / Slice 15's own brief:
 * "create/name/assign highlights"). Deliberately the ONLY place a highlight's
 * own existence and name are managed — `<ActiveStoriesList>` handles ASSIGNING
 * a current post to one of these shelves, but a shelf is created, renamed and
 * deleted here.
 *
 * ⚠ Shows EVERY highlight's stories regardless of `expiresAt` — Part E2:
 * "highlighted entries persist on the profile" — a shelf's contents do not
 * age out of this manager just because they aged out of the Fresh Today rail.
 * Un-assigning a story here (the X on each thumbnail) hands it back to
 * `food-sweep`, which — if `expiresAt` is already in the past, very likely
 * for an old shelf item — removes it on its very next pass.
 */
export function HighlightManager({ highlights }: { highlights: HighlightRow[] }) {
  const t = useTranslations("seller.stories.shelf");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newTitle, setNewTitle] = useState("");
  const [createState, setCreateState] = useState<SellerFormState>(SELLER_FORM_IDLE);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("title", newTitle);
    startTransition(async () => {
      const result = await createHighlight(SELLER_FORM_IDLE, formData);
      setCreateState(result);
      if (result.status === "ok") {
        setNewTitle("");
        router.refresh();
      }
    });
  }

  function submitRename(highlightId: string) {
    const formData = new FormData();
    formData.set("title", renameDraft);
    run(async () => {
      await renameHighlight(highlightId, SELLER_FORM_IDLE, formData);
      setRenamingId(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {highlights.length === 0 ? (
        <p className="text-label text-ink">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {highlights.map((highlight) => (
            <li key={highlight.id} className="rounded-card border border-hairline bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                {renamingId === highlight.id ? (
                  <>
                    <Input
                      value={renameDraft}
                      maxLength={MAX_HIGHLIGHT_TITLE_LENGTH}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      className="max-w-xs"
                      autoFocus
                    />
                    <Button type="button" size="sm" disabled={pending} onClick={() => submitRename(highlight.id)}>
                      {t("saveTitle")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRenamingId(null)}>
                      {t("cancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 className="font-display text-h3 font-semibold text-ink">{highlight.title}</h3>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRenamingId(highlight.id);
                        setRenameDraft(highlight.title);
                      }}
                    >
                      {t("rename")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      className="ml-auto text-error hover:bg-error/10"
                      onClick={() => {
                        if (!window.confirm(t("deleteConfirm"))) return;
                        run(() => deleteHighlight(highlight.id));
                      }}
                    >
                      <Trash2 aria-hidden className="size-4" />
                      {t("delete")}
                    </Button>
                  </>
                )}
              </div>

              {highlight.stories.length === 0 ? (
                <p className="mt-3 text-caption text-ink">{t("shelfEmpty")}</p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-3">
                  {highlight.stories.map((story) => (
                    <li key={story.id} className="relative w-20">
                      <FoodImage
                        src={story.pathThumb}
                        alt=""
                        aspect="thumb"
                        blurDataUrl={story.blurDataUrl}
                        sizes="80px"
                        surface="seller"
                      />
                      <button
                        type="button"
                        disabled={pending}
                        aria-label={t("unassign")}
                        onClick={() => run(() => assignStoryToHighlight(story.id, null))}
                        className="tap-target absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-pill bg-card text-ink shadow-soft"
                      >
                        <X aria-hidden className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {highlights.length < MAX_HIGHLIGHTS_PER_SELLER && (
        <form onSubmit={submitCreate} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="new-highlight-title" className="text-label font-medium text-ink">
              {t("newTitleLabel")}
            </label>
            <Input
              id="new-highlight-title"
              value={newTitle}
              maxLength={MAX_HIGHLIGHT_TITLE_LENGTH}
              placeholder={t("newTitlePlaceholder")}
              onChange={(e) => setNewTitle(e.target.value)}
              className="max-w-xs"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={pending || !newTitle.trim()}>
            <Plus aria-hidden className="size-4" />
            {t("newShelf")}
          </Button>
        </form>
      )}
      {createState.status === "error" && (
        <p role="alert" className="text-label text-error">
          {t(`errors.${createState.error}`)}
        </p>
      )}
    </div>
  );
}
