"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CategoryChip, Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleList } from "@/components/seller/toggle-list";
import { DIETARY_TAGS } from "@/lib/browse";
import { KNOWN_OCCASION_TAGS } from "@/lib/occasion-tags";
import {
  centsToTtdInput,
  LISTING_KINDS,
  MAX_INGREDIENT_TAG_LENGTH,
  MAX_INGREDIENT_TAGS,
  MAX_LISTING_CATEGORIES,
  MAX_OCCASION_TAG_LENGTH,
  MAX_TITLE_LENGTH,
  MIN_TITLE_LENGTH,
  PRICE_MODES,
} from "@/lib/listing-form";
import { upsertListing } from "@/lib/actions/upsert-listing";
import { SELLER_FORM_IDLE, type SellerFormState } from "@/lib/actions/seller-form-state";

export interface CategoryOption {
  id: string;
  nameEn: string;
  nameEs: string;
  seasonal: boolean;
  slug: string;
}

export interface ListingFormInitial {
  id: string;
  title: string;
  description: string;
  kind: string;
  priceMode: string;
  priceCents: number | null;
  feedsCount: number | null;
  dietaryTags: string[];
  ingredientTags: string[];
  occasionTag: string | null;
  categoryIds: string[];
}

/**
 * The listing editor's main form — one atomic Server Action for both create
 * and edit, distinguished by whether `initial` is passed (Slice 14's own
 * decision: the brief describes this as a single form, not a resumable wizard
 * like Slice 13's onboarding — a dish has no reason to be built one field at a
 * time).
 *
 * ⚠ NOT built on `<FieldForm>`. Create and edit need genuinely different
 * post-submit behaviour: create redirects to the new listing's edit page
 * (where photos and availability windows can be attached — both need an
 * existing listing id); edit shows the same inline "Saved" confirmation
 * `<FieldForm>` already encodes. Rather than teach `<FieldForm>` a redirect
 * mode it doesn't otherwise need, this is a bespoke component, mirroring the
 * `<OnboardForm>`/`<AvailabilityWindowForm>` precedent for forms whose
 * post-submit UX doesn't match the edit-in-place shape.
 *
 * `active` is deliberately absent — see `lib/actions/upsert-listing.ts`'s own
 * note: it is a seller-facing pause switch rendered independently on the edit
 * page, not bundled into this save.
 */
