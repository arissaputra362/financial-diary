"use client";

import { useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { apiRequest, idempotencyHeaders } from "@/lib/api-client";
import { INSTITUTION_NAME_MAX_LENGTH, normalizeInstitutionName } from "@/lib/institution-name";
import type {
  BankInstitutionDTO,
  UserCustomInstitutionDTO,
  WalletInstitutionDTO,
} from "@/types/api";

export interface InstitutionQuickAddSheetProps {
  open: boolean;
  initialName?: string;
  official: BankInstitutionDTO[];
  custom: UserCustomInstitutionDTO[];
  onClose: () => void;
  /** New or reactivated private row; the picker selects it immediately. */
  onSaved: (entry: UserCustomInstitutionDTO) => void;
  /** Duplicate official/private name: route to the existing selectable row. */
  onRouteToExisting: (existing: WalletInstitutionDTO) => void;
}

/*
  "Tambah bank atau penyedia" (T-011 / design 07 §4). One required name field,
  no classification. The entry is saved immediately in the private list, so a
  later wallet cancel never removes it. Duplicate names are normalized with the
  same helper the server uses; the server remains authoritative.
*/
export function InstitutionQuickAddSheet({
  open,
  initialName = "",
  official,
  custom,
  onClose,
  onSaved,
  onRouteToExisting,
}: InstitutionQuickAddSheetProps) {
  const [name, setName] = useState(initialName);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useDialogFocusTrap(open, panelRef, onClose);

  if (!open) return null;

  const normalized = normalizeInstitutionName(name);
  const officialMatch = normalized
    ? official.find((row) => normalizeInstitutionName(row.name) === normalized)
    : undefined;
  const customMatch = normalized
    ? custom.find((row) => normalizeInstitutionName(row.name) === normalized)
    : undefined;
  const duplicate = officialMatch ?? customMatch ?? null;
  const duplicateKind = officialMatch ? "OFFICIAL" : customMatch ? "CUSTOM" : null;

  const routeToDuplicate = () => {
    const match = officialMatch ?? customMatch;
    if (!match) return;
    onRouteToExisting({
      kind: officialMatch ? "OFFICIAL" : "CUSTOM",
      id: match.id,
      name: match.name,
    });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldError(null);

    const displayName = name.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (!displayName) {
      setFieldError("Nama bank atau penyedia belum diisi.");
      return;
    }
    if (displayName.length > INSTITUTION_NAME_MAX_LENGTH) {
      setFieldError(
        `Nama bank atau penyedia maksimal ${INSTITUTION_NAME_MAX_LENGTH} karakter.`,
      );
      return;
    }
    if (duplicate) {
      setFieldError("Nama ini sudah ada. Pilih dari daftar resmi/pribadi, atau gunakan nama lain.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiRequest<UserCustomInstitutionDTO>("/api/institutions/custom", {
        method: "POST",
        headers: { "content-type": "application/json", ...idempotencyHeaders() },
        body: JSON.stringify({ name: displayName }),
      });

      if (response.status === 401) {
        setFormError("Sesi berakhir. Masuk lagi untuk menyimpan.");
        return;
      }
      if (response.status === 409) {
        const existing = response.data?.error?.existing;
        if (existing) {
          onRouteToExisting(existing);
          return;
        }
        setFormError("Nama ini sudah ada. Pilih dari daftar atau gunakan nama lain.");
        return;
      }
      if (!response.ok || !response.data) {
        setFieldError(response.data?.error?.fieldErrors?.name?.[0] ?? null);
        setFormError(response.data?.error?.message ?? "Entri belum tersimpan. Coba lagi.");
        return;
      }
      onSaved(response.data);
    } catch {
      setFormError("Entri belum tersimpan. Periksa koneksimu lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[#14273F]/40 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="institution-add-title"
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#D8E2EE] bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 id="institution-add-title" className="text-lg font-semibold tracking-tight text-[#17304F]">
            Tambah bank atau penyedia
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Tutup tambah bank atau penyedia"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#46597A] hover:bg-[#EFF4FA] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit} noValidate className="mt-4 space-y-4">
          <Input
            id="institution-name"
            label="Nama bank atau penyedia"
            value={name}
            maxLength={INSTITUTION_NAME_MAX_LENGTH}
            error={fieldError ?? undefined}
            helperText="Entri ini tersimpan di daftar pribadimu dan tidak menjadi pilihan bagi user lain."
            placeholder="mis. Bank Daerah Kota"
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
              setFieldError(null);
              setFormError(null);
            }}
          />

          {duplicate ? (
            <div
              role="alert"
              className="rounded-2xl border border-[#F3C2C2] bg-[#FDECEC] px-4 py-3 text-sm text-[#B91C1C]"
            >
              <p>
                Nama ini sudah ada. Pilih dari daftar{" "}
                {duplicateKind === "OFFICIAL" ? "resmi" : "pribadi"}, atau gunakan nama lain.
              </p>
              <button
                type="button"
                onClick={routeToDuplicate}
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#B91C1C]/30 bg-white px-4 text-sm font-semibold text-[#B91C1C] hover:bg-[#FDECEC]"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Pilih {duplicateKind === "OFFICIAL" ? "dari bank resmi" : "entri pribadi ini"}
              </button>
            </div>
          ) : name.trim() ? (
            <p className="rounded-2xl bg-[#EFF4FA] px-4 py-3 text-xs text-[#46597A]">
              Belum ada di daftar yang kamu lihat? Simpan sebagai entri pribadi. Entri tidak pernah
              otomatis masuk ke katalog resmi.
            </p>
          ) : null}

          {formError ? (
            <p role="alert" className="rounded-2xl bg-[#FDECEC] px-4 py-3 text-sm text-[#B91C1C]">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <Button
              type="submit"
              size="lg"
              isLoading={submitting}
              loadingLabel="Menyimpan"
              disabled={duplicate !== null || submitting}
              className="sm:flex-1"
            >
              Simpan
            </Button>
            <Button type="button" variant="secondary" size="lg" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
