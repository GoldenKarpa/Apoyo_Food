import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Prevents /_next asset collisions when this app is reached via
// portal.apoyolime.com/food/* — that host is shared with portal-web, the
// Apoyo-Demia app, salon-web and apparel-web. Unset in dev (architecture B2).
const assetPrefix = process.env.NEXT_PUBLIC_ASSET_HOST || undefined;

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  assetPrefix,
  images: {
    // Custom loader (Slice 4): the ingest pipeline already produced thumb/card/
    // full at fixed sizes, so Next's own optimizer would be redundant work on
    // every request. The loader instead rewrites the variant suffix on a storage
    // key to match the requested width, and owns the media base URL — which is
    // the single thing that changes when local disk becomes R2 + a CDN domain.
    loader: "custom",
    loaderFile: "./lib/media/image-loader.ts",
    // Widths match the Part C variant ladder (thumb 400 / card 800 / full 1600)
    // so next/image never asks for a size the pipeline didn't produce.
    deviceSizes: [400, 800, 1200, 1600],
    imageSizes: [200, 400],
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        // Inherited pre-emptively from Salon's B-S20 finding (and Apparel's own
        // Slice 1 carry-over): assetPrefix above deliberately serves
        // /_next/static cross-origin from food.apoyolime.com when this app
        // renders under portal.apoyolime.com/food — and cross-origin @font-face
        // loading is CORS-checked by the browser regardless of same-site trust.
        // This app self-hosts THREE fonts via next/font (Fraunces, Inter,
        // Caveat), so without this the seller dashboard silently loses all of
        // them in production. Scoped to the portal origin, not "*".
        source: "/_next/static/:path*",
        headers: [{ key: "Access-Control-Allow-Origin", value: "https://portal.apoyolime.com" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
