"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Archive, Check, Plus, RotateCcw, Search, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmActionDialog } from "@/components/ui/ConfirmActionDialog";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { apiRequest } from "@/lib/api-client";
import { institutionMatchesQuery, normalizeInstitutionName } from "@/lib/institution-name";
import { cn } from "@/lib/utils";
import type {
  BankInstitutionDTO,
  InstitutionListDTO,
  UserCustomInstitutionDTO,
  WalletInstitutionDTO,
} from "@/types/api";
import { InstitutionQuickAddSheet } from "./InstitutionQuickAddSheet";

export interface BankPickerSheetProps {
  open: boolean;
  /** Current field value; null means manual. */
  current: WalletInstitutionDTO | null;
  onClose: () => void;
  /** null = Dompet manual / bank lain. */
  onSelect: (choice: WalletInstitutionDTO | null) => void;
}

type PrivateView = "active" | "archived";

type LoadState = {
  loading: boolean;
  error: string | null;
  official: BankInstitutionDTO[];
  custom: UserCustomInstitutionDTO[];
  archivedCustom: UserCustomInstitutionDTO[];
};

const INITIAL_STATE: LoadState = {
  loading: true,
  error: null,
  official: [],
  custom: [],
  archivedCustom: [],
};

function sortByName(rows: UserCustomInstitutionDTO[]): UserCustomInstitutionDTO[] {
  return [...rows].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const archiveDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});

function archivedStatusLabel(archivedAt: string | null): string {
  if (!archivedAt) return "Diarsipkan";
  const date = new Date(archivedAt);
  if (Number.isNaN(date.getTime())) return "Diarsipkan";
  return `Diarsipkan \u00b7 ${archiveDateFormatter.format(date)}`;
}

