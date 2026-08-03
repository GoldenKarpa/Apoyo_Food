/**
 * Fresh Today posting — pure, CLIENT-SAFE constants.
 *
 * ⚠ Nothing in this file may import `lib/storage.ts` (or anything else that
 * touches `fs`) — `<StoryPostForm>` is a Client Component that imports
 * `MAX_CAPTION_LENGTH` from here, and webpack bundles whatever this module
 * transitively imports into the BROWSER bundle. That is a real bug this file
 * shipped with once already: `isStoryStorageKey` (the trust-boundary check on
 * an uploaded photo's storage keys) originally lived here, pulled in
 * `safeStorageKey` from `lib/storage.ts`, and broke the production build with
 * `Module not found: Can't resolve 'fs/promises'` — caught by `next build`,
 * not by `tsc` or lint, because both are blind to bundle boundaries. It now
 * lives inline in `lib/actions/create-story.ts`, the one server-only place
 * that ever needed it.
 *
 * Architecture Part E2: "24h via `expiresAt`" and "no scheduling, no editing
 * after post (delete + repost) — keep the surface tiny." Both are structural
 * here, not conventions to remember — there is no `updateStory` action
 * anywhere in this slice, and `STORY_LIFETIME_HOURS` is the only place the
 * lifetime is computed.
 */

export const STORY_LIFETIME_HOURS = 24;
export const MAX_CAPTION_LENGTH = 200;
export const MAX_HIGHLIGHT_TITLE_LENGTH = 40;
/** Part E2 asks for a tiny surface; a seller with 20 open shelves has stopped
 * curating and started filing. */
export const MAX_HIGHLIGHTS_PER_SELLER = 20;

export function expiresAtFrom(createdAt: Date): Date {
  return new Date(createdAt.getTime() + STORY_LIFETIME_HOURS * 60 * 60 * 1000);
}
