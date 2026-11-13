"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keeps a dialog mounted for the exit animation, then runs the real close.
 * Call `requestClose` from the X button, overlay, and Escape paths.
 */
export function useAnimatedClose(onClose: () => void, duration = 220) {
  const [closing, setClosing] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const requestClose = () => {
    if (timeoutRef.current !== null) return;
    setClosing(true);
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      onClose();
      /* The dialog may stay mounted with `open=false`; clear the exit state
         so the next open plays the normal entry animation instead of reopening
         with the closing class attached. */
      setClosing(false);
    }, duration);
  };

  return { closing, requestClose };
}
