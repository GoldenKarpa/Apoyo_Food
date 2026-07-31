"use client";

import * as React from "react";

/**
 * Registers `public/sw.js` (Slice 12). Rendered once from the (client) layout
 * only — the seller dashboard is a different app surface (a different HOST in
 * production) and was never meant to be the installed PWA's entry point
 * (`app/manifest.ts`'s own `start_url` is the client root).
 *
 * No UI of its own: `beforeinstallprompt`/a custom "Install" button is real,
 * separable future work, not something this slice's "installability verified"
 * clause asked for — that clause is about the manifest+SW+HTTPS criteria
 * actually being met (verified via Lighthouse's PWA audit, see this slice's
 * Implementation notes), not about a bespoke install affordance.
 */
export function ServiceWorkerRegister() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[pwa] service worker registration failed", err);
    });
  }, []);

  return null;
}
