// Deliberately a bare passthrough — NOT the seller chrome. `/food/*` has
// children with incompatible chrome: `(dashboard)` (seller header + padded
// `<main>`), `admin` (Slice 16's full-viewport Apoyo admin shell, which must be
// "visually identical to Portal's"), and the `login` placeholder. A wrapper here
// nests one chrome inside the other for whichever child doesn't own it, so each
// child carries its own instead — `(dashboard)/layout.tsx` now has the seller
// header this file used to render.
//
// ⚠ Fixed 2026-08-15, after the seller header was seen rendering ABOVE the admin
// shell on `/food/admin` — a dark full-viewport admin sidebar with an "Apoyo Food
// / Seller workspace" banner stacked on top of it. Apparel hit exactly this at
// its own Slice 16 and solved it this way; Food kept the parent-layout version
// and so kept the bug. Salon never had a layout here at all, which is why only
// Food showed it.
//
// middleware.ts still 404s this whole subtree on the food.* host — that is
// unrelated to chrome and unaffected.
export default function FoodSurfaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
