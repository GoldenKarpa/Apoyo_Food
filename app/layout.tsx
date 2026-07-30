import type { Metadata, Viewport } from "next";
import { Caveat, Fraunces, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

// Part F3 type. `display: "swap"` is an accessibility requirement here, not a
// default — text must be readable before the webfont lands on Trinidad mobile
// data. This repo's path is #-free, so there is no Apoyo-Demia-style font issue.
const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  // Part F3 weight set: 400 body · 500 labels/buttons · 600 headings.
  weight: ["400", "500", "600"],
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// ⚠ The handwritten accent is for occasional SECTION LABELS only ("En la cocina
// hoy", "Recién hecho") — never body, buttons, prices or data, max 1–2 per
// screen (Part F3). It is loaded here so `font-hand` exists as a token, not as
// an invitation to use it freely.
const caveat = Caveat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-caveat",
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Apoyo Food",
    template: "%s | Apoyo Food",
  },
  description:
    "Discover food made by independent creators in Trinidad & Tobago — home cooks, bakers, dessert makers and caterers near you.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Apoyo Food",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#536D46", // --green, the Part F3 anchor
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${fraunces.variable} ${caveat.variable}`}
    >
      <body className="font-sans text-body antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
