/**
 * Category taxonomy seed — architecture Part D's starting set.
 *
 * ⚠ This is NOT the demo seed. Slice 8 builds the curated marketplace fixture
 * (8–12 sellers, 40+ listings, Fresh Today posts, all imagery through the real
 * media pipeline). This file seeds only the reference taxonomy the rest of the
 * app joins against, which is why it is safe and expected to run in production
 * too — unlike Slice 8's data, none of it is throwaway.
 *
 * Idempotent by `slug`: re-running updates names/order in place and never
 * duplicates. Open question 4 leaves Trini-specific additions (Doubles & Street
 * Food? Wild Meat?) to community input, and Slice 16's category manager makes
 * that an admin action — so treat this list as a starting point that the DB, not
 * this file, becomes the authority for once the app is live.
 *
 * Run: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type CategorySeed = {
  slug: string;
  nameEn: string;
  nameEs: string;
  seasonal?: boolean;
  occasionTag?: string;
};

// Order is the display order — `sortOrder` is derived from position below, so
// reordering this array is the only thing needed to reorder the UI.
const CATEGORIES: CategorySeed[] = [
  { slug: "breakfast", nameEn: "Breakfast", nameEs: "Desayuno" },
  { slug: "lunch", nameEn: "Lunch", nameEs: "Almuerzo" },
  { slug: "dinner", nameEn: "Dinner", nameEs: "Cena" },
  { slug: "snacks", nameEn: "Snacks", nameEs: "Meriendas" },
  { slug: "desserts", nameEn: "Desserts", nameEs: "Postres" },
  { slug: "baked-goods", nameEn: "Baked Goods", nameEs: "Panadería y repostería" },
  { slug: "bbq-grill", nameEn: "BBQ & Grill", nameEs: "Parrilla y BBQ" },
  { slug: "drinks", nameEn: "Drinks", nameEs: "Bebidas" },
  { slug: "juices-smoothies", nameEn: "Juices & Smoothies", nameEs: "Jugos y batidos" },
  { slug: "vegetarian-vegan", nameEn: "Vegetarian & Vegan", nameEs: "Vegetariano y vegano" },
  { slug: "catering", nameEn: "Catering", nameEs: "Catering" },
  // The one seasonal category in the starting set. `seasonal` is what lets
  // Part E1's occasion rail auto-show inside a configurable window around each
  // occasion; `occasionTag` is left NULL here because this category spans every
  // holiday rather than naming one — individual LISTINGS carry the specific tag
  // (christmas | mothers_day | easter | divali | eid | carnival | …).
  { slug: "holiday-specials", nameEn: "Holiday Specials", nameEs: "Especiales festivos", seasonal: true },
];

async function main() {
  console.log(`Seeding ${CATEGORIES.length} categories…`);

  for (const [index, category] of CATEGORIES.entries()) {
    const data = {
      nameEn: category.nameEn,
      nameEs: category.nameEs,
      sortOrder: index,
      seasonal: category.seasonal ?? false,
      occasionTag: category.occasionTag ?? null,
    };

    await prisma.foodCategory.upsert({
      where: { slug: category.slug },
      create: { slug: category.slug, ...data },
      update: data,
    });
  }

  const total = await prisma.foodCategory.count();
  console.log(`✔ Category taxonomy seeded — ${total} rows present.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
