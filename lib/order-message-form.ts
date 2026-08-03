/**
 * Order-thread message constants — kept in its own pure module (no `fs`, no
 * server-only imports) for the same reason `lib/story-form.ts` is: a Client
 * Component composer imports this directly, and Slice 15's own finding is
 * that anything this file pulls in transitively gets bundled into the
 * BROWSER build. `lib/actions/order-message.ts` is the one place that
 * actually needs the storage-key trust-boundary check.
 */
export const MAX_MESSAGE_LENGTH = 1000;
