/**
 * `FoodCategory` form constants — Slice 16's category manager (add/edit,
 * en+es names). Kept separate from `lib/actions/admin.ts` so a Client
 * Component can import the length cap for inline validation without pulling
 * in a `"use server"` file (the same reason `lib/listing-form.ts` exists).
 */
export const MAX_CATEGORY_NAME_LENGTH = 40;