/*
  Searchable picker with two groups: the global read-only OJK catalog and the
  caller's private Quick Add list (T-011 / design 07 §3). The manual path is
  always available, including in the error and no-match states. Group marks are
  abstract B/P badges, never bank logos.

  Design 07 §4a: the private group owns an Aktif/Arsip view toggle. Active rows
  get a labeled `Arsipkan` action with modal confirmation; archived rows get a
  labeled `Pulihkan` action. Both call the existing owner-only endpoints. No
  route, nav, or global management sheet is added.
*/
export function BankPickerSheet({ open, current, onClose, onSelect }: BankPickerSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<LoadState>(INITIAL_STATE);
  const [privateView, setPrivateView] = useState<PrivateView>("active");
  const [archiveCandidate, setArchiveCandidate] = useState<UserCustomInstitutionDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [officialOffer, setOfficialOffer] = useState<BankInstitutionDTO | null>(null);
  const focusNonce = useRef(0);
  const [focusRequest, setFocusRequest] = useState<{ target: string; nonce: number } | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        const response = await apiRequest<InstitutionListDTO>("/api/institutions");
        if (!active) return;
        if (response.status === 401) {
          setState({
            ...INITIAL_STATE,
            loading: false,
            error: "Sesi berakhir. Masuk lagi untuk memilih bank.",
          });
          return;
        }
        if (!response.ok || !response.data) {
          setState({
            ...INITIAL_STATE,
            loading: false,
            error: response.data?.error?.message ?? "Daftar bank belum bisa dimuat.",
          });
          return;
        }
        setState({
          loading: false,
          error: null,
          official: response.data.official ?? [],
          custom: response.data.custom ?? [],
          archivedCustom: response.data.archivedCustom ?? [],
        });
      } catch {
        if (!active) return;
        setState({
          ...INITIAL_STATE,
          loading: false,
          error: "Daftar bank belum bisa dimuat. Periksa koneksimu lalu coba lagi.",
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [open, reloadToken]);

  /* Focus return after archive/restore, per design 07 §4a.4. */
  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.target === "active-tab") {
      document.getElementById("bank-private-tab-active")?.focus();
    } else {
      panelRef.current
        ?.querySelector<HTMLElement>(`[data-private-focus="${focusRequest.target}"]`)
        ?.focus();
    }
  }, [focusRequest]);

  const requestFocus = (target: string) => {
    focusNonce.current += 1;
    setFocusRequest({ target, nonce: focusNonce.current });
  };

  const retry = () => {
    setState((previous) => ({ ...previous, loading: true, error: null }));
    setReloadToken((token) => token + 1);
  };

  useDialogFocusTrap(open, panelRef, onClose);

  if (!open) return null;

  const normalizedQuery = normalizeInstitutionName(query);
  const official = normalizedQuery
    ? state.official.filter((row) => institutionMatchesQuery(normalizeInstitutionName(row.name), query))
    : state.official;
  const custom = normalizedQuery
    ? state.custom.filter((row) => institutionMatchesQuery(normalizeInstitutionName(row.name), query))
    : state.custom;
  const archivedCustom = normalizedQuery
    ? state.archivedCustom.filter((row) =>
        institutionMatchesQuery(normalizeInstitutionName(row.name), query),
      )
    : state.archivedCustom;

  const currentInList = current
    ? current.kind === "OFFICIAL"
      ? state.official.some((row) => row.id === current.id)
      : current.id !== null && state.custom.some((row) => row.id === current.id)
    : false;
  const showCurrentLabel = current !== null && !currentInList;

  const selectedId =
    current && current.kind === "OFFICIAL"
      ? current.id
      : current && current.kind === "CUSTOM" && current.id
        ? current.id
        : null;

  const choose = (choice: WalletInstitutionDTO) => {
    onSelect(choice);
    onClose();
  };

  const chooseManual = () => {
    onSelect(null);
    onClose();
  };

  const resetManagementFeedback = () => {
    setManageError(null);
    setOfficialOffer(null);
  };

  const changePrivateView = (view: PrivateView) => {
    setPrivateView(view);
    setArchiveCandidate(null);
    resetManagementFeedback();
  };

  const handleSaved = (entry: UserCustomInstitutionDTO) => {
    setState((previous) => {
      const rows = previous.custom.some((row) => row.id === entry.id)
        ? previous.custom.map((row) => (row.id === entry.id ? entry : row))
        : [...previous.custom, entry];
      return {
        ...previous,
        custom: sortByName(rows),
        archivedCustom: previous.archivedCustom.filter((row) => row.id !== entry.id),
      };
    });
    setPrivateView("active");
    setQuickAddOpen(false);
    setQuery("");
    setFocusedId(entry.id);
    setNotice("Entri yang kamu tambahkan baru saja terpilih di daftar pribadimu.");
    resetManagementFeedback();
    onSelect({ kind: "CUSTOM", id: entry.id, name: entry.name });
  };

  const handleRouteToExisting = (existing: WalletInstitutionDTO) => {
    setQuickAddOpen(false);
    setQuery("");
    setFocusedId(existing.id);
    resetManagementFeedback();
    setNotice(
      existing.kind === "OFFICIAL"
        ? "Nama itu sudah ada di bank resmi, jadi dipilih dari katalog."
        : "Nama itu sudah ada di daftar pribadimu, jadi entri lama dipilih.",
    );
    onSelect(existing);
  };

  const handleArchive = async (entry: UserCustomInstitutionDTO) => {
    setBusyId(entry.id);
    setNotice(null);
    resetManagementFeedback();
    try {
      const response = await apiRequest<UserCustomInstitutionDTO>(
        `/api/institutions/custom/${entry.id}/archive`,
        { method: "POST" },
      );
      if (!response.ok || !response.data) {
        setManageError(
          response.data?.error?.message ?? "Entri belum bisa diarsipkan. Coba lagi.",
        );
        return;
      }
      const archived = response.data;
      const index = custom.findIndex((row) => row.id === entry.id);
      const nextId = custom[index + 1]?.id ?? custom[index - 1]?.id ?? null;

      setState((previous) => ({
        ...previous,
        custom: previous.custom.filter((row) => row.id !== entry.id),
        archivedCustom: sortByName([
          ...previous.archivedCustom.filter((row) => row.id !== entry.id),
          archived,
        ]),
      }));
      setArchiveCandidate(null);
      setNotice(`${entry.name} diarsipkan. Lihat tab Arsip untuk memulihkan.`);
      requestFocus(nextId ?? "active-tab");
    } catch {
      setManageError("Entri belum bisa diarsipkan. Periksa koneksimu lalu coba lagi.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (entry: UserCustomInstitutionDTO) => {
    setBusyId(entry.id);
    setNotice(null);
    resetManagementFeedback();
    try {
      const response = await apiRequest<UserCustomInstitutionDTO>(
        `/api/institutions/custom/${entry.id}/restore`,
        { method: "POST" },
      );
      if (!response.ok || !response.data) {
        const existing = response.data?.error?.existing;
        if (response.status === 409 && existing?.kind === "OFFICIAL") {
          setManageError(
            "Nama ini sekarang sudah ada di katalog resmi, jadi entri pribadi tidak dipulihkan. Pilih bank resmi itu dari daftar.",
          );
          setOfficialOffer({ id: existing.id, name: existing.name });
          return;
        }
        setManageError(
          response.data?.error?.message ?? "Entri belum bisa dipulihkan. Coba lagi.",
        );
        return;
      }
      const restored = response.data;
      setState((previous) => ({
        ...previous,
        custom: sortByName([
          ...previous.custom.filter((row) => row.id !== restored.id),
          restored,
        ]),
        archivedCustom: previous.archivedCustom.filter((row) => row.id !== restored.id),
      }));
      setPrivateView("active");
      setNotice(
        `${restored.name} dipulihkan. Entri kini tersedia kembali di daftar pilihanmu.`,
      );
      requestFocus(restored.id);
    } catch {
      setManageError("Entri belum bisa dipulihkan. Periksa koneksimu lalu coba lagi.");
    } finally {
      setBusyId(null);
    }
  };

  const total = state.official.length + state.custom.length + state.archivedCustom.length;
  const hasFilteredResults = official.length + custom.length + archivedCustom.length > 0;
  const showPrivateGroup = custom.length > 0 || archivedCustom.length > 0;

  return (
    <>
      <div
        className="fixed inset-0 z-[80] flex items-end justify-center bg-scrim/40 sm:items-center sm:p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          aria-labelledby="bank-picker-title"
          className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-card-border bg-card p-5 shadow-2xl sm:rounded-3xl sm:p-6"
        >
          <div className="flex items-center justify-between">
            <h2 id="bank-picker-title" className="text-lg font-semibold tracking-tight text-ink">
              Pilih bank atau penyedia
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup pilih bank atau penyedia"
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-blue-wash"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4">
            <Input
              id="institution-search"
              label="Cari bank atau penyedia"
              value={query}
              maxLength={80}
              placeholder="Cari nama bank/penyedia..."
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
                setFocusedId(null);
                setArchiveCandidate(null);
                setNotice(null);
                resetManagementFeedback();
              }}
            />
          </div>

          {showCurrentLabel && current && !state.loading && !state.error ? (
            <div className="mt-3 rounded-2xl border border-card-border bg-blue-wash px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                Label saat ini
              </p>
              <p className="mt-0.5 break-words text-sm font-medium text-ink">{current.name}</p>
              <p className="mt-1 text-xs text-placeholder">
                {current.kind === "OFFICIAL"
                  ? "Bank ini tidak lagi tersedia untuk pilihan baru. Label lama tetap tersimpan di dompet."
                  : current.id === null
                    ? "Label ini metadata dompet. Daftar bank/penyedia pribadi tidak dibagikan ke anggota lain."
                    : "Entri ini sudah diarsipkan. Label lama tetap tersimpan di dompet."}
              </p>
            </div>
          ) : null}

          {notice ? (
            <p
              role="status"
              aria-live="polite"
              className="mt-3 rounded-2xl bg-mint px-4 py-3 text-sm font-medium text-green"
            >
              {notice}
            </p>
          ) : null}

          {state.loading ? (
            <div className="mt-4 space-y-3" aria-busy="true" aria-label="Memuat bank dan penyedia">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : state.error ? (
            <div
              role="alert"
              className="mt-4 rounded-2xl border border-danger-border bg-danger-bg px-4 py-4 text-center"
            >
              <p className="text-sm font-medium text-danger">{state.error}</p>
              <button
                type="button"
                onClick={retry}
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand-green px-5 text-sm font-semibold text-white hover:bg-brand-green-hover"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                Coba lagi
              </button>
            </div>
          ) : total === 0 ? (
            <div className="mt-4 rounded-2xl bg-blue-wash px-4 py-5 text-center">
              <p className="text-sm text-ink-2">
                Katalog bank resmi belum tersedia. Kamu tetap bisa menambah bank/penyedia pribadi
                atau membuat dompet manual.
              </p>
            </div>
          ) : !hasFilteredResults ? (
            <div className="mt-4 rounded-2xl bg-blue-wash px-4 py-5 text-center">
              <p className="text-sm font-medium text-ink">Tidak ada yang cocok.</p>
              <p className="mt-1 text-sm text-ink-2">
                Tambahkan sebagai entri pribadi, atau buat dompet manual tanpa label bank.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-5">
              {state.official.length === 0 && (state.custom.length > 0 || state.archivedCustom.length > 0) ? (
                <p className="rounded-2xl bg-blue-wash px-4 py-3 text-xs text-ink-2">
                  Katalog bank resmi belum tersedia. Entri pribadi dan dompet manual tetap bisa
                  dipakai.
                </p>
              ) : null}
              {official.length > 0 ? (
                <InstitutionGroup
                  title="Bank resmi (daftar publik OJK)"
                  description="Hanya bisa dilihat; user tidak bisa mengubah isinya. Snapshot lokal daftar OJK."
                  mark="B"
                  rows={official.map((row) => ({ id: row.id, name: row.name, kind: "OFFICIAL" as const }))}
                  selectedId={selectedId}
                  focusedId={focusedId}
                  onFocus={setFocusedId}
                  onSelect={choose}
                />
              ) : null}
              {showPrivateGroup ? (
                <PrivateInstitutionGroup
                  view={privateView}
                  activeRows={custom}
                  archivedRows={archivedCustom}
                  selectedId={selectedId}
                  busyId={busyId}
                  error={manageError}
                  officialOffer={officialOffer}
                  onSelect={choose}
                  onViewChange={changePrivateView}
                  onRequestArchive={(row) => {
                    setArchiveCandidate(row);
                    resetManagementFeedback();
                  }}
                  onRestore={handleRestore}
                  onChooseOfficialOffer={(bank) =>
                    choose({ kind: "OFFICIAL", id: bank.id, name: bank.name })
                  }
                  onTabKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    const next: PrivateView = privateView === "active" ? "archived" : "active";
                    changePrivateView(next);
                    document.getElementById(`bank-private-tab-${next}`)?.focus();
                  }}
                />
              ) : null}
            </div>
          )}

          <div className="mt-5 space-y-2 border-t border-row-divider pt-4">
            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-blue bg-card px-5 text-sm font-semibold text-blue hover:bg-blue-wash"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Tambah bank atau penyedia
            </button>
            <button
              type="button"
              onClick={chooseManual}
              className="inline-flex min-h-11 w-full flex-col items-start rounded-2xl border border-dashed border-blue bg-card px-4 py-2.5 text-left hover:bg-blue-wash"
            >
              <span className="text-sm font-semibold text-ink">Dompet manual / bank lain</span>
              <span className="text-xs text-placeholder">
                Buat dompet tanpa label bank. Nama dompet tetap kamu isi sendiri.
              </span>
            </button>
            <p className="rounded-2xl bg-blue-wash px-4 py-3 text-xs text-ink-2">
              Entri pribadi hanya terlihat olehmu. Jika dipakai di dompet Bersama, nama bank tampil
              sebagai metadata dompet bagi anggota yang berhak melihatnya.
            </p>
          </div>
        </div>
      </div>

      <InstitutionQuickAddSheet
        key={quickAddOpen ? `add-${query}` : "add-closed"}
        open={quickAddOpen}
        initialName={query}
        official={state.official}
        custom={state.custom}
        onClose={() => setQuickAddOpen(false)}
        onSaved={handleSaved}
        onRouteToExisting={handleRouteToExisting}
      />
      <ConfirmActionDialog
        open={archiveCandidate !== null}
        title="Arsipkan entri?"
        description={
          archiveCandidate
            ? `“${archiveCandidate.name}” akan disembunyikan dari pilihan baru. Label di dompet yang sudah memakainya tetap tampil, dan entri bisa dipulihkan dari tab Arsip.`
            : "Entri akan disembunyikan dari pilihan baru dan bisa dipulihkan dari tab Arsip."
        }
        confirmLabel="Arsipkan entri"
        busy={archiveCandidate !== null && busyId === archiveCandidate.id}
        error={manageError}
        onCancel={() => {
          if (archiveCandidate && busyId === archiveCandidate.id) return;
          const id = archiveCandidate?.id;
          setArchiveCandidate(null);
          setManageError(null);
          if (id) requestFocus(id);
        }}
        onConfirm={() => {
          if (archiveCandidate) void handleArchive(archiveCandidate);
        }}
      />
    </>
  );
}

