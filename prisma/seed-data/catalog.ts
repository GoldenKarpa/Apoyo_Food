/**
 * The curated demo marketplace — architecture Phase 1's fixture.
 *
 * ⚠ **This is throwaway demo data and every row it creates is removable in one
 * command**: every id is prefixed `seed-`, so `npm run db:seed:demo:clear`
 * deletes exactly this and nothing else. No `seed` boolean column was added —
 * Apparel established that deterministic prefixed ids do the same job, are
 * visible at a glance in the database, and cost no migration.
 *
 * ── What is being modelled ──
 * Trinidad & Tobago home cooks: Venezuelan migrant cooks (a real and large part
 * of this market — hence the Spanish-authored listings), Trini bakers and
 * street-food sellers, one Tobago juice bar. Names, dishes, areas and prices are
 * invented but plausible; **prices are whole TTD in cents** and render only
 * through `lib/money.ts`, so the €-denominated mockups cannot leak in.
 *
 * ── Language ──
 * Food's schema deliberately carries **no bilingual columns** on listings or
 * seller bios (Part D; confirmed at Slice 5). A cook authors a dish description
 * once, in their own language, and Part E3 handles cross-language *discovery*
 * with unaccent + trigram matching rather than by storing two copies. So `lang`
 * below records who wrote in what — it is not a translation key, and the seed
 * must not invent an English twin for a Spanish dish.
 *
 * ── Two deliberate traps for later slices ──
 * 1. `mama-lin` is **SUSPENDED and still has `active: true` listings**. Slice 9's
 *    discovery queries must filter on the SELLER's standing, not just the
 *    listing's; a seed where everyone is ACTIVE would let that bug ship.
 * 2. `pastelitos-y-mas` is **PENDING with real listings** — the queue Slice 16
 *    approves, and a second reason discovery must not read `active` alone.
 * `prisma/verify-seed.ts` asserts both traps still exist.
 */

import type {
  AvailabilityType,
  FulfillmentMode,
  ListingKind,
  PriceMode,
  RegionKey,
  SellerStatus,
} from "@prisma/client";

export interface WindowSpec {
  type: AvailabilityType;
  /** RECURRING_WEEKLY only: bit 0 = Sunday … bit 6 = Saturday. */
  daysOfWeek?: number;
  /** PREORDER (and legally any type — Slice 2 loosened this on purpose). */
  leadTimeDays?: number;
  /** DATE_RANGE only, as `YYYY-MM-DD` in America/Port_of_Spain. */
  startsOn?: string;
  endsOn?: string;
  note?: string;
}

/** Day bitmasks, so the specs below read as days rather than as numbers. */
export const DAYS = {
  everyDay: 127,
  weekend: 0b1000001, //         Sun + Sat
  friSatSun: 0b1100001, //       Fri + Sat + Sun
  weekdays: 0b0111110, //        Mon–Fri
  wedThuFri: 0b0111000,
  saturday: 0b1000000,
  sunday: 0b0000001,
} as const;

export interface ListingSpec {
  slug: string;
  title: string;
  description: string;
  lang: "en" | "es";
  kind: ListingKind;
  priceMode: PriceMode;
  /** Whole TTD — converted to integer cents by the seeder. NULL iff QUOTE. */
  priceTtd: number | null;
  feedsCount?: number;
  categories: string[];
  dietaryTags?: string[];
  ingredientTags: string[];
  occasionTag?: string;
  windows: WindowSpec[];
  /** Photo search terms, most specific first (see seed-data/photos.ts). */
  photoTerms: string[];
  /** Force the phone-camera degrade on/off; default is deterministic-random. */
  amateurPhoto?: boolean;
  active?: boolean;
}

export interface SellerSpec {
  slug: string;
  displayName: string;
  bio: string;
  lang: "en" | "es";
  areas: RegionKey[];
  languages: string[];
  specialties: string[];
  status: SellerStatus;
  fulfillmentModes: FulfillmentMode[];
  /** Rough follower target; the seeder writes real rows and recounts. */
  followers: number;
  /** Menu-shelf groups (Part E2). */
  highlights?: string[];
  /** Fresh Today entries: caption + photo terms. */
  freshToday?: { caption: string; terms: string[]; linkTo?: string }[];
  listings: ListingSpec[];
}

