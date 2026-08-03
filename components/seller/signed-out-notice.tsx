import { getTranslations } from "next-intl/server";

/**
 * What the seller surface shows to someone with no session.
 *
 * ⚠ **States the situation and stops — no redirect, no sign-in link.** This is
 * not an oversight and not a placeholder: the ecosystem rule the user set
 * during Apparel's build is that one vertical must never surface another
 * vertical's URL or brand to its visitor as a redirect target, and Food has no
 * login door of its own (`/food/login` and `/login` are both still Slice 1
 * placeholders; no slice in Phases 0-3 builds one). Slices 10 and 11 answered
 * the same question the same way for Save and Follow — an inline hint, never a
 * guessed destination.
 *
 * Building Food's own login pair is real, separable work, and it is what would
 * turn this notice into a control.
 *
 * ⚠ `namespace` was added at Slice 17 for `/orders`/`/orders/[id]` — the FIRST
 * caller on the CLIENT surface, which needs its own `client.signedOut` copy
 * (the client surface defaults `en`; the seller copy defaults `es`, and the
 * two read different message trees for that reason alone). Every existing
 * caller keeps the original default and needed no change.
 */
export async function SignedOutNotice({ namespace = "seller.signedOut" }: { namespace?: string } = {}) {
  const t = await getTranslations(namespace);

  return (
    <section className="rounded-card border border-hairline bg-card p-6">
      <h1 className="font-display text-h1 font-semibold text-ink">{t("title")}</h1>
      <p className="mt-3 max-w-prose text-body text-ink">{t("body")}</p>
    </section>
  );
}
