"use client";

import { useEffect, useId, useRef, type RefObject } from "react";

/*
  Shared dialog keyboard mechanics (AC-F6-12, design 06 §11/§14).

  Behaviour, identical for every sheet and the receipt viewer:

  - opening moves focus to the first focusable control inside the panel,
  - Escape closes,
  - Tab / Shift+Tab cycle inside the dialog and never reach the page behind it,
  - closing returns focus to the element that opened the dialog.

  Nested dialogs (wallet picker over the add-transaction sheet, receipt viewer
  over the transaction detail sheet) go through a module-level stack: only the
  innermost open dialog answers Escape/Tab. A key press therefore closes one
  layer at a time, focus never falls back to `body`, and a parent never closes
  while a child dialog is still open (BUG-3/BUG-4).

  Motion is untouched (no transitions are added), so `prefers-reduced-motion`
  behaviour stays whatever the component's own classes declare.
*/

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Ids of the currently open dialogs, outermost first. */
const openDialogs: string[] = [];

export function useDialogFocusTrap(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const dialogId = useId();
  /*
    The effect is keyed on `open` only. Callers pass inline arrow functions for
    `onClose`, so depending on its identity would re-run the trap on every
    parent render and yank focus back to the first control mid-typing. The
    latest callback is mirrored into a ref instead.
  */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    /* This dialog is now the topmost layer until it closes. */
    openDialogs.push(dialogId);
    const isTopmost = () => openDialogs[openDialogs.length - 1] === dialogId;

    const focusable = (): HTMLElement[] => [
      ...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []),
    ];

    /* Opening the dialog moves focus into it. */
    const first = focusable()[0];
    (first ?? panelRef.current)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      /*
        A nested dialog is open: the innermost one owns the keyboard. Bailing
        out here is what keeps Escape from closing every layer at once and keeps
        Tab from leaking into the parent dialog.
      */
      if (!isTopmost()) return;
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const index = openDialogs.indexOf(dialogId);
      if (index >= 0) openDialogs.splice(index, 1);
      /* Focus returns to the trigger (the button that opened the dialog). */
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open, panelRef, dialogId]);
}
