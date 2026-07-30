# Apoyo Ecosystem — Design System Documentation
### Aesthetic specifications for the Food and Apparel subdomains

This document defines the visual language for two sibling marketplaces in the `apoyolime.com` ecosystem. They are designed to feel like **the same family, in different rooms** — shared foundations, distinct personalities. This is an aesthetics/design-system reference, not an engineering plan.

---

## 0. Ecosystem Design Principles (shared by both)
- **Low ego** — welcoming to first-time, non-technical, Spanish-speaking sellers; never elitist
- **Forgiving of amateur phone photos** — framing, aspect-locking, and warm surfaces make casual shots look intentional
- **Facts + photos over prose** — chips, stamps, and photography carry meaning; minimal required typing
- **Bilingual as brand** — ES/EN toggle is a visible, deliberate element, not a hidden setting
- **Sibling, not clone** — shared type foundation, toggle treatment, spacing logic, and warm philosophy; each site owns its color identity and shape language

**Shared foundations across both sites**
- UI/body typeface: **Inter** (or Instrument Sans)
- Display logic: a warm **display serif** for headings
- ES/EN toggle pill, consistent placement (top-right)
- 4pt spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48
- Screen padding: 16px mobile / 24px ≥768px
- Mobile-first PWA; bottom tab navigation; filters as bottom sheets
- WCAG AA contrast; tap targets ≥44px; font-display swap; lazy-loaded responsive imagery
- Currency `$X,XXX TTD`

**How the two diverge (at a glance)**

| Dimension | Apparel — "Soft Studio" | Food — "Sobremesa" |
|---|---|---|
| Mood | Quiet boutique, calm | Warm table, social, appetizing |
| Base | Warm sand `#F3EDE4` | Cooler cream `#F4EEE1` |
| Accent | Clay/rose `#C08A76` | Green + teal + gold + terracotta |
| Shape | 16px cards, restrained | 20px cards, full-pill, rounder |
| Photo ratio | 4:5 portrait (garments) | 4:3 (meals), 1:1 thumbs, 16:9 cover |
| Signature | Editorial "garment-tag" specs | "Fresh Today" board + availability stamps |

---

# PART 1 — "SOBREMESA" (Food) Design System

*Sobremesa* — the Latin/Venezuelan ritual of lingering at the table after a meal. The soul of a discovery-and-relationship marketplace (explicitly **not** a delivery app).

## 1.1 Design Principles
- **Warmth of the table** — social, appetizing, relationship-first
- **Freshness over inventory** — ephemeral "Fresh Today" board signals presence, never stock
- **Culturally warm, not clichéd** — Venezuelan resonance through muted earth/sea tones, never flag colors
- Plus all shared ecosystem principles (Section 0)

## 1.2 Color Tokens
**Surfaces**
- `--cream-bg` #F4EEE1 · `--card` #FCF8EF · `--sunken` #EBE3D3 · `--hairline` #E2D8C4

**Text**
- `--ink` #2B2820 · `--ink-muted` #6F675A

**Accents (+ soft tints for backgrounds)**
- `--green` #5E7B4F · `--green-soft` #E4EADC — *primary / anchor*
- `--teal` #4E8C86 · `--teal-soft` #DCE8E5 — *social / discovery*
- `--gold` #DDA24A · `--gold-soft` #F5E6C9 — *energy / status*
- `--terracotta` #C0654A · `--terracotta-soft` #F0DAD1 — *price / bridge to apparel*

**Semantic**
- Accepted/Success = `--green` · Pending = `--gold` · Declined/Error = #B2503F · Info = `--teal`

## 1.3 Theming & Accent Alternation Rules
This is the disciplined way the palette carries both the "fresh restaurant menu" (green) and "Venezuelan warmth" (teal/gold/terracotta) feelings without fragmenting.

**Anchor rule (non-negotiable):** navigation, active tab, primary buttons, and default CTAs are **always `--green`**, on every screen.

