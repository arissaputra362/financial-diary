/*
  Global Add action to Activity sheet intent.

  Delivered synchronously on the client so a tap still opens the sheet while a
  close-triggered `router.replace` is in flight. The URL remains the deep-link
  fallback for cross-page navigation and for the tiny window before
  `ActivityView` subscribes after hydration; `ActivityView` is still its only
  writer once mounted.
*/

export const TRANSACTION_ADD_EVENT = "financial-planner:add-transaction";

let listenerCount = 0;

/** Called by ActivityView when its synchronous intent handler is ready. */
export function setTransactionAddListenerAttached(attached: boolean): void {
  listenerCount = Math.max(0, listenerCount + (attached ? 1 : -1));
}

/**
 * Returns false when no mounted Activity sheet can receive the intent yet, so
 * the caller can fall back to the existing `?add=1` deep link.
 */
export function requestTransactionAddIntent(): boolean {
  if (typeof window === "undefined" || listenerCount === 0) return false;
  window.dispatchEvent(new Event(TRANSACTION_ADD_EVENT));
  return true;
}
