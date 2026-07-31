"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The search box.
 *
 * A real `<form>` with a GET submit rather than an input that navigates on
 * every keystroke, and that is a demand-logging decision as much as a UX one:
 * `/search` logs a SEARCH event per render, so search-as-you-type would record
 * "p", "pa", "pas", "past"… as five separate demand signals and drown the one
 * that matters. Part E5 defers search-as-you-type to Phase 5, where it will need
 * its own debounced logging rule.
 */
export function SearchForm({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const t = useTranslations("client.search");
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      role="search"
      className="flex w-full max-w-xl gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const q = value.trim();
        startTransition(() => router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search"));
      }}
    >
      <label htmlFor="food-search" className="sr-only">
        {t("label")}
      </label>
      <Input
        id="food-search"
        name="q"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t("placeholder")}
        autoComplete="off"
      />
      <Button type="submit" disabled={isPending} className="shrink-0">
        <Search aria-hidden />
        <span className="sr-only">{t("submit")}</span>
      </Button>
    </form>
  );
}
