import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CategoryCard } from "@/components/category-card";
import { ComingSoon, ComingSoonBadge } from "@/components/coming-soon";
import { FreshTodayCard } from "@/components/fresh-today-card";
import { MealCard, type MealCardPhoto } from "@/components/meal-card";
import { SellerCard } from "@/components/seller-card";
import { AvailabilityStamp } from "@/components/ui/availability-stamp";
import { Button } from "@/components/ui/button";
import { CategoryChip, Chip, StatusChip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Rail } from "@/components/ui/rail";
import { SectionHeader } from "@/components/ui/section-header";
import {
  FreshTodayCardSkeleton,
  MealCardSkeleton,
  SellerCardSkeleton,
} from "@/components/ui/skeleton";
import { TranslatedText } from "@/components/ui/translated-text";
import { COMING_SOON_KEYS } from "@/lib/coming-soon";
import type { PhotoVariantPaths } from "@/lib/media/ingest";
import { FilterDemo } from "./filter-demo";
import { getSampleMedia } from "./sample-media";

/**
 * The Sobremesa component gallery.
 *
 * Every primitive from Slice 7 in one place, which is what makes this slice's
 * done-when — "a component-gallery test page renders every component above
 * against seed-free dummy data, visually matching the Sobremesa spec's corrected
 * palette; `<ComingSoon>` opens and closes correctly with localized copy" —
 * checkable by measurement rather than by opinion. `scripts/verify-a11y.mjs`
 * drives exactly this page, at two widths, in both locales, reading contrast off
 * the rendered DOM.
 *
 * It also replaces Slice 1's `components/scaffold/token-proof.tsx`, which
 * existed for the same reason but proved *tokens*; a token being correct says
 * nothing about what a component composited on screen, which is precisely the
 * class of bug that shipped for six slices in Apparel.
 *
 * **Deliberately unlinked from any navigation.** It is a build tool, not a
 * storefront page, and Phase 1's whole point is that the buyer surface is the
 * demo's face. `robots: noindex`.
 */

export const metadata: Metadata = {
  title: "Sobremesa components",
  robots: { index: false, follow: false },
};

/** The pipeline returns four columns; the cards want key + placeholder. */
function photo(entry: PhotoVariantPaths | undefined): MealCardPhoto | null {
  if (!entry) return null;
  return { src: entry.pathCard, blurDataUrl: entry.blurDataUrl };
}

const PALETTE: { token: string; hex: string; className: string; ink: string }[] = [
  { token: "cream-bg", hex: "#F4EEE1", className: "bg-cream-bg", ink: "text-ink" },
  { token: "card", hex: "#FCF8EF", className: "bg-card", ink: "text-ink" },
  { token: "sunken", hex: "#EBE3D3", className: "bg-sunken", ink: "text-ink" },
  { token: "hairline", hex: "#E2D8C4", className: "bg-hairline", ink: "text-ink" },
  { token: "green", hex: "#536D46", className: "bg-green", ink: "text-card" },
  { token: "teal", hex: "#3D6D68", className: "bg-teal", ink: "text-card" },
  { token: "gold", hex: "#895C1A", className: "bg-gold", ink: "text-card" },
  { token: "terracotta", hex: "#9A4C36", className: "bg-terracotta", ink: "text-card" },
  { token: "error", hex: "#A54A3A", className: "bg-error", ink: "text-card" },
  { token: "gold-vivid", hex: "#DDA24A", className: "bg-gold-vivid", ink: "text-ink" },
  { token: "green-soft", hex: "#E4EADC", className: "bg-green-soft", ink: "text-ink" },
  { token: "teal-soft", hex: "#DCE8E5", className: "bg-teal-soft", ink: "text-ink" },
  { token: "gold-soft", hex: "#F5E6C9", className: "bg-gold-soft", ink: "text-ink" },
  { token: "terracotta-soft", hex: "#F0DAD1", className: "bg-terracotta-soft", ink: "text-ink" },
];