export const SELLERS: SellerSpec[] = [
  // ───────────────────────────────────────────────────────────── south west
  {
    slug: "cocina-de-abuela",
    displayName: "Cocina de Abuela",
    bio: "Comida venezolana hecha en casa, como la hacía mi abuela en Maracaibo. Pastelón, empanadas y bollos por encargo. Aviso por WhatsApp cuando saco algo del horno.",
    lang: "es",
    areas: ["south_west", "south_central"],
    languages: ["Español", "English"],
    specialties: ["Venezolana", "Casera", "Empanadas"],
    status: "ACTIVE",
    fulfillmentModes: ["PICKUP", "MEETUP"],
    followers: 128,
    highlights: ["Especialidades", "Festivos", "Postres"],
    freshToday: [
      { caption: "Pastelón recién salido del horno 🔥 listo desde las 3", terms: ["lasagne", "beef"], linkTo: "pastelon-de-platano" },
      { caption: "Quedan 6 empanadas de carne", terms: ["empanada", "pie"] },
    ],
    listings: [
      {
        slug: "pastelon-de-platano",
        title: "Pastelón de plátano",
        description:
          "Auténtico pastelón venezolano con capas de plátano maduro, carne molida sazonada y queso derretido. Ideal para compartir en familia. Se hace por encargo con dos días de aviso.",
        lang: "es",
        kind: "SINGLE_ITEM",
        priceMode: "STARTING_AT",
        priceTtd: 120,
        feedsCount: 6,
        categories: ["dinner", "lunch"],
        ingredientTags: ["plátano", "carne molida", "queso", "maíz"],
        windows: [{ type: "PREORDER", leadTimeDays: 2, note: "Pedidos hasta las 4pm del viernes" }],
        photoTerms: ["lasagne", "beef"],
      },
      {
        slug: "empanadas-de-carne-mechada",
        title: "Empanadas de carne mechada",
        description:
          "Empanadas de maíz fritas al momento, rellenas de carne mechada. Se venden por docena. Crujientes por fuera, jugosas por dentro.",
        lang: "es",
        kind: "PACKAGE",
        priceMode: "FIXED",
        priceTtd: 90,
        feedsCount: 4,
        categories: ["snacks", "lunch"],
        ingredientTags: ["maíz", "carne mechada", "harina"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.friSatSun, note: "9:00–15:00" }],
        photoTerms: ["empanada", "pie"],
        amateurPhoto: true,
      },
      {
        slug: "bollos-pelones",
        title: "Bollos pelones",
        description:
          "Bolitas de masa de maíz rellenas de guiso, bañadas en salsa de tomate casera. Un plato de casa que no se consigue en restaurante.",
        lang: "es",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 75,
        feedsCount: 3,
        categories: ["lunch", "dinner"],
        ingredientTags: ["maíz", "guiso", "tomate"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.everyDay, note: "Disponible todos los días" }],
        photoTerms: ["meatball", "beef"],
        amateurPhoto: true,
      },
      {
        slug: "quesillo-venezolano",
        title: "Quesillo venezolano",
        description:
          "Postre de huevo y leche condensada con caramelo, hecho en molde. Se entrega frío y listo para servir.",
        lang: "es",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 110,
        feedsCount: 8,
        categories: ["desserts"],
        dietaryTags: ["vegetarian"],
        ingredientTags: ["huevo", "leche condensada", "caramelo"],
        windows: [{ type: "PREORDER", leadTimeDays: 1 }],
        photoTerms: ["flan", "custard", "dessert"],
      },
      {
        slug: "hallacas-navidenas",
        title: "Hallacas navideñas",
        description:
          "Hallacas hechas en familia durante diciembre, envueltas en hoja de plátano. Por docena, solo en temporada. Se agotan rápido.",
        lang: "es",
        kind: "PACKAGE",
        priceMode: "FIXED",
        priceTtd: 350,
        feedsCount: 12,
        categories: ["holiday-specials", "dinner"],
        ingredientTags: ["maíz", "guiso", "hoja de plátano", "aceitunas"],
        occasionTag: "christmas",
        windows: [
          { type: "DATE_RANGE", startsOn: "-11-15", endsOn: "-12-31", leadTimeDays: 3, note: "Solo en temporada navideña" },
        ],
        photoTerms: ["tamale", "corn"],
      },
    ],
  },

  // ──────────────────────────────────────────────────── east west corridor
  {
    slug: "sweet-hands-bakery",
    displayName: "Sweet Hands Bakery",
    bio: "Home baker in Curepe. Black cake, sponge, sweetbread and birthday cakes to order. Everything baked the day you collect it — nothing sits in a fridge waiting.",
    lang: "en",
    areas: ["east_west_corridor", "north_west"],
    languages: ["English"],
    specialties: ["Baking", "Cakes", "Celebration"],
    status: "ACTIVE",
    fulfillmentModes: ["PICKUP", "SELLER_DELIVERY"],
    followers: 342,
    highlights: ["Birthday cakes", "Christmas", "Everyday"],
    freshToday: [
      { caption: "Sponge cakes cooling now — collection from 2pm", terms: ["sponge", "cake"], linkTo: "vanilla-sponge-cake" },
      { caption: "Testing a new coconut sweetbread 🥥", terms: ["bread", "coconut"] },
    ],
    listings: [
      {
        slug: "trini-black-cake",
        title: "Trini black cake",
        description:
          "Fruit soaked in rum and cherry brandy since last Christmas, baked dark and heavy the way it should be. Not a fruitcake — this is the real thing. Sold by the pound.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "STARTING_AT",
        priceTtd: 180,
        categories: ["desserts", "baked-goods", "holiday-specials"],
        ingredientTags: ["rum", "dried fruit", "cherry brandy", "browning"],
        occasionTag: "christmas",
        windows: [{ type: "PREORDER", leadTimeDays: 3, note: "Three days' notice, longer in December" }],
        photoTerms: ["christmas cake", "fruit cake", "cake"],
      },
      {
        slug: "vanilla-sponge-cake",
        title: "Vanilla sponge cake",
        description:
          "Light vanilla sponge with buttercream. Plain, or write a message on it for no extra charge. Collection only.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 220,
        feedsCount: 10,
        categories: ["desserts", "baked-goods"],
        dietaryTags: ["vegetarian"],
        ingredientTags: ["vanilla", "buttercream", "flour"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.everyDay, leadTimeDays: 1, note: "Order by 6pm the day before" }],
        photoTerms: ["victoria sponge", "sponge", "cake"],
      },
      {
        slug: "coconut-sweetbread",
        title: "Coconut sweetbread",
        description:
          "Dense, sweet, full of grated coconut and mixed peel. One loaf feeds a whole Sunday afternoon. Best warm with butter.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 65,
        feedsCount: 6,
        categories: ["baked-goods", "snacks"],
        dietaryTags: ["vegetarian"],
        ingredientTags: ["coconut", "mixed peel", "flour"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.weekend, note: "Weekend bakes, 8:00–13:00" }],
        photoTerms: ["banana bread", "bread"],
        amateurPhoto: true,
      },
      {
        slug: "birthday-cake-custom",
        title: "Custom birthday cake",
        description:
          "Tell me the occasion, the flavour, roughly how many people, and any picture you have in mind. I will quote you before anything is baked.",
        lang: "en",
        kind: "CUSTOM",
        priceMode: "QUOTE",
        priceTtd: null,
        categories: ["desserts", "catering"],
        ingredientTags: ["cake", "buttercream", "fondant"],
        occasionTag: "birthday",
        windows: [{ type: "PREORDER", leadTimeDays: 7, note: "A week's notice for decorated cakes" }],
        photoTerms: ["cake", "chocolate cake"],
      },
      {
        slug: "currant-rolls-dozen",
        title: "Currant rolls (dozen)",
        description:
          "Flaky pastry with currants, baked in the morning. Sold by the dozen for liming, work or school.",
        lang: "en",
        kind: "PACKAGE",
        priceMode: "FIXED",
        priceTtd: 84,
        feedsCount: 12,
        categories: ["baked-goods", "snacks", "breakfast"],
        dietaryTags: ["vegetarian"],
        ingredientTags: ["currants", "pastry", "sugar"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.weekdays, note: "Weekday mornings" }],
        photoTerms: ["pastry", "roll"],
        amateurPhoto: true,
      },
    ],
  },

  {
    slug: "doubles-corner-tunapuna",
    displayName: "Doubles Corner Tunapuna",
    bio: "Doubles and pholourie since 2011. Morning stand near the market, and trays for office limes and functions if you order ahead.",
    lang: "en",
    areas: ["east_west_corridor"],
    languages: ["English"],
    specialties: ["Street food", "Doubles", "Breakfast"],
    status: "ACTIVE",
    fulfillmentModes: ["PICKUP", "MEETUP"],
    followers: 511,
    highlights: ["Morning stand", "Office trays"],
    freshToday: [
      { caption: "On the corner from 6am. Pepper is hot today 🌶️", terms: ["curry", "chickpea"], linkTo: "doubles-single" },
    ],
    listings: [
      {
        slug: "doubles-single",
        title: "Doubles",
        description:
          "Two bara, curried channa, cucumber, kuchela and pepper to taste. The way it has always been. Cash or transfer at the stand.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 8,
        categories: ["breakfast", "snacks"],
        dietaryTags: ["vegetarian", "vegan"],
        ingredientTags: ["channa", "bara", "kuchela", "pepper"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.everyDay, note: "6:00–11:00 daily" }],
        photoTerms: ["chickpea", "curry"],
        amateurPhoto: true,
      },
      {
        slug: "doubles-tray-25",
        title: "Doubles tray (25)",
        description:
          "Twenty-five doubles boxed for an office lime or a function. Pepper packed separate so nobody suffers. Order the day before.",
        lang: "en",
        kind: "TRAY",
        priceMode: "FIXED",
        priceTtd: 190,
        feedsCount: 25,
        categories: ["catering", "breakfast"],
        dietaryTags: ["vegetarian"],
        ingredientTags: ["channa", "bara"],
        windows: [{ type: "PREORDER", leadTimeDays: 1 }],
        photoTerms: ["chickpea", "curry"],
        amateurPhoto: true,
      },
      {
        slug: "pholourie-with-chutney",
        title: "Pholourie with chutney",
        description:
          "Split-pea fritters fried to order, with tamarind and mango chutney on the side. Twenty pieces to a bag.",
        lang: "en",
        kind: "PACKAGE",
        priceMode: "FIXED",
        priceTtd: 30,
        feedsCount: 4,
        categories: ["snacks"],
        dietaryTags: ["vegetarian", "vegan"],
        ingredientTags: ["split peas", "tamarind", "mango chutney"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.everyDay, note: "6:00–11:00 daily" }],
        photoTerms: ["fritter", "falafel"],
        amateurPhoto: true,
      },
      {
        slug: "aloo-pie",
        title: "Aloo pie",
        description: "Fried pie stuffed with seasoned potato, split open and filled with channa and pepper.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 10,
        categories: ["snacks", "breakfast"],
        dietaryTags: ["vegetarian", "vegan"],
        ingredientTags: ["potato", "channa", "pepper"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.weekdays, note: "Weekday mornings" }],
        photoTerms: ["potato", "pie"],
        amateurPhoto: true,
      },
    ],
  },

  {
    slug: "dulce-caracas",
    displayName: "Dulce Caracas",
    bio: "Repostería venezolana en Trincity. Tortas, tres leches, marquesas y golfeados. Hago por encargo para cumpleaños y bautizos.",
    lang: "es",
    areas: ["east_west_corridor", "north_west"],
    languages: ["Español", "English"],
    specialties: ["Repostería", "Tortas", "Postres"],
    status: "ACTIVE",
    fulfillmentModes: ["PICKUP", "SELLER_DELIVERY", "MEETUP"],
    followers: 276,
    highlights: ["Tortas", "Postres fríos"],
    freshToday: [
      { caption: "Tres leches listo, quedan 4 porciones", terms: ["tres leches", "cake"], linkTo: "torta-tres-leches" },
      { caption: "Golfeados saliendo del horno", terms: ["cinnamon roll", "bread"] },
    ],
    listings: [
      {
        slug: "torta-tres-leches",
        title: "Torta de tres leches",
        description:
          "Bizcocho bañado en tres leches, con merengue por encima. Se entrega frío en su molde. Para 10 personas.",
        lang: "es",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 150,
        feedsCount: 10,
        categories: ["desserts", "baked-goods"],
        dietaryTags: ["vegetarian"],
        ingredientTags: ["leche condensada", "merengue", "vainilla"],
        windows: [{ type: "PREORDER", leadTimeDays: 2 }],
        photoTerms: ["tres leches", "cake"],
      },
      {
        slug: "marquesa-de-chocolate",
        title: "Marquesa de chocolate",
        description: "Capas de galleta y crema de chocolate, bien fría. Un clásico de cumpleaños venezolano.",
        lang: "es",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 130,
        feedsCount: 8,
        categories: ["desserts"],
        dietaryTags: ["vegetarian"],
        ingredientTags: ["chocolate", "galleta", "crema"],
        windows: [{ type: "PREORDER", leadTimeDays: 1 }],
        photoTerms: ["chocolate", "dessert"],
        amateurPhoto: true,
      },
      {
        slug: "golfeados",
        title: "Golfeados (media docena)",
        description:
          "Pan dulce enrollado con papelón y queso blanco rallado por encima. Se comen tibios, con café.",
        lang: "es",
        kind: "PACKAGE",
        priceMode: "FIXED",
        priceTtd: 70,
        feedsCount: 6,
        categories: ["baked-goods", "breakfast", "snacks"],
        dietaryTags: ["vegetarian"],
        ingredientTags: ["papelón", "queso blanco", "canela"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.wedThuFri, note: "Miércoles a viernes" }],
        photoTerms: ["cinnamon roll", "bread"],
        amateurPhoto: true,
      },
      {
        slug: "torta-personalizada",
        title: "Torta personalizada",
        description:
          "Dime la ocasión, el sabor y para cuántas personas. Te paso el precio antes de empezar. Trabajo con fondant y crema.",
        lang: "es",
        kind: "CUSTOM",
        priceMode: "QUOTE",
        priceTtd: null,
        categories: ["desserts", "catering"],
        ingredientTags: ["fondant", "crema", "bizcocho"],
        occasionTag: "birthday",
        windows: [{ type: "PREORDER", leadTimeDays: 5 }],
        photoTerms: ["cake", "chocolate cake"],
      },
    ],
  },

  {
    slug: "holiday-hampers-tt",
    displayName: "Holiday Hampers TT",
    bio: "Seasonal only. Christmas hampers, Divali sweets and Eid trays, made to order and delivered across the corridor. We open ordering a few weeks before each holiday.",
    lang: "en",
    areas: ["east_west_corridor", "central"],
    languages: ["English", "Español"],
    specialties: ["Seasonal", "Hampers", "Catering"],
    status: "ACTIVE",
    fulfillmentModes: ["SELLER_DELIVERY", "PICKUP"],
    followers: 94,
    highlights: ["Christmas", "Divali", "Eid"],
    listings: [
      {
        slug: "christmas-hamper-family",
        title: "Christmas hamper — family size",
        description:
          "Black cake, sweetbread, ponche de crème, sorrel, ham and pastelles, boxed and ribboned. Delivery across the east–west corridor included.",
        lang: "en",
        kind: "PACKAGE",
        priceMode: "STARTING_AT",
        priceTtd: 650,
        feedsCount: 8,
        categories: ["holiday-specials", "catering"],
        ingredientTags: ["black cake", "sorrel", "ponche de creme", "pastelles"],
        occasionTag: "christmas",
        windows: [
          { type: "DATE_RANGE", startsOn: "-11-01", endsOn: "-12-24", leadTimeDays: 5, note: "Ordering opens 1 November" },
        ],
        photoTerms: ["christmas cake", "fruit cake"],
      },
      {
        slug: "divali-sweets-tray",
        title: "Divali sweets tray",
        description:
          "Kurma, barfi, ladoo and jalebi on one tray. Vegetarian throughout. Order a few days ahead — the week itself books out.",
        lang: "en",
        kind: "TRAY",
        priceMode: "FIXED",
        priceTtd: 280,
        feedsCount: 15,
        categories: ["holiday-specials", "desserts"],
        dietaryTags: ["vegetarian"],
        ingredientTags: ["kurma", "barfi", "ladoo", "jalebi"],
        occasionTag: "divali",
        windows: [
          { type: "DATE_RANGE", startsOn: "-10-01", endsOn: "-11-15", leadTimeDays: 3 },
        ],
        photoTerms: ["dessert", "sweet"],
        amateurPhoto: true,
      },
      {
        slug: "sorrel-bottle",
        title: "Sorrel (1.5L bottle)",
        description: "Steeped with clove, ginger and cinnamon. Sweetened to taste — say if you want it lighter.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 45,
        categories: ["drinks", "holiday-specials"],
        dietaryTags: ["vegan", "vegetarian"],
        ingredientTags: ["sorrel", "clove", "ginger", "cinnamon"],
        occasionTag: "christmas",
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.weekend, note: "Weekends in season" }],
        photoTerms: ["punch", "drink"],
        amateurPhoto: true,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────── central
  {
    slug: "tanty-marge-kitchen",
    displayName: "Tanty Marge Kitchen",
    bio: "Sunday lunch, done properly. Callaloo, macaroni pie, stew chicken and provision. I cook what my mother cooked and I do not rush it.",
    lang: "en",
    areas: ["central", "east_west_corridor"],
    languages: ["English"],
    specialties: ["Sunday lunch", "Creole", "Home cooking"],
    status: "ACTIVE",
    fulfillmentModes: ["PICKUP", "SELLER_DELIVERY"],
    followers: 418,
    highlights: ["Sunday lunch", "Trays"],
    freshToday: [
      { caption: "Sunday pot on. Callaloo, stew chicken, macaroni pie.", terms: ["stew", "chicken"], linkTo: "sunday-lunch-plate" },
    ],
    listings: [
      {
        slug: "sunday-lunch-plate",
        title: "Sunday lunch plate",
        description:
          "Stew chicken, rice and peas, macaroni pie, callaloo and a slice of plantain. One plate, properly loaded. Collection from 11:30 on Sundays.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 85,
        feedsCount: 1,
        categories: ["lunch", "dinner"],
        ingredientTags: ["stew chicken", "macaroni pie", "callaloo", "plantain"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.sunday, note: "Sundays, 11:30–14:00" }],
        photoTerms: ["stew", "chicken"],
        amateurPhoto: true,
      },
      {
        slug: "macaroni-pie-tray",
        title: "Macaroni pie (full tray)",
        description:
          "Baked, not stirred. Sharp cheese, evaporated milk, a proper crust on top. Feeds twelve comfortably.",
        lang: "en",
        kind: "TRAY",
        priceMode: "FIXED",
        priceTtd: 240,
        feedsCount: 12,
        categories: ["catering", "dinner"],
        dietaryTags: ["vegetarian"],
        ingredientTags: ["macaroni", "cheddar", "evaporated milk"],
        windows: [{ type: "PREORDER", leadTimeDays: 2 }],
        photoTerms: ["macaroni", "pasta bake", "cheese"],
      },
      {
        slug: "callaloo-quart",
        title: "Callaloo (quart)",
        description: "Dasheen bush, okra, coconut milk and crab when I can get it. Say if you want it without crab.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 60,
        feedsCount: 4,
        categories: ["lunch", "dinner"],
        ingredientTags: ["dasheen", "okra", "coconut milk", "crab"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.weekend }],
        photoTerms: ["soup", "spinach"],
        amateurPhoto: true,
      },
      {
        slug: "stew-chicken-tray",
        title: "Stew chicken (full tray)",
        description: "Browned down properly with green seasoning. For a lime, a wake or a christening — whatever the occasion.",
        lang: "en",
        kind: "TRAY",
        priceMode: "STARTING_AT",
        priceTtd: 380,
        feedsCount: 15,
        categories: ["catering", "dinner"],
        ingredientTags: ["chicken", "green seasoning", "browning"],
        windows: [{ type: "PREORDER", leadTimeDays: 3 }],
        photoTerms: ["stew", "chicken"],
      },
      {
        slug: "provision-and-saltfish",
        title: "Provision and saltfish",
        description: "Boiled provision — dasheen, cassava, green fig — with saltfish buljol on the side. A Saturday morning plate.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 70,
        categories: ["breakfast", "lunch"],
        ingredientTags: ["cassava", "green fig", "saltfish", "dasheen"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.saturday, note: "Saturdays, 7:00–11:00" }],
        photoTerms: ["fish", "salmon"],
        amateurPhoto: true,
      },
    ],
  },

  // ───────────────────────────────────────────────────────── south central
  {
    slug: "roti-shop-at-home",
    displayName: "The Roti Shop at Home",
    bio: "Buss-up-shut, dhalpuri and curry from a home kitchen in Chaguanas. Everything made fresh the same morning. No frozen roti here.",
    lang: "en",
    areas: ["south_central", "central"],
    languages: ["English", "हिन्दी"],
    specialties: ["Roti", "Curry", "Indo-Trinidadian"],
    status: "ACTIVE",
    fulfillmentModes: ["PICKUP", "MEETUP"],
    followers: 623,
    highlights: ["Roti", "Curries", "Vegetarian"],
    freshToday: [
      { caption: "Dhalpuri going since 5am. Curry duck today.", terms: ["curry", "duck"], linkTo: "curry-duck-with-dhalpuri" },
      { caption: "Buss-up-shut hot off the tawa", terms: ["roti", "bread"] },
    ],
    listings: [
      {
        slug: "buss-up-shut-with-curry",
        title: "Buss-up-shut with curry",
        description:
          "Paratha roti beaten soft, with your choice of curry chicken, goat or channa and potato. Pepper on the side.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "STARTING_AT",
        priceTtd: 55,
        feedsCount: 1,
        categories: ["lunch", "dinner"],
        ingredientTags: ["roti", "curry", "channa", "potato"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.everyDay, note: "10:00–19:00 daily" }],
        photoTerms: ["roti", "curry"],
        amateurPhoto: true,
      },
      {
        slug: "curry-duck-with-dhalpuri",
        title: "Curry duck with dhalpuri",
        description:
          "Curry duck cooked down slow with plenty of seasoning, served with two dhalpuri. Weekend only, and it goes fast.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 95,
        feedsCount: 1,
        categories: ["lunch", "dinner"],
        ingredientTags: ["duck", "curry", "dhalpuri", "chadon beni"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.weekend, note: "Weekends from 11:00" }],
        photoTerms: ["duck", "curry"],
      },
      {
        slug: "vegetarian-roti-combo",
        title: "Vegetarian roti combo",
        description:
          "Dhalpuri with channa and aloo, bodi, pumpkin and spinach. No meat, no compromise on flavour.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 48,
        categories: ["lunch", "vegetarian-vegan"],
        dietaryTags: ["vegetarian", "vegan"],
        ingredientTags: ["channa", "bodi", "pumpkin", "spinach"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.everyDay }],
        photoTerms: ["vegetarian", "curry", "chickpea"],
        amateurPhoto: true,
      },
      {
        slug: "roti-catering-package",
        title: "Roti catering package",
        description:
          "For functions: dhalpuri, two curries, rice and a side, set up in warming trays. Tell me the head count and I will quote.",
        lang: "en",
        kind: "CUSTOM",
        priceMode: "QUOTE",
        priceTtd: null,
        categories: ["catering"],
        ingredientTags: ["roti", "curry", "rice"],
        windows: [{ type: "PREORDER", leadTimeDays: 5 }],
        photoTerms: ["curry", "rice"],
      },
      {
        slug: "goat-curry-quart",
        title: "Curry goat (quart)",
        description: "Bone-in curry goat, cooked down till it falls apart. By the quart, roti sold separately.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 120,
        feedsCount: 4,
        categories: ["dinner"],
        ingredientTags: ["goat", "curry", "masala"],
        windows: [{ type: "PREORDER", leadTimeDays: 2 }],
        photoTerms: ["lamb", "curry"],
      },
    ],
  },

  // ──────────────────────────────────────────────────────────── north west
  {
    slug: "sabores-de-maracaibo",
    displayName: "Sabores de Maracaibo",
    bio: "Arepas, cachapas y patacones hechos al momento en Diego Martin. Comida rápida venezolana de verdad, no la versión de restaurante.",
    lang: "es",
    areas: ["north_west"],
    languages: ["Español"],
    specialties: ["Arepas", "Venezolana", "Comida rápida"],
    status: "ACTIVE",
    fulfillmentModes: ["PICKUP", "MEETUP"],
    followers: 187,
    highlights: ["Arepas", "Cachapas"],
    freshToday: [
      { caption: "Cachapas con queso de mano, hasta que se acabe la masa", terms: ["pancake", "corn"], linkTo: "cachapa-con-queso" },
    ],
    listings: [
      {
        slug: "arepa-reina-pepiada",
        title: "Arepa reina pepiada",
        description:
          "Arepa de maíz rellena de pollo con aguacate y mayonesa. La clásica. Se hace en el momento.",
        lang: "es",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 45,
        categories: ["breakfast", "lunch", "snacks"],
        ingredientTags: ["maíz", "pollo", "aguacate"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.everyDay, note: "7:00–14:00" }],
        photoTerms: ["arepa", "corn"],
        amateurPhoto: true,
      },
      {
        slug: "cachapa-con-queso",
        title: "Cachapa con queso de mano",
        description: "Cachapa de maíz tierno doblada con queso de mano y un poco de mantequilla. Dulce y salada a la vez.",
        lang: "es",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 50,
        categories: ["breakfast", "snacks"],
        dietaryTags: ["vegetarian"],
        ingredientTags: ["maíz tierno", "queso de mano", "mantequilla"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.friSatSun, note: "8:00–15:00" }],
        photoTerms: ["pancake", "corn"],
        amateurPhoto: true,
      },
      {
        slug: "patacon-relleno",
        title: "Patacón relleno",
        description: "Dos rodajas de plátano verde aplastado y frito, con carne, queso y salsas. Se come con las manos.",
        lang: "es",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 65,
        categories: ["lunch", "snacks"],
        ingredientTags: ["plátano verde", "carne", "queso"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.everyDay }],
        photoTerms: ["burger", "beef"],
        amateurPhoto: true,
      },
      {
        slug: "tequenos-docena",
        title: "Tequeños (docena)",
        description: "Palitos de masa rellenos de queso blanco, fritos. Para fiestas, cumpleaños o simplemente para la casa.",
        lang: "es",
        kind: "PACKAGE",
        priceMode: "FIXED",
        priceTtd: 80,
        feedsCount: 6,
        categories: ["snacks", "catering"],
        dietaryTags: ["vegetarian"],
        ingredientTags: ["queso blanco", "masa"],
        windows: [{ type: "PREORDER", leadTimeDays: 1 }],
        photoTerms: ["cheese", "fritter"],
      },
    ],
  },

  {
    slug: "island-grill-westmoorings",
    displayName: "Island Grill Westmoorings",
    bio: "Weekend BBQ from the yard. Ribs, jerk chicken, corn and provision on the grill from Friday evening. Trays for parties with notice.",
    lang: "en",
    areas: ["north_west", "east_west_corridor"],
    languages: ["English"],
    specialties: ["BBQ", "Grill", "Jerk"],
    status: "ACTIVE",
    fulfillmentModes: ["PICKUP", "MEETUP", "SELLER_DELIVERY"],
    followers: 355,
    highlights: ["Weekend grill", "Party trays"],
    freshToday: [
      { caption: "Grill lit. Ribs on from 5. 🔥", terms: ["ribs", "pork"], linkTo: "bbq-pork-ribs" },
    ],
    listings: [
      {
        slug: "bbq-pork-ribs",
        title: "BBQ pork ribs with provision",
        description:
          "Full rack, slow on the grill with a tamarind glaze, served with roast provision and coleslaw. Friday to Sunday only.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 175,
        feedsCount: 2,
        categories: ["bbq-grill", "dinner"],
        ingredientTags: ["pork ribs", "tamarind", "provision", "coleslaw"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.friSatSun, note: "Friday–Sunday from 17:00" }],
        photoTerms: ["ribs", "pork"],
      },
      {
        slug: "jerk-chicken-half",
        title: "Jerk chicken (half bird)",
        description: "Marinated overnight, grilled over pimento wood. Comes with festival and a scotch bonnet sauce you should respect.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 95,
        categories: ["bbq-grill", "dinner"],
        ingredientTags: ["chicken", "jerk", "scotch bonnet", "pimento"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.weekend, note: "Weekends from 16:00" }],
        photoTerms: ["jerk chicken", "chicken"],
        amateurPhoto: true,
      },
      {
        slug: "bbq-party-tray",
        title: "BBQ party tray",
        description:
          "Mixed grill for a lime: ribs, jerk chicken, corn, provision and slaw. Tell me the head count and the date and I will quote.",
        lang: "en",
        kind: "CUSTOM",
        priceMode: "QUOTE",
        priceTtd: null,
        categories: ["catering", "bbq-grill"],
        ingredientTags: ["ribs", "chicken", "corn", "provision"],
        windows: [{ type: "PREORDER", leadTimeDays: 4 }],
        photoTerms: ["barbecue", "ribs"],
      },
      {
        slug: "grilled-corn-two",
        title: "Grilled corn (two)",
        description: "Charred on the grill, butter and a little pepper. Two ears.",
        lang: "en",
        kind: "PACKAGE",
        priceMode: "FIXED",
        priceTtd: 20,
        categories: ["snacks", "bbq-grill", "vegetarian-vegan"],
        dietaryTags: ["vegetarian"],
        ingredientTags: ["corn", "butter"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.friSatSun }],
        photoTerms: ["corn", "vegetarian"],
        amateurPhoto: true,
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────── tobago
  {
    slug: "crown-point-juice-bar",
    displayName: "Crown Point Juice Bar",
    bio: "Cold-pressed juices and smoothies in Crown Point, Tobago. Whatever is in season, pressed the same morning. Bring back the bottle for a dollar off.",
    lang: "en",
    areas: ["tobago"],
    languages: ["English"],
    specialties: ["Juices", "Smoothies", "Vegan"],
    status: "ACTIVE",
    fulfillmentModes: ["PICKUP", "MEETUP"],
    followers: 141,
    highlights: ["Daily press", "Seasonal"],
    freshToday: [
      { caption: "Mango season. Pressing till 11.", terms: ["mango", "smoothie"], linkTo: "mango-smoothie" },
    ],
    listings: [
      {
        slug: "mango-smoothie",
        title: "Mango smoothie",
        description: "Julie mango, banana, a little lime and ice. No added sugar — the mango does the work.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 25,
        categories: ["juices-smoothies", "drinks"],
        dietaryTags: ["vegan", "vegetarian", "gluten-free"],
        ingredientTags: ["mango", "banana", "lime"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.everyDay, note: "7:00–11:00 daily" }],
        photoTerms: ["mango", "smoothie"],
      },
      {
        slug: "green-detox-juice",
        title: "Green detox juice",
        description: "Cucumber, celery, green apple, ginger and lime. Sharp, cold, not pretending to be a dessert.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 32,
        categories: ["juices-smoothies", "drinks", "vegetarian-vegan"],
        dietaryTags: ["vegan", "vegetarian", "gluten-free"],
        ingredientTags: ["cucumber", "celery", "apple", "ginger"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.everyDay }],
        photoTerms: ["juice", "smoothie"],
        amateurPhoto: true,
      },
      {
        slug: "sea-moss-punch",
        title: "Sea moss punch",
        description: "Sea moss, linseed, oats and spice, blended thick. Sold by the bottle, kept cold.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 40,
        categories: ["drinks"],
        dietaryTags: ["vegetarian"],
        ingredientTags: ["sea moss", "linseed", "oats", "nutmeg"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.weekdays }],
        photoTerms: ["punch", "milkshake", "drink"],
        amateurPhoto: true,
      },
      {
        slug: "juice-box-weekly",
        title: "Weekly juice box (6 bottles)",
        description: "Six bottles, mixed through the week, delivered around Crown Point and Bon Accord.",
        lang: "en",
        kind: "PACKAGE",
        priceMode: "STARTING_AT",
        priceTtd: 170,
        feedsCount: 6,
        categories: ["juices-smoothies", "drinks"],
        dietaryTags: ["vegan", "vegetarian"],
        ingredientTags: ["mango", "cucumber", "ginger", "orange"],
        windows: [{ type: "PREORDER", leadTimeDays: 2 }],
        photoTerms: ["juice", "orange"],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────── south west
  {
    slug: "parrilla-del-sur",
    displayName: "Parrilla del Sur",
    bio: "Parrilla venezolana en San Fernando. Carne en vara, chorizo, yuca y guasacaca los fines de semana. Encargos para fiestas con aviso.",
    lang: "es",
    areas: ["south_west", "south_east"],
    languages: ["Español", "English"],
    specialties: ["Parrilla", "Venezolana", "Carne"],
    status: "ACTIVE",
    fulfillmentModes: ["PICKUP", "MEETUP"],
    followers: 208,
    highlights: ["Parrilla", "Para fiestas"],
    listings: [
      {
        slug: "parrilla-mixta-para-dos",
        title: "Parrilla mixta para dos",
        description:
          "Carne, pollo y chorizo a la parrilla, con yuca frita, guasacaca y arepitas. Fines de semana desde las cuatro.",
        lang: "es",
        kind: "PACKAGE",
        priceMode: "FIXED",
        priceTtd: 220,
        feedsCount: 2,
        categories: ["bbq-grill", "dinner"],
        ingredientTags: ["carne", "pollo", "chorizo", "yuca", "guasacaca"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.weekend, note: "Sábado y domingo desde las 16:00" }],
        photoTerms: ["steak", "beef"],
      },
      {
        slug: "chorizo-parrillero",
        title: "Chorizo parrillero (4 unidades)",
        description: "Chorizo casero a la parrilla, con pan y guasacaca. Cuatro unidades.",
        lang: "es",
        kind: "PACKAGE",
        priceMode: "FIXED",
        priceTtd: 85,
        categories: ["bbq-grill", "snacks"],
        ingredientTags: ["chorizo", "guasacaca", "pan"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.weekend }],
        photoTerms: ["sausage", "pork"],
        amateurPhoto: true,
      },
      {
        slug: "parrilla-para-fiesta",
        title: "Parrilla para fiesta",
        description:
          "Montamos la parrilla en tu casa. Dime cuántas personas, la fecha y el lugar, y te paso el precio.",
        lang: "es",
        kind: "CUSTOM",
        priceMode: "QUOTE",
        priceTtd: null,
        categories: ["catering", "bbq-grill"],
        ingredientTags: ["carne", "pollo", "chorizo"],
        windows: [{ type: "PREORDER", leadTimeDays: 7 }],
        photoTerms: ["barbecue", "steak"],
      },
      {
        slug: "yuca-frita-guasacaca",
        title: "Yuca frita con guasacaca",
        description: "Yuca frita crujiente con salsa guasacaca de aguacate y cilantro. Para compartir.",
        lang: "es",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 40,
        categories: ["snacks", "vegetarian-vegan"],
        dietaryTags: ["vegetarian", "vegan"],
        ingredientTags: ["yuca", "aguacate", "cilantro"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.weekend }],
        photoTerms: ["fries", "potato"],
        amateurPhoto: true,
      },
    ],
  },

  // ────────────────────────────────────────── north east — SUSPENDED (trap)
  {
    slug: "mama-lin-kitchen",
    displayName: "Mama Lin Kitchen",
    bio: "Trini-Chinese from a home kitchen in Sangre Grande. Fried rice, chow mein, and pepper shrimp on request.",
    lang: "en",
    areas: ["north_east", "east_west_corridor"],
    languages: ["English", "中文"],
    specialties: ["Chinese", "Fried rice"],
    // ⚠ TRAP — Slice 9's discovery queries must filter on the SELLER's standing.
    // These listings are `active: true` and must NEVER appear on a buyer surface.
    status: "SUSPENDED",
    fulfillmentModes: ["PICKUP"],
    followers: 62,
    listings: [
      {
        slug: "trini-fried-rice",
        title: "Trini fried rice",
        description: "Fried rice with chicken, shrimp and vegetables, seasoned Trini-style.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 70,
        categories: ["lunch", "dinner"],
        ingredientTags: ["rice", "chicken", "shrimp"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.everyDay }],
        photoTerms: ["fried rice", "rice"],
        active: true,
      },
      {
        slug: "pepper-shrimp",
        title: "Pepper shrimp",
        description: "Shrimp tossed in a hot pepper sauce. Not for the faint-hearted.",
        lang: "en",
        kind: "SINGLE_ITEM",
        priceMode: "FIXED",
        priceTtd: 110,
        categories: ["dinner"],
        ingredientTags: ["shrimp", "pepper"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.weekend }],
        photoTerms: ["shrimp", "prawn"],
        active: true,
      },
    ],
  },

  // ───────────────────────────────────── east west corridor — PENDING (trap)
  {
    slug: "pastelitos-y-mas",
    displayName: "Pastelitos y Más",
    bio: "Recién empezando. Pastelitos andinos, tequeños y jugos naturales. Todavía esperando la aprobación.",
    lang: "es",
    areas: ["east_west_corridor"],
    languages: ["Español"],
    specialties: ["Pastelitos", "Venezolana"],
    // ⚠ TRAP — the queue Slice 16 approves. Must not appear on a buyer surface.
    status: "PENDING",
    fulfillmentModes: ["PICKUP"],
    followers: 0,
    listings: [
      {
        slug: "pastelitos-andinos",
        title: "Pastelitos andinos (6)",
        description: "Pastelitos fritos rellenos de queso o carne, media docena.",
        lang: "es",
        kind: "PACKAGE",
        priceMode: "FIXED",
        priceTtd: 60,
        categories: ["snacks", "breakfast"],
        ingredientTags: ["queso", "carne", "masa"],
        windows: [{ type: "RECURRING_WEEKLY", daysOfWeek: DAYS.everyDay }],
        photoTerms: ["empanada", "pastry"],
        active: true,
      },
    ],
  },
];

/** Every seller id, listing id etc. carries this prefix — see the header. */
export const SEED_PREFIX = "seed-";

export function sellerId(slug: string): string {
  return `${SEED_PREFIX}seller-${slug}`;
}
export function listingId(slug: string): string {
  return `${SEED_PREFIX}listing-${slug}`;
}
