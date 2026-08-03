"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { createCategory, updateCategory } from "@/lib/actions/admin";
import { SELLER_FORM_IDLE, type SellerFormState } from "@/lib/actions/seller-form-state";
import { MAX_CATEGORY_NAME_LENGTH } from "@/lib/category-form";

export interface CategoryFormValue {
  id: string;
  nameEn: string;
  nameEs: string;
  seasonal: boolean;
}

/**
 * Slice 16's category manager (add/edit, en+es names) — no Apparel precedent
 * to mirror, since `FoodCategory` has no equivalent on that side. Reuses
 * `SellerFormState`/`useTransition`, the same idiom every Slice 14/15 seller
 * form already uses, rather than the plain unfed `<form action={...}>` shape
 * Apparel's own admin forms use — Food's admin surface stays consistent with
 * the rest of this app's forms instead of copying that one.
 */
export function CategoryForm({ category, onDone }: { category?: CategoryFormValue; onDone?: () => void }) {
  const t = useTranslations("seller");
  const tAdmin = useTranslations("seller.admin.categories");
  const router = useRouter();
  const [nameEn, setNameEn] = useState(category?.nameEn ?? "");
  const [nameEs, setNameEs] = useState(category?.nameEs ?? "");
  const [seasonal, setSeasonal] = useState(category?.seasonal ?? false);
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<SellerFormState>(SELLER_FORM_IDLE);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("nameEn", nameEn);
    formData.set("nameEs", nameEs);
    if (seasonal) formData.set("seasonal", "on");

    startTransition(async () => {
      const result = category
        ? await updateCategory(category.id, SELLER_FORM_IDLE, formData)
        : await createCategory(SELLER_FORM_IDLE, formData);
      setState(result);
      if (result.status === "ok") {
        router.refresh();
        if (!category) {
          setNameEn("");
          setNameEs("");
          setSeasonal(false);
        }
        onDone?.();
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`cat-name-en-${category?.id ?? "new"}`} className="admin-muted">
          {tAdmin("nameEnLabel")}
        </label>
        <input
          id={`cat-name-en-${category?.id ?? "new"}`}
          className="admin-input"
          value={nameEn}
          maxLength={MAX_CATEGORY_NAME_LENGTH}
          onChange={(e) => setNameEn(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`cat-name-es-${category?.id ?? "new"}`} className="admin-muted">
          {tAdmin("nameEsLabel")}
        </label>
        <input
          id={`cat-name-es-${category?.id ?? "new"}`}
          className="admin-input"
          value={nameEs}
          maxLength={MAX_CATEGORY_NAME_LENGTH}
          onChange={(e) => setNameEs(e.target.value)}
        />
      </div>
      <label className="admin-muted" style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <input type="checkbox" checked={seasonal} onChange={(e) => setSeasonal(e.target.checked)} />
        {tAdmin("seasonalLabel")}
      </label>
      <button type="submit" className="admin-btn admin-btn-primary" disabled={pending}>
        {pending ? "…" : category ? tAdmin("save") : tAdmin("add")}
      </button>
      {state.status === "error" && (
        <span className="admin-muted" style={{ color: "#b3413a" }}>
          {t(`errors.${state.error}`)}
        </span>
      )}
    </form>
  );
}
