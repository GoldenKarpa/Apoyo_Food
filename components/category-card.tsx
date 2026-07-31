import * as React from "react";
import Link from "next/link";

import { FoodImage } from "@/components/food-image";
import type { MealCardPhoto } from "@/components/meal-card";
import { ACCENT_CLASSES, categoryAccent } from "@/lib/category-accent";
import { cn } from "@/lib/utils";

/**
 * `<CategoryCard>` — the "Browse by category" home section (architecture Part
 * E1, section 3: "category cards with hero imagery") and the entry points to
 * `/categories/[slug]`.
 *
 * ── Why the label sits below the image, not on it ──
 * The obvious design is a title overlaid on the hero photo. It is also the one
 * composition whose contrast cannot be guaranteed: the background is a
 * *photograph*, chosen by whoever seeded or uploaded it, so no measurement taken
 * today constrains what a future image does to the label. Apparel reached the
 * same conclusion about pills on seller photos in its own Slice 7. The label
 * goes on an opaque accent band beneath the image, which is measurable and
 * stays measured — `card`-cream on the four text-safe accents is 5.44–5.72:1.
 *
 * That band is also where the Part F3 category→accent family shows up (savory
 * green · desserts gold · drinks teal · seasonal terracotta), resolved through
 * `lib/category-accent.ts` so every surface tints a category identically.
 */
export interface CategoryCardProps {
  href: string;
  /** Localized category name (`nameEn` / `nameEs` — Part D stores both). */
  name: string;
  /** The row itself, so `seasonal` can override the slug table. */
  category: { slug: string; seasonal?: boolean };
  hero?: MealCardPhoto | null;
  /** Localized "N meals" count line. Omitted when a count isn't known yet. */
  countLabel?: string;
  sizes?: string;
  className?: string;
}

export function CategoryCard({
  href,
  name,
  category,
  hero,
  countLabel,
  sizes = "(min-width: 768px) 25vw, 45vw",
  className,
}: CategoryCardProps) {
  const accent = ACCENT_CLASSES[categoryAccent(category)];

  return (
    <Link
      href={href}
      className={cn(
        "group flex animate-card-in flex-col overflow-hidden rounded-card border border-hairline bg-card shadow-soft",
        "transition-[transform,box-shadow] duration-200 ease-soft md:hover:-translate-y-0.5",
        className,
      )}
    >
      {hero ? (
        <FoodImage
          src={hero.src}
          alt=""
          aspect="cover"
          blurDataUrl={hero.blurDataUrl}
          sizes={sizes}
          className="rounded-none"
        />
      ) : (
        <div aria-hidden className={cn("aspect-cover w-full", accent.soft)} />
      )}

      <div className={cn("flex flex-col gap-0.5 px-4 py-3", accent.fill)}>
        <h3 className="font-display text-h2 font-semibold">{name}</h3>
        {countLabel && (
          // Inherits the band's `card`-cream from the accent fill — deliberately
          // not `ink-muted`, which has no measured pairing against any accent.
          <p className="text-caption opacity-90">{countLabel}</p>
        )}
      </div>
    </Link>
  );
}