export function ListingForm({
  categories,
  initial,
}: {
  categories: CategoryOption[];
  initial?: ListingFormInitial;
}) {
  const t = useTranslations("seller.listingForm");
  const td = useTranslations("filters.dietaryTags");
  const to = useTranslations("occasionTags");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<SellerFormState>(SELLER_FORM_IDLE);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [kind, setKind] = useState(initial?.kind ?? LISTING_KINDS[0]);
  const [priceMode, setPriceMode] = useState(initial?.priceMode ?? PRICE_MODES[0]);
  const [price, setPrice] = useState(initial?.priceCents != null ? centsToTtdInput(initial.priceCents) : "");
  const [feedsCount, setFeedsCount] = useState(initial?.feedsCount != null ? String(initial.feedsCount) : "");
  const [categoryIds, setCategoryIds] = useState<string[]>(initial?.categoryIds ?? []);
  const [dietaryTags, setDietaryTags] = useState<string[]>(initial?.dietaryTags ?? []);
  const [ingredientTags, setIngredientTags] = useState<string[]>(initial?.ingredientTags ?? []);
  const [ingredientDraft, setIngredientDraft] = useState("");
  const [occasionTag, setOccasionTag] = useState(initial?.occasionTag ?? "");

  const categoriesFull = categoryIds.length >= MAX_LISTING_CATEGORIES;
  const ingredientsFull = ingredientTags.length >= MAX_INGREDIENT_TAGS;

  function toggleCategory(id: string) {
    setCategoryIds((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : categoriesFull ? current : [...current, id],
    );
  }

  function addIngredient() {
    const value = ingredientDraft.trim().slice(0, MAX_INGREDIENT_TAG_LENGTH);
    if (!value || ingredientsFull) return;
    if (ingredientTags.some((tag) => tag.toLowerCase() === value.toLowerCase())) {
      setIngredientDraft("");
      return;
    }
    setIngredientTags((current) => [...current, value]);
    setIngredientDraft("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    if (initial) formData.set("id", initial.id);
    formData.set("title", title);
    formData.set("description", description);
    formData.set("kind", kind);
    formData.set("priceMode", priceMode);
    formData.set("price", price);
    formData.set("feedsCount", feedsCount);
    formData.set("occasionTag", occasionTag);
    for (const id of categoryIds) formData.append("categoryIds", id);
    for (const tag of dietaryTags) formData.append("dietaryTags", tag);
    for (const tag of ingredientTags) formData.append("ingredientTags", tag);

    startTransition(async () => {
      const result = await upsertListing(SELLER_FORM_IDLE, formData);
      setState(result);
      if (result.status === "ok") {
        if (!initial && result.listingId) {
          router.push(`/food/listings/${result.listingId}`);
        } else {
          router.refresh();
        }
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="listing-title">{t("titleLabel")}</Label>
        <Input
          id="listing-title"
          value={title}
          required
          minLength={MIN_TITLE_LENGTH}
          maxLength={MAX_TITLE_LENGTH}
          placeholder={t("titlePlaceholder")}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="listing-description">{t("descriptionLabel")}</Label>
        <Textarea
          id="listing-description"
          value={description}
          required
          maxLength={2000}
          placeholder={t("descriptionPlaceholder")}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="listing-kind">{t("kindLabel")}</Label>
          <Select id="listing-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="max-w-xs">
            {LISTING_KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`kind.${value}`)}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="listing-price-mode">{t("priceModeLabel")}</Label>
          <Select
            id="listing-price-mode"
            value={priceMode}
            onChange={(e) => setPriceMode(e.target.value)}
            className="max-w-xs"
          >
            {PRICE_MODES.map((value) => (
              <option key={value} value={value}>
                {t(`priceMode.${value}`)}
              </option>
            ))}
          </Select>
        </div>

        {priceMode === "QUOTE" ? (
          <p className="self-end pb-2 text-caption text-ink">{t("priceModeQuoteHint")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="listing-price">{t("priceLabel")}</Label>
            <div className="flex items-center gap-2">
              <span className="text-body text-ink">$</span>
              <Input
                id="listing-price"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="max-w-[140px]"
              />
              <span className="text-caption text-ink">TTD</span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="listing-feeds">{t("feedsLabel")}</Label>
          <Input
            id="listing-feeds"
            type="number"
            min={1}
            inputMode="numeric"
            value={feedsCount}
            onChange={(e) => setFeedsCount(e.target.value)}
            className="max-w-[100px]"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t("categoriesLabel")}</Label>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              category={category}
              label={locale === "es" ? category.nameEs : category.nameEn}
              selected={categoryIds.includes(category.id)}
              onClick={() => toggleCategory(category.id)}
            />
          ))}
        </div>
        <p className="text-caption text-ink">
          {t("categoriesCount", { count: categoryIds.length, max: MAX_LISTING_CATEGORIES })}
        </p>
      </div>

      <ToggleList
        legend={t("dietaryLabel")}
        options={DIETARY_TAGS.map((tag) => ({ value: tag, label: td(tag) }))}
        selected={dietaryTags}
        onToggle={(value) =>
          setDietaryTags((current) =>
            current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
          )
        }
      />

      <div className="flex flex-col gap-3">
        <Label htmlFor="listing-ingredient">{t("ingredientTagsLabel")}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="listing-ingredient"
            value={ingredientDraft}
            maxLength={MAX_INGREDIENT_TAG_LENGTH}
            disabled={ingredientsFull}
            placeholder={t("ingredientTagsPlaceholder")}
            onChange={(e) => setIngredientDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addIngredient();
              }
            }}
            className="max-w-xs"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={addIngredient}
            disabled={ingredientsFull || !ingredientDraft.trim()}
          >
            <Plus aria-hidden className="size-4" />
            {t("ingredientTagsAdd")}
          </Button>
        </div>
        {ingredientTags.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {ingredientTags.map((tag) => (
              <li key={tag}>
                <Chip asChild variant="outline">
                  <button
                    type="button"
                    onClick={() => setIngredientTags((current) => current.filter((existing) => existing !== tag))}
                    aria-label={t("ingredientTagsRemove", { name: tag })}
                    className="inline-flex items-center gap-1.5"
                  >
                    {tag}
                    <X aria-hidden className="size-3.5" />
                  </button>
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="listing-occasion">{t("occasionLabel")}</Label>
        <Input
          id="listing-occasion"
          list="listing-occasion-suggestions"
          value={occasionTag}
          maxLength={MAX_OCCASION_TAG_LENGTH}
          placeholder={t("occasionPlaceholder")}
          onChange={(e) => setOccasionTag(e.target.value)}
          className="max-w-xs"
        />
        <datalist id="listing-occasion-suggestions">
          {KNOWN_OCCASION_TAGS.map((tag) => (
            <option key={tag} value={tag}>
              {to(tag)}
            </option>
          ))}
        </datalist>
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-label text-error">
          {t(`errors.${state.error}`)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t("saving") : initial ? t("save") : t("create")}
        </Button>
        {initial && state.status === "ok" && !pending && (
          <span className="text-label text-green">{t("saved")}</span>
        )}
      </div>
    </form>
  );
}
