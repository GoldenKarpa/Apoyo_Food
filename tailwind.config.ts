import type { Config } from "tailwindcss";

// "Sobremesa" design tokens — Apoyo_Food_Architecture.md Part F3 is the single
// authority for these values, and it carries the CORRECTED (WCAG-audited)
// accent hexes, not the raw Emergent spec values. See app/globals.css for the
// per-token measurements and the rules attached to each of the three accent
// forms (text-safe / -vivid fill-only / -soft tint).
//
// Colours are declared in globals.css as space-separated RGB channels rather
// than hex, purely so Tailwind's opacity modifiers keep working through the CSS
// variable: `bg-green/90` needs to substitute an alpha into the colour
// function, which a `var(--green)` holding a raw hex string cannot do.
const config: Config = {
  darkMode: ["class"],
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // --- Surfaces (Part F3, unchanged from the Emergent spec) ---
        "cream-bg": "rgb(var(--cream-bg) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        sunken: "rgb(var(--sunken) / <alpha-value>)",
        hairline: "rgb(var(--hairline) / <alpha-value>)",

        // --- Text (unchanged) ---
        // ⚠ `ink-muted` is 4.37:1 on `sunken` — below the 4.5 bar. Use full
        // `ink` for body text on sunken surfaces (inputs, sunken cards).
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-muted": "rgb(var(--ink-muted) / <alpha-value>)",

        // --- Accents, TEXT-SAFE form (corrected) ---
        // Safe as a text colour on all three surfaces AND as a fill behind a
        // card-cream label. `green` is the non-negotiable anchor: navigation,
        // active tab, primary buttons, default CTAs, on every screen.
        green: "rgb(var(--green) / <alpha-value>)",
        teal: "rgb(var(--teal) / <alpha-value>)",
        gold: "rgb(var(--gold) / <alpha-value>)",
        terracotta: "rgb(var(--terracotta) / <alpha-value>)",
        error: "rgb(var(--error) / <alpha-value>)",

        // --- Accents, FILL-ONLY form (the retained Emergent originals) ---
        // ⚠ INK on top, always. Never a cream/white label, never used AS a text
        // colour. This is what renders the vivid availability stamps and status
        // chips the mockups intend (Part F3).
        // Hover/pressed fills. Darker than the resting accent on purpose —
        // see the note in globals.css; an alpha-based hover lightens against
        // the cream page and fails AA.
        "green-deep": "rgb(var(--green-deep) / <alpha-value>)",
        "error-deep": "rgb(var(--error-deep) / <alpha-value>)",
        "green-vivid": "rgb(var(--green-vivid) / <alpha-value>)",
        "teal-vivid": "rgb(var(--teal-vivid) / <alpha-value>)",
        "gold-vivid": "rgb(var(--gold-vivid) / <alpha-value>)",
        "terracotta-vivid": "rgb(var(--terracotta-vivid) / <alpha-value>)",

        // --- Soft tints — backgrounds carrying ink text (10.97–11.98:1) ---
        "green-soft": "rgb(var(--green-soft) / <alpha-value>)",
        "teal-soft": "rgb(var(--teal-soft) / <alpha-value>)",
        "gold-soft": "rgb(var(--gold-soft) / <alpha-value>)",
        "terracotta-soft": "rgb(var(--terracotta-soft) / <alpha-value>)",

        // --- shadcn-primitive aliases ---
        // The shadcn-style primitives in components/ui expect these semantic
        // names. Pointing them at Sobremesa values means a stock primitive lands
        // on-palette instead of shadcn's default cool greys. `primary` is green
        // because of the anchor rule above.
        background: "rgb(var(--cream-bg) / <alpha-value>)",
        foreground: "rgb(var(--ink) / <alpha-value>)",
        border: "rgb(var(--hairline) / <alpha-value>)",
        input: "rgb(var(--sunken) / <alpha-value>)",
        ring: "rgb(var(--green) / <alpha-value>)",
        muted: {
          DEFAULT: "rgb(var(--sunken) / <alpha-value>)",
          foreground: "rgb(var(--ink-muted) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "rgb(var(--green) / <alpha-value>)",
          foreground: "rgb(var(--card) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--green-soft) / <alpha-value>)",
          foreground: "rgb(var(--ink) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--teal-soft) / <alpha-value>)",
          foreground: "rgb(var(--ink) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--error) / <alpha-value>)",
          foreground: "rgb(var(--card) / <alpha-value>)",
        },
      },

      fontFamily: {
        // Part F3: warm display serif for headings (Fraunces — the shared family
        // logic with Apparel), Inter for UI/body, and a handwritten accent used
        // ONLY for occasional section labels ("En la cocina hoy"), never for
        // body, buttons, prices or data. Max 1–2 per screen.
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        hand: ["var(--font-caveat)", "cursive"],
      },

      // Part F3 mobile type scale — size/line-height pairs, so `text-h1` carries
      // its leading with it and can't be paired with the wrong one.
      fontSize: {
        display: ["1.75rem", { lineHeight: "2.125rem" }], // 28/34
        h1: ["1.375rem", { lineHeight: "1.75rem" }], //     22/28
        h2: ["1.125rem", { lineHeight: "1.5rem" }], //      18/24
        body: ["1rem", { lineHeight: "1.5rem" }], //        16/24
        label: ["0.875rem", { lineHeight: "1.25rem" }], //  14/20
        caption: ["0.75rem", { lineHeight: "1rem" }], //    12/16
      },

      // Shared ecosystem 4pt scale: 4/8/12/16/24/32/48 — Tailwind's default
      // scale already supplies every one (1/2/3/4/6/8/12). These two are
      // semantic aliases so layout code names the intent instead of the number.
      spacing: {
        screen: "1rem", // 16px — mobile screen padding
        "screen-md": "1.5rem", // 24px — >=768px screen padding
      },

      borderRadius: {
        // Part F3, deliberately rounder than Apparel: cards 20, images 16,
        // buttons & chips full-pill, inputs 14.
        card: "1.25rem",
        image: "1rem",
        control: "0.875rem",
        pill: "9999px",
        // shadcn-primitive aliases (its rounded-md/lg/sm usages), pulled onto
        // the 14px input radius rather than shadcn's default 6px.
        lg: "0.875rem",
        md: "0.875rem",
        sm: "0.5rem",
      },

      boxShadow: {
        // Part F3: exactly one soft shadow for the whole system.
        soft: "0 3px 14px rgba(43, 40, 32, 0.07)",
      },

      maxWidth: {
        content: "75rem", // 1200px, matching the sibling Apparel layout
      },

      transitionTimingFunction: {
        // Part F3 motion: ease-out, no bounce.
        soft: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        // Part F3 motion: 200-300ms.
        200: "200ms",
        250: "250ms",
        300: "300ms",
      },

      keyframes: {
        // Bottom sheets (filters) and the full-screen Fresh Today viewer, which
        // Part F3 specifies opens with a soft fade. The exit halves exist
        // because Radix's Presence keeps a closing dialog mounted until its CSS
        // animation finishes — without them the sheet vanishes instantly, which
        // reads as a glitch rather than "200-300ms ease-out".
        "sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "sheet-down": {
          from: { transform: "translateY(0)" },
          to: { transform: "translateY(100%)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        // The >=768px form of the same overlay: a centred card that fades and
        // scales rather than sliding from an edge it is nowhere near. Both
        // halves exist for the Presence reason above.
        "modal-in": {
          from: { opacity: "0", transform: "translate(-50%, -50%) scale(0.97)" },
          to: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
        },
        "modal-out": {
          from: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
          to: { opacity: "0", transform: "translate(-50%, -50%) scale(0.97)" },
        },
        // Blur-up image reveal (Part F3): the LQIP placeholder resolves into the
        // real photo. Never a spinner on a browse surface.
        "blur-up": {
          from: { opacity: "0", filter: "blur(12px)" },
          to: { opacity: "1", filter: "blur(0)" },
        },
        // Part F3's card fade: a card arrives, it does not pop. Paired with the
        // blur-up above, this is the whole of the browse-surface motion budget.
        "card-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        // The Fresh Today viewer's progress-bar fill (Slice 11). ⚠ Cosmetic
        // ONLY — the slide-advance timer is a plain `setTimeout` in JS, never
        // this animation's `onAnimationEnd`. globals.css forces EVERY
        // animation-duration to 0.01ms under `prefers-reduced-motion`, which
        // would otherwise rapid-fire through an entire story in a few
        // milliseconds — a real bug this decoupling exists to avoid, not a
        // hypothetical one.
        "story-progress": {
          from: { width: "0%" },
          to: { width: "100%" },
        },
      },
      animation: {
        "sheet-up": "sheet-up 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        "sheet-down": "sheet-down 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-out": "fade-out 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        "modal-in": "modal-in 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        "modal-out": "modal-out 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        "blur-up": "blur-up 300ms cubic-bezier(0.16, 1, 0.3, 1)",
        "card-in": "card-in 250ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "story-progress": "story-progress linear forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