type InstitutionRow = { id: string; name: string; kind: "OFFICIAL" | "CUSTOM" };

function InstitutionGroup({
  title,
  description,
  mark,
  rows,
  selectedId,
  focusedId,
  onFocus,
  onSelect,
}: {
  title: string;
  description: string;
  mark: "B" | "P";
  rows: InstitutionRow[];
  selectedId: string | null;
  focusedId: string | null;
  onFocus: (id: string) => void;
  onSelect: (choice: WalletInstitutionDTO) => void;
}) {
  const tabbableId =
    (focusedId && rows.some((row) => row.id === focusedId) ? focusedId : null) ??
    (selectedId && rows.some((row) => row.id === selectedId) ? selectedId : null) ??
    rows[0]?.id ??
    null;

  const move = (direction: 1 | -1, currentId: string) => {
    const index = rows.findIndex((row) => row.id === currentId);
    const next = rows[(index + direction + rows.length) % rows.length];
    if (next) onFocus(next.id);
  };

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-3">{title}</h3>
      <p className="mt-0.5 text-xs text-placeholder">{description}</p>
      <ul role="listbox" aria-label={title} className="mt-2 space-y-1">
        {rows.map((row) => {
          const selected = row.id === selectedId;
          return (
            <li key={row.id} role="none">
              <button
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={row.id === tabbableId ? 0 : -1}
                data-institution-option={row.id}
                onFocus={() => onFocus(row.id)}
                onClick={() => onSelect({ kind: row.kind, id: row.id, name: row.name })}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                  event.preventDefault();
                  move(event.key === "ArrowDown" ? 1 : -1, row.id);
                  const nextId = (() => {
                    const index = rows.findIndex((item) => item.id === row.id);
                    return rows[(index + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length]?.id;
                  })();
                  if (nextId) {
                    document
                      .querySelector<HTMLElement>(`[data-institution-option="${nextId}"]`)
                      ?.focus();
                  }
                }}
                className={cn(
                  "flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left hover:bg-blue-wash",
                  selected ? "border-blue bg-blue-wash ring-1 ring-blue" : "border-card-border",
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      row.kind === "OFFICIAL"
                        ? "bg-blue-tint text-blue"
                        : "bg-mint text-green",
                    )}
                  >
                    {mark}
                  </span>
                  <span className="min-w-0 break-words text-[15px] font-medium text-ink">
                    {row.name}
                    {selected ? <span className="sr-only"> (terpilih)</span> : null}
                  </span>
                </span>
                {selected ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-blue">
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Dipilih
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PrivateInstitutionGroup({
  view,
  activeRows,
  archivedRows,
  selectedId,
  busyId,
  error,
  officialOffer,
  onSelect,
  onViewChange,
  onRequestArchive,
  onRestore,
  onChooseOfficialOffer,
  onTabKeyDown,
}: {
  view: PrivateView;
  activeRows: UserCustomInstitutionDTO[];
  archivedRows: UserCustomInstitutionDTO[];
  selectedId: string | null;
  busyId: string | null;
  error: string | null;
  officialOffer: BankInstitutionDTO | null;
  onSelect: (choice: WalletInstitutionDTO) => void;
  onViewChange: (view: PrivateView) => void;
  onRequestArchive: (row: UserCustomInstitutionDTO) => void;
  onRestore: (row: UserCustomInstitutionDTO) => void;
  onChooseOfficialOffer: (bank: BankInstitutionDTO) => void;
  onTabKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-3">
        Bank/penyedia pribadiku
      </h3>
      <p className="mt-0.5 text-xs text-placeholder">
        Tersimpan di daftar pribadimu; tidak menjadi pilihan bagi user lain.
      </p>

      <div
        className="mt-2 inline-flex gap-1 rounded-full bg-blue-wash p-1"
        role="tablist"
        aria-label="Tampilan bank/penyedia pribadi"
      >
        {(
          [
            ["active", "Aktif"],
            ["archived", "Arsip"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            id={`bank-private-tab-${value}`}
            type="button"
            role="tab"
            aria-selected={view === value}
            aria-controls="bank-private-panel"
            tabIndex={view === value ? 0 : -1}
            onClick={() => onViewChange(value)}
            onKeyDown={onTabKeyDown}
            className={cn(
              "flex min-h-11 min-w-[76px] items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors motion-reduce:transition-none",
              view === value ? "bg-card text-ink shadow-sm" : "text-ink-2",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="mt-2 text-xs text-placeholder">
        Entri diarsip tidak dihapus: label bank pada dompet yang sudah memakainya tetap tampil.
      </p>

      {error ? (
        <div
          role="alert"
          className="mt-2 rounded-2xl border border-danger-border bg-danger-bg px-3 py-2.5"
        >
          <p className="text-sm font-medium text-danger">{error}</p>
          {officialOffer ? (
            <button
              type="button"
              onClick={() => onChooseOfficialOffer(officialOffer)}
              className="mt-2 inline-flex min-h-11 items-center rounded-full bg-card px-4 text-sm font-semibold text-blue ring-1 ring-blue hover:bg-blue-wash"
            >
              Pilih {officialOffer.name}
            </button>
          ) : null}
        </div>
      ) : null}

      <div id="bank-private-panel" role="tabpanel" aria-labelledby={`bank-private-tab-${view}`}>
        {view === "active" ? (
          activeRows.length === 0 ? (
            <p className="mt-2 rounded-2xl bg-blue-wash px-4 py-3 text-sm text-ink-2">
              Belum ada entri pribadi di tampilan Aktif.
            </p>
          ) : (
            <ul aria-label="Bank/penyedia pribadiku" className="mt-2 space-y-1">
              {activeRows.map((row) => {
                const selected = row.id === selectedId;
                const busy = busyId === row.id;
                return (
                  <li
                    key={row.id}
                    className={cn(
                      "rounded-2xl border px-2 py-1.5",
                      selected ? "border-blue bg-blue-wash" : "border-card-border",
                    )}
                  >
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-current={selected ? "true" : undefined}
                        aria-label={`Pilih ${row.name}${selected ? " (terpilih)" : ""}`}
                        data-private-focus={row.id}
                        onClick={() =>
                          onSelect({ kind: "CUSTOM", id: row.id, name: row.name })
                        }
                        onKeyDown={(event) => {
                          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                          event.preventDefault();
                          const index = activeRows.findIndex((item) => item.id === row.id);
                          const nextId =
                            activeRows[
                              (index + (event.key === "ArrowDown" ? 1 : -1) + activeRows.length) %
                                activeRows.length
                            ]?.id;
                          if (nextId) {
                            document
                              .querySelector<HTMLElement>(`[data-private-focus="${nextId}"]`)
                              ?.focus();
                          }
                        }}
                        className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-2 py-1 text-left hover:bg-card/70"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mint text-xs font-bold text-green"
                          >
                            P
                          </span>
                          <span className="min-w-0 break-words text-[15px] font-medium text-ink">
                            {row.name}
                            {selected ? <span className="sr-only"> (terpilih)</span> : null}
                          </span>
                        </span>
                        {selected ? (
                          <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-blue">
                            <Check className="h-4 w-4" aria-hidden="true" />
                            Dipilih
                          </span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRequestArchive(row)}
                        disabled={busy}
                        aria-label={`Arsipkan ${row.name}`}
                        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold text-danger hover:bg-danger-bg disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                        Arsipkan
                      </button>
                    </div>

                  </li>
                );
              })}
            </ul>
          )
        ) : archivedRows.length === 0 ? (
          <p className="mt-2 rounded-2xl bg-blue-wash px-4 py-3 text-sm text-ink-2">
            Belum ada entri di Arsip. Entri yang kamu arsipkan lewat tombol Arsipkan tampil di
            sini.
          </p>
        ) : (
          <ul aria-label="Bank/penyedia pribadi di Arsip" className="mt-2 space-y-1">
            {archivedRows.map((row) => {
              const busy = busyId === row.id;
              return (
                <li
                  key={row.id}
                  className="rounded-2xl border border-card-border px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mint text-xs font-bold text-green"
                      >
                        P
                      </span>
                      <div className="min-w-0">
                        <p className="break-words text-[15px] font-medium text-ink">
                          {row.name}
                        </p>
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning">
                          <Archive className="h-3 w-3" aria-hidden="true" />
                          {archivedStatusLabel(row.archivedAt)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRestore(row)}
                      disabled={busy}
                      aria-label={`Pulihkan ${row.name}`}
                      data-private-focus={row.id}
                      className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold text-green hover:bg-mint disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      {busy ? "Memulihkan..." : "Pulihkan"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
