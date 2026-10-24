"use client";

import { useEffect } from "react";

/*
  Marks the document as hydrated. The inline watchdog in the root layout only
  reveals its reload prompt when this flag never appears, which happens when the
  client bundle fails to load or parse (for example a stale chunk after a
  redeploy). Without it a failed boot leaves the user on a silent loading screen.
*/
export function BootSignal() {
  useEffect(() => {
    document.documentElement.dataset.appReady = "true";
  }, []);

  return null;
}