const TYPE_SCALE: { token: string; spec: string; className: string }[] = [
  { token: "display", spec: "28/34", className: "font-display text-display font-semibold" },
  { token: "h1", spec: "22/28", className: "font-display text-h1 font-semibold" },
  { token: "h2", spec: "18/24", className: "font-display text-h2 font-semibold" },
  { token: "body", spec: "16/24", className: "text-body" },
  { token: "label", spec: "14/20", className: "text-label" },
  { token: "caption", spec: "12/16", className: "text-caption" },
];

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-hairline pt-8">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-h1 font-semibold text-ink">{title}</h2>
        {note && <p className="max-w-3xl text-label text-ink-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function StyleGuidePage() {
  const [t, s, n, x, ta, tp, media] = await Promise.all([
    getTranslations("styleGuide"),
    getTranslations("styleGuide.sections"),
    getTranslations("styleGuide.notes"),
    getTranslations("styleGuide.samples"),
    getTranslations("availability"),
    getTranslations("price"),
    getSampleMedia(),
  ]);

  const meals = media?.meals ?? [];
  const stories = media?.stories ?? [];
  const categories = media?.categories ?? [];
  const seller = { cover: photo(media?.covers[0]), avatar: photo(media?.avatars[0]) };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex max-w-3xl flex-col gap-2">
        <h1 className="font-display text-display font-semibold text-ink">{t("title")}</h1>
        <p className="text-body text-ink-muted">{t("intro")}</p>
      </header>

      <Section title={s("comingSoon")} note={n("everyStub")}>
        <div className="flex flex-wrap gap-3">
          {COMING_SOON_KEYS.map((key) => (
            <ComingSoon key={key} feature={key} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ComingSoon feature="requestOrder" variant="primary" badge />
          <ComingSoonBadge />
        </div>
      </Section>

      <Section title={s("buttons")}>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">{ta("today")}</Button>
          <Button variant="secondary">{ta("today")}</Button>
          <Button variant="outline">{ta("today")}</Button>
          <Button variant="ghost">{ta("today")}</Button>
          <Button variant="destructive">{ta("today")}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg">lg</Button>
          <Button size="md">md</Button>
          <Button size="sm">sm</Button>
          <Button disabled>disabled</Button>
        </div>
      </Section>

      <Section title={s("chips")}>
        <div className="flex flex-wrap items-center gap-2">
          <Chip variant="neutral">{x("areaOne")}</Chip>
          <Chip variant="outline">{x("specialtyOne")}</Chip>
          <Chip variant="selected">{x("specialtyTwo")}</Chip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip asStatic category="dinner" label={x("categoryOne")} />
          <CategoryChip asStatic category="desserts" label={x("categoryTwo")} />
          <CategoryChip asStatic category="juices-smoothies" label={x("categoryThree")} />
          <CategoryChip asStatic category="holiday-specials" label={x("categoryFour")} />
          <CategoryChip asStatic selected category="desserts" label={x("categoryTwo")} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="pending">Pendiente</StatusChip>
          <StatusChip tone="accepted">Aceptado</StatusChip>
          <StatusChip tone="declined">Rechazado</StatusChip>
          <StatusChip tone="completed">Completado</StatusChip>
        </div>
      </Section>

      <Section title={s("availability")} note={n("availability")}>
        <div className="flex flex-wrap items-center gap-2">
          <AvailabilityStamp tone="available">{ta("today")}</AvailabilityStamp>
          <AvailabilityStamp tone="recurring">{ta("weekend")}</AvailabilityStamp>
          <AvailabilityStamp tone="preorder">{ta("preorder")}</AvailabilityStamp>
          <AvailabilityStamp tone="seasonal">{ta("holidays")}</AvailabilityStamp>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AvailabilityStamp size="lg" tone="recurring">
            {ta("weekend")}
          </AvailabilityStamp>
          <AvailabilityStamp size="lg" tone="preorder">
            {ta("preorder")}
          </AvailabilityStamp>
          <AvailabilityStamp size="lg" tone="seasonal">
            {ta("holidays")}
          </AvailabilityStamp>
        </div>
      </Section>

      <Section title={s("mealCards")} note={n("media")}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MealCard
            href="/style-guide"
            title={x("mealOne")}
            priceCents={12000}
            priceMode="STARTING_AT"
            startingAtLabel={tp("startingAt")}
            photo={photo(meals[0])}
            availability={{ tone: "recurring", label: ta("weekend") }}
            seller={{ name: x("sellerName"), avatar: photo(media?.avatars[0]) }}
            priority
          />
          <MealCard
            href="/style-guide"
            title={x("mealTwo")}
            priceCents={15000}
            priceMode="FIXED"
            photo={photo(meals[1])}
            availability={{ tone: "preorder", label: ta("preorder") }}
            seller={{ name: x("sellerName"), avatar: photo(media?.avatars[1]) }}
          />
          <MealCard
            href="/style-guide"
            title={x("mealThree")}
            priceCents={2500}
            priceMode="FIXED"
            photo={photo(meals[2])}
            availability={{ tone: "available", label: ta("today") }}
          />
          {/* QUOTE pricing and no photo — both are real states, and both are
              specimens: a quote listing must never render "$0 TTD", and a
              photoless card must hold the grid rather than collapse. */}
          <MealCard
            href="/style-guide"
            title={x("mealFour")}
            priceCents={null}
            priceMode="QUOTE"
            quoteLabel={tp("onRequest")}
            availability={{ tone: "seasonal", label: ta("holidays") }}
            seller={{ name: x("sellerName") }}
          />
        </div>
      </Section>

      <Section title={s("freshToday")} note={`${n("freshToday")} ${n("rail")}`}>
        <Rail label={s("freshToday")}>
          {[0, 1, 2, 3].map((i) => (
            <FreshTodayCard
              key={i}
              href="/style-guide"
              sellerName={x("sellerName")}
              photo={photo(stories[i])}
              windowLabel={i === 0 ? "9:00–15:00" : i === 1 ? ta("today") : ta("preorder")}
              seen={i > 1}
              freshLabel={x("freshDot")}
            />
          ))}
        </Rail>
      </Section>

      <Section title={s("sellerCards")}>
        <div className="grid gap-4 md:grid-cols-2">
          <SellerCard
            href="/style-guide"
            name={x("sellerName")}
            cover={seller.cover}
            avatar={seller.avatar}
            areas={[x("areaOne"), x("areaTwo")]}
            specialties={[x("specialtyOne"), x("specialtyTwo")]}
            followerLabel={x("sellerFollowers")}
            verified
            verifiedLabel={x("verified")}
            hasFreshToday
            freshTodayLabel={x("freshDot")}
          />
          <SellerCard
            href="/style-guide"
            name={x("sellerName")}
            cover={photo(media?.covers[1])}
            avatar={photo(media?.avatars[1])}
            areas={[x("areaTwo")]}
            followerLabel={x("sellerFollowers")}
          />
        </div>
      </Section>

      <Section title={s("categoryCards")}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <CategoryCard
            href="/style-guide"
            name={x("categoryOne")}
            category={{ slug: "dinner" }}
            hero={photo(categories[0])}
            countLabel={x("categoryCount")}
          />
          <CategoryCard
            href="/style-guide"
            name={x("categoryTwo")}
            category={{ slug: "desserts" }}
            hero={photo(categories[1])}
            countLabel={x("categoryCount")}
          />
          <CategoryCard
            href="/style-guide"
            name={x("categoryThree")}
            category={{ slug: "juices-smoothies" }}
            hero={photo(categories[2])}
            countLabel={x("categoryCount")}
          />
          <CategoryCard
            href="/style-guide"
            name={x("categoryFour")}
            category={{ slug: "holiday-specials", seasonal: true }}
            hero={photo(categories[3])}
            countLabel={x("categoryCount")}
          />
        </div>
      </Section>

      <Section title={s("sectionHeaders")}>
        <div className="flex flex-col gap-6">
          <SectionHeader
            title={x("sectionTitle")}
            note={x("sectionNote")}
            action={{ href: "/browse", label: x("seeAll") }}
          />
          {/* The handwritten accent — Part F3 allows it for section labels only,
              1–2 per screen. `<SectionHeader script>` is the only door to it. */}
          <SectionHeader title="En la cocina hoy" script />
        </div>
      </Section>

      <Section title={s("skeletons")} note={n("skeletons")}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MealCardSkeleton />
          <MealCardSkeleton />
          <SellerCardSkeleton />
          <div className="flex gap-3">
            <FreshTodayCardSkeleton />
          </div>
        </div>
      </Section>

      <Section title={s("filterSheet")}>
        <FilterDemo />
        <div className="flex max-w-md flex-col gap-1.5">
          <Label htmlFor="sg-search">{x("seeAll")}</Label>
          <Input id="sg-search" placeholder={x("mealOne")} />
        </div>
      </Section>

      <Section title={s("translated")}>
        <div className="max-w-2xl rounded-card bg-green-soft p-4">
          <TranslatedText
            text={x("translated")}
            original={x("original")}
            isTranslated
          />
        </div>
      </Section>

      <Section title={s("typography")}>
        <div className="flex flex-col gap-2">
          {TYPE_SCALE.map((type) => (
            <div key={type.token} className="flex flex-wrap items-baseline gap-3">
              <span className="w-28 shrink-0 text-caption text-ink-muted">
                {type.token} · {type.spec}
              </span>
              <span className={type.className}>Apoyo Food</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {PALETTE.map((swatch) => (
            <div
              key={swatch.token}
              className={`${swatch.className} ${swatch.ink} rounded-image border border-hairline p-3`}
            >
              <div className="text-caption font-medium">{swatch.token}</div>
              <div className="text-caption">{swatch.hex}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