**Category → accent** (tints that category's headers, pills, availability stamps, detail highlights):
- Savory / meals → `--green`
- Desserts / baked → `--gold`
- Drinks / juices / fresh → `--teal`
- Holiday / seasonal specials → `--terracotta`

**Fixed accent roles (regardless of category):**
- `--teal` → Fresh Today indicators, follow actions, verification checks, region map selection, menu-shelf
- `--gold` → status chips (Pending/New), trending/featured badges
- `--terracotta` → price text everywhere (family tie to apparel)

**Seasonal option:** a global accent may rotate for holidays (e.g., terracotta for Navidad) — affects headers/badges only, never navigation.

## 1.4 Typography
- **Headings:** warm display serif (shared family logic with apparel)
- **UI / body:** Inter / Instrument Sans
- **Handwritten accent:** a warm script (e.g., *Caveat*) ONLY for occasional section labels such as *En la cocina hoy* / *Recién hecho* — never for body, buttons, prices, or data. Max 1–2 per screen.
- **Scale (mobile):** Display 28/34 · H1 22/28 · H2 18/24 · Body 16/24 · Label 14/20 · Caption 12/16
- **Weights:** 400 body · 500 labels/buttons · 600 headings

## 1.5 Shape, Elevation, Motion
- **Rounder than apparel:** cards 20px · images 16px · buttons & chips full-pill · inputs 14px
- Elevation: single soft shadow `0 3px 14px rgba(43,40,32,0.07)`
- Motion: 200–300ms ease-out; blur-up image reveal (blurDataUrl); Fresh Today / board opens full-screen with soft fade

## 1.6 Imagery
- Meal photos **4:3**; seller cover **16:9**; avatars & board thumbnails **1:1**
- Server-generated variants (thumb / card / full) + blur placeholder
- **EXIF/GPS stripped at ingest** (seller privacy — per architecture doc)
- 1–6 photos per listing; appetite-forward; consistent cream framing unifies mismatched amateur shots

## 1.7 Core Components
- **"Fresh Today" rail** (differentiated Stories): horizontal **rounded-rectangular** cards (not IG circles) — food thumbnail, seller name, teal freshness dot + steam-wisp icon, availability window. 24h expiry; tap → full-screen viewer with linked-listing CTA. Metaphor: a daily specials board, not social vanity.
- **Menu-shelf highlights** (profile): labeled rectangular cards (*Especialidades, Festivos, Postres, Reseñas*) on a subtle shelf — replaces IG highlight circles.
- **Availability stamps:** market-stamp pills — *Fin de semana* (green), *Por encargo · 2 días* (gold), *Solo festivos* (terracotta).
- **Meal card:** 4:3 photo → dish name (serif) → price (terracotta) → availability stamp → seller mini-row.
- **Fulfillment row:** icon + label trio — Pickup / Meet-up / Seller delivery.
- **Category pills:** full-pill, tinted by category accent.
- **Seller profile header:** 16:9 cover, overlapping round avatar, name + teal verification, area/specialty chips, green *Seguir* button, follower count.
- **Order thread bubbles (bilingual):** original text prominent + smaller, lighter translation line beneath; sender-aligned; cream/green tints.
- **Status chip:** Pending = gold · Accepted = green · Declined = red · Completed = muted.
- **Order summary card:** items, requested date/time (displayed in America/Port_of_Spain), fulfillment mode, subtotal.
- **Sticky CTA bar:** green primary (*Solicitar pedido* / *Aceptar*).
- **Bottom tab bar:** Home · Browse · Orders · Saved · Account; active = green.
- **Region map picker:** warm **illustrated** Trinidad (RegionKey areas); selected area in teal — not a cold GIS map.
- **Filters:** bottom-sheet with pill toggles.

## 1.8 Bilingual & Localization
- ES + EN UI; sellers author in ES; order-thread messages store original + translation, shown gently
- Design for **+30% Spanish text expansion** — no fixed-width labels
- Currency `$X,XXX TTD`; times in America/Port_of_Spain

## 1.9 Accessibility & PWA
- WCAG AA contrast; green/teal/terracotta used as text only ≥18px or bold, or on soft-tint backgrounds
- Tap targets ≥44px; visible focus; Fresh Today/board content reachable without gesture-only nav
- PWA from MVP: installable, offline browse shell, lazy-loaded responsive images, font-display swap

## 1.10 Screen Inventory (designed & validated)
Home (Fresh Today rail) · Meal/listing detail (availability stamps, fulfillment) · Seller profile (menu-shelf highlights) · Order request→accept thread (bilingual)

---

# PART 2 — "SOFT STUDIO" (Apparel) Design System
*Included for the matched ecosystem pair.*

## 2.1 Principles
Calm over loud · facts over prose · forgiving of amateur input · low ego.

## 2.2 Color Tokens
- Surfaces: `--sand-bg` #F3EDE4 · `--cream-card` #FBF8F3 · `--sand-sunken` #ECE4D8
- Text: `--ink` #2A2521 · `--ink-muted` #6E655C · `--hairline` #E0D7C9
- Accent (clay): `--clay` #C08A76 · `--clay-hover` #A9735F · `--clay-soft` #EFDDD4
- Condition tags: New #7E8A6F on #E7EADD · Good #EFDDD4 · Used #E4DACB · Error #B25B4C · Success #7E8A6F

## 2.3 Typography
- Headings: Fraunces · UI/body: Inter / Instrument Sans
- Scale (mobile): Display 28/34 · H1 22/28 · H2 18/24 · Body 16/24 · Label 14/20 · Caption 12/16
- Weights: 400 body · 500 labels/buttons · 600 headings

## 2.4 Shape, Elevation, Motion
- Radius: cards 16px · chips/buttons/inputs 12px · images 12px
- Shadow: `0 2px 12px rgba(42,37,33,0.06)`
- Motion: 200–300ms ease-out, no bounce

## 2.5 Imagery
- Photos locked to **4:5** smart-center crop on cream card
- Optional **on-device background cleanup** (`@imgly/background-removal`, free, opt-in, before/after preview)
- 1–6 photos per listing

## 2.6 Core Components
Product card (4:5 → chips → price) · size/condition chips · "garment-tag" spec block (measurements) · primary (clay) / secondary (outlined) buttons · sunken inputs & dropdowns (chips preferred over free text) · 5-icon bottom nav (active clay) · header with ES/EN toggle · 3-step listing progress indicator · Contact-Seller bottom sheet.

## 2.7 Localization & Accessibility
ES + EN (author in ES, buyers view EN; auto-translate a later switch, data model stores both) · +30% text expansion · `$X,XXX TTD` · WCAG AA · tap targets ≥44px · PWA (offline feed, font-display swap).

## 2.8 Screen Inventory
Discovery feed · Product page · Spanish listing/upload · Photo-cleanup preview · Seller dashboard · Seller profile · Contact-seller sheet.

---

## Usage Notes
- Treat Part 0 as the single source of truth for anything shared; only override per-site where Parts 1/2 explicitly differ.
- Keep navigation/primary-action color constant within each site (clay for apparel, green for food) so category/seasonal accents never destabilize wayfinding.
- Both specs assume amateur, Spanish-first sellers — never introduce components that require long-form English copy or professional photography as a hard dependency.