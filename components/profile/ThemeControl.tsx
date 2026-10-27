"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getServerThemePreference,
  readThemePreference,
  setThemePreference,
  subscribeThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const options: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  Icon: typeof Monitor;
}> = [
  { value: "system", label: "Sistem", Icon: Monitor },
  { value: "light", label: "Terang", Icon: Sun },
  { value: "dark", label: "Gelap", Icon: Moon },
];

export function ThemeControl() {
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    readThemePreference,
    getServerThemePreference,
  );

  const choosePreference = (nextPreference: ThemePreference) => {
    setThemePreference(nextPreference);
  };

  return (
    <section aria-labelledby="theme-control-title">
      <div className="mb-3 flex items-center gap-2">
        <Sun className="h-4 w-4 text-blue" aria-hidden="true" />
        <h2 id="theme-control-title" className="font-semibold text-ink">
          Tampilan
        </h2>
      </div>
      <p id="theme-control-description" className="mb-3 text-sm text-ink-2">
        Pilih mode untuk semua halaman aplikasi.
      </p>
      <div
        role="group"
        aria-label="Mode tampilan"
        aria-describedby="theme-control-description"
        className="grid grid-cols-3 gap-1 rounded-full bg-blue-wash p-1"
      >
        {options.map(({ value, label, Icon }) => {
          const selected = preference === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => choosePreference(value)}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 focus-visible:ring-offset-blue-wash",
                selected
                  ? "bg-card text-ink shadow-sm"
                  : "text-ink-2 hover:bg-card/60 hover:text-ink",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
