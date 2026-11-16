"use client";

import Image from "next/image";
import { useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";

type AvatarPreviewProps = {
  name: string;
  src: string | null;
  size?: "large" | "small";
  className?: string;
  interactive?: boolean;
};

export function AvatarPreview({ name, src, size = "small", className = "", interactive = true }: AvatarPreviewProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const dimensions = size === "large" ? 56 : 40;
  const avatarClass = size === "large" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm";

  useDialogFocusTrap(open, dialogRef, () => setOpen(false));

  return (
    <>
      {interactive ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Lihat foto profil ${name}`}
        className={`shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${className}`}
      >
        {src ? (
          <Image
            src={src}
            alt={`Foto profil ${name}`}
            width={dimensions}
            height={dimensions}
            unoptimized
            className={`${avatarClass} rounded-full object-cover ring-2 ring-mint`}
          />
        ) : (
          <span
            aria-hidden="true"
            className={`${avatarClass} flex items-center justify-center rounded-full bg-blue-tint font-bold text-blue ring-2 ring-mint`}
          >
            {initials(name)}
          </span>
        )}
      </button>
      ) : (
        <span className={`block shrink-0 rounded-full ${className}`}>
          {src ? (
            <Image src={src} alt={`Foto profil ${name}`} width={dimensions} height={dimensions} unoptimized className={`${avatarClass} rounded-full object-cover ring-2 ring-mint`} />
          ) : (
            <span className={`${avatarClass} flex items-center justify-center rounded-full bg-blue-tint font-bold text-blue ring-2 ring-mint`}>
              {initials(name)}
            </span>
          )}
        </span>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-scrim/70 p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative flex max-h-[90vh] max-w-[min(90vw,32rem)] flex-col items-center rounded-3xl border border-white/10 bg-card p-4 shadow-2xl"
          >
            <div className="flex w-full items-center justify-between gap-4 px-1 pb-3">
              <h2 id={titleId} className="truncate text-sm font-semibold text-ink">
                Foto profil {name}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup preview foto profil"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-subtle"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {src ? (
              <Image
                src={src}
                alt={`Foto profil ${name}`}
                width={640}
                height={640}
                unoptimized
                className="max-h-[75vh] w-auto max-w-full rounded-2xl object-contain"
              />
            ) : (
              <div className="flex h-64 w-64 items-center justify-center rounded-2xl bg-blue-tint text-6xl font-bold text-blue">
                {initials(name)}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}
