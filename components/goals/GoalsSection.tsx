"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, RefreshCw, Target, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiRequest, idempotencyHeaders } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Skeleton } from "@/components/ui/Skeleton";
import { UndoToast } from "@/components/transactions/UndoToast";
import { formatDateLabel, todayJakarta } from "@/lib/dates";
import { formatIDR } from "@/lib/format";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import type { GoalDTO, GoalListDTO } from "@/types/api";

/*
  Goals section on /budget (AC-F4-1..AC-F4-4). The server owns every number:
  progressPercent arrives capped, saved amounts change only through the
  delta endpoint, and trashing is a soft delete with a 5-second undo toast
  (separate restore call, AGENTS.md §5).
 */

type TrashListDTO = { rows: GoalDTO[]; nextCursor: string | null };

type AdjustTarget = { id: string; name: string; direction: "add" | "subtract" };

export function GoalsSection() {
  const router = useRouter();
  const [goals, setGoals] = useState<GoalDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [adjust, setAdjust] = useState<AdjustTarget | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const adjustPanelRef = useRef<HTMLDivElement>(null);

  const [showTrash, setShowTrash] = useState(false);
  const [trash, setTrash] = useState<GoalDTO[] | null>(null);
  const [trashLoading, setTrashLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null);

  useDialogFocusTrap(adjust !== null, adjustPanelRef, () => setAdjust(null));

  const reload = useCallback(async () => {
    const response = await apiRequest<GoalListDTO>("/api/goals");
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (!response.ok || !response.data) {
      setLoadError(true);
      return;
    }
    setGoals(response.data.rows);
    setLoadError(false);
  }, [router]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      await reload();
      if (active) setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [reloadToken, reload]);

  const loadTrash = async () => {
    setTrashLoading(true);
    const response = await apiRequest<TrashListDTO>("/api/goals/trash");
    if (response.ok && response.data) setTrash(response.data.rows);
    setTrashLoading(false);
  };

  const toggleTrash = () => {
    const next = !showTrash;
    setShowTrash(next);
    if (next) void loadTrash();
  };

  const parsedTarget = target ? Number(target) : 0;
  const nameValid = name.trim().length > 0 && name.trim().length <= 80;
  const targetValid = Number.isInteger(parsedTarget) && parsedTarget > 0;

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!nameValid) {
      setFormError("Nama target tidak boleh kosong dan maksimal 80 karakter.");
      return;
    }
    if (!targetValid) {
      setFormError("Target harus lebih dari 0.");
      return;
    }
    setCreating(true);
    const response = await apiRequest<GoalDTO>("/api/goals", {
      method: "POST",
      headers: { "content-type": "application/json", ...idempotencyHeaders() },
      body: JSON.stringify({
        name: name.trim(),
        targetAmountMinor: parsedTarget,
        ...(deadline ? { deadline } : {}),
      }),
    });
    setCreating(false);
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (response.status === 201 && response.data) {
      setGoals((rows) => [...(rows ?? []), response.data as GoalDTO]);
      setName("");
      setTarget("");
      setDeadline("");
      return;
    }
    const fieldMessage = response.data?.error?.fieldErrors;
    setFormError(
      fieldMessage?.targetAmountMinor?.[0] ??
        fieldMessage?.name?.[0] ??
        response.data?.error?.message ??
        "Target belum bisa dibuat. Coba lagi.",
    );
  };

  const startAdjust = (goal: GoalDTO, direction: "add" | "subtract") => {
    setAdjust({ id: goal.id, name: goal.name, direction });
    setAdjustAmount("");
    setAdjustError(null);
  };

  const submitAdjust = async () => {
    if (!adjust) return;
    const amount = adjustAmount ? Number(adjustAmount) : 0;
    if (!Number.isInteger(amount) || amount <= 0) {
      setAdjustError("Masukkan jumlah dalam rupiah, lebih dari 0.");
      return;
    }
    const delta = adjust.direction === "add" ? amount : -amount;
    setAdjusting(true);
    const response = await apiRequest<GoalDTO>(`/api/goals/${adjust.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ savedDelta: delta }),
    });
    setAdjusting(false);
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (response.ok && response.data) {
      setGoals((rows) => rows?.map((row) => (row.id === adjust.id ? (response.data as GoalDTO) : row)) ?? rows);
      setAdjust(null);
      return;
    }
    setAdjustError(
      response.data?.error?.fieldErrors?.savedDelta?.[0] ??
        response.data?.error?.message ??
        "Jumlah belum bisa disimpan. Coba lagi.",
    );
  };

  const handleTrash = async (goal: GoalDTO) => {
    const response = await apiRequest<GoalDTO>(`/api/goals/${goal.id}/trash`, { method: "POST" });
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (response.ok) {
      setGoals((rows) => rows?.filter((row) => row.id !== goal.id) ?? rows);
      setTrash((rows) => rows?.filter((row) => row.id !== goal.id) ?? rows);
      setUndo({ id: goal.id, name: goal.name });
    }
  };

  const undoTrash = async () => {
    if (!undo) return;
    const response = await apiRequest<GoalDTO>(`/api/goals/${undo.id}/restore`, { method: "POST" });
    if (response.ok && response.data) {
      setGoals((rows) => [...(rows ?? []), response.data as GoalDTO]);
      setTrash((rows) => rows?.filter((row) => row.id !== undo.id) ?? rows);
    }
    setUndo(null);
  };

  const handleRestore = async (goal: GoalDTO) => {
    setRestoringId(goal.id);
    const response = await apiRequest<GoalDTO>(`/api/goals/${goal.id}/restore`, { method: "POST" });
    setRestoringId(null);
    if (response.ok && response.data) {
      setTrash((rows) => rows?.filter((row) => row.id !== goal.id) ?? rows);
      setGoals((rows) => [...(rows ?? []), response.data as GoalDTO]);
    }
  };

  if (loading) {
    return (
      <section aria-labelledby="goals-title" className="rounded-3xl border border-[#D8E2EE] bg-white p-6 shadow-bento">
        <h2 id="goals-title" className="text-lg font-semibold text-[#17304F]">
          Target tabungan
        </h2>
        <Skeleton className="mt-4 h-40 w-full" />
      </section>
    );
  }

  if (loadError) {
    return (
      <section aria-labelledby="goals-title" className="rounded-3xl border border-[#F3C2C2] bg-[#FDECEC] p-6 text-center">
        <p className="text-[15px] font-semibold text-[#B91C1C]">Target tabungan belum bisa dimuat.</p>
        <p className="mt-1 text-sm text-[#46597A]">Periksa koneksimu lalu coba lagi.</p>
        <button
          type="button"
          onClick={() => setReloadToken((token) => token + 1)}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#166534] px-5 text-sm font-semibold text-white hover:bg-[#155C30]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Muat ulang target
        </button>
      </section>
    );
  }

  const today = todayJakarta();

  return (
    <section
      id="goals"
      aria-labelledby="goals-title"
      data-testid="goals-section"
      className="rounded-3xl border border-[#BBE5C7] bg-[#DCFCE7] p-6 shadow-bento"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="goals-title" className="flex items-center gap-2 text-lg font-semibold text-[#17304F]">
          <Target className="h-5 w-5 text-[#166534]" aria-hidden="true" />
          Target tabungan
        </h2>
        <span className="shrink-0 rounded-full bg-white/75 px-3 py-1 text-xs font-semibold text-[#46597A]">
          {goals?.length ?? 0} aktif
        </span>
      </div>

      {goals && goals.length > 0 ? (
        <ul className="mt-5 space-y-6">
          {goals.map((goal) => {
            const isLate = goal.deadline !== null && goal.deadline < today;
            return (
              <li key={goal.id} data-testid="goal-item" className="rounded-2xl bg-white/75 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold leading-snug text-[#17304F]">{goal.name}</p>
                    {isLate ? (
                      <span
                        data-testid="goal-late-badge"
                        className="mt-1 inline-block rounded-full bg-[#FDF3D7] px-2.5 py-0.5 text-[11px] font-semibold text-[#8A5A00]"
                      >
                        Melewati tenggat {formatDateLabel(goal.deadline as string)}
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-[#166534]">{goal.progressPercent}%</span>
                </div>
                <div
                  className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#E5EDF5]"
                  role="img"
                  aria-label={`${goal.name} ${goal.progressPercent} persen`}
                >
                  <div
                    className="h-full rounded-full bg-[#166534] transition-all duration-500"
                    style={{ width: `${goal.progressPercent}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs font-semibold text-[#46597A]">
                  <span className="whitespace-nowrap tabular-nums">
                    Terkumpul {formatIDR(goal.savedAmountMinor)}
                  </span>
                  <span className="font-normal tabular-nums text-[#46597A]">
                    dari {formatIDR(goal.targetAmountMinor)}
                    {goal.deadline ? ` * ${formatDateLabel(goal.deadline)}` : ""}
                    {` * genggam: ${formatIDR(goal.targetAmountMinor - goal.savedAmountMinor)} lagi`}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startAdjust(goal, "add")}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#BBE5C7] bg-white px-4 text-sm font-semibold text-[#166534] hover:bg-[#EFF4FA]"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Catat progres
                  </button>
                  <button
                    type="button"
                    onClick={() => startAdjust(goal, "subtract")}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#BFD3E8] bg-white px-4 text-sm font-semibold text-[#1D4F87] hover:bg-[#EFF4FA]"
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                    Koreksi progres
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleTrash(goal)}
                    aria-label={`Hapus target ${goal.name}`}
                    className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full text-[#5C7191] hover:bg-[#FDECEC] hover:text-[#B91C1C]"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-lg font-bold text-[#17304F]">Belum ada target tabungan</p>
      )}
      {goals && goals.length === 0 ? (
        <p className="mt-1 text-sm text-[#46597A]">
          Tentukan target pertama di samping, misal dana darurat atau liburan keluarga.
        </p>
      ) : null}

      <form className="mt-6 space-y-3 rounded-2xl bg-white/75 p-4" onSubmit={handleCreate} noValidate>
        <h3 className="text-sm font-bold text-[#17304F]">Buat target baru</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-[#46597A]" htmlFor="goal-name">
            Nama target
            <input
              id="goal-name"
              name="goal-name"
              type="text"
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Contoh: Dana darurat"
              className="mt-1 w-full rounded-2xl border border-[#C9D6E4] bg-white px-3 py-2 text-sm text-[#17304F] placeholder:text-[#5C6C86] focus:border-[#1D4F87] focus:outline-none focus:ring-4 focus:ring-[#1D4F87]/15"
            />
          </label>
          <label className="block text-xs font-semibold text-[#46597A]" htmlFor="goal-target">
            Nominal target (rupiah)
            <MoneyInput
              id="goal-target"
              name="goal-target"
              value={target}
              onValueChange={setTarget}
              placeholder="Contoh: 3000000"
              className="mt-1 w-full rounded-2xl border border-[#C9D6E4] bg-white px-3 py-2 text-sm tabular-nums text-[#17304F] placeholder:text-[#5C6C86] focus:border-[#1D4F87] focus:outline-none focus:ring-4 focus:ring-[#1D4F87]/15"
            />
          </label>
          <label className="block text-xs font-semibold text-[#46597A]" htmlFor="goal-deadline">
            Batas waktu (opsional)
            <input
              id="goal-deadline"
              name="goal-deadline"
              type="date"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-2xl border border-[#C9D6E4] bg-white px-3 text-sm text-[#17304F] accent-[#1D4F87] focus:border-[#1D4F87] focus:outline-none focus:ring-4 focus:ring-[#1D4F87]/15"
            />
          </label>
        </div>
        {formError ? (
          <p role="alert" className="text-xs text-[#B91C1C]">
            {formError}
          </p>
        ) : (
          <p className="text-xs text-[#5C6C86]">Batas waktu yang sudah lewat tetap boleh. Targetnya tampil dengan tanda terlambat.</p>
        )}
        <Button
          type="submit"
          size="sm"
          isLoading={creating}
          loadingLabel="Menyimpan target"
        >
          Simpan target
        </Button>
      </form>

      <div className="mt-6">
        <button
          type="button"
          onClick={toggleTrash}
          aria-expanded={showTrash}
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-[#46597A] hover:bg-white/70"
          data-testid="goals-trash-toggle"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {showTrash ? "Tutup daftar terhapus" : "Target terhapus"}
        </button>
        {showTrash ? (
          trashLoading || !trash ? (
            <Skeleton className="mt-3 h-16 w-full" />
          ) : trash.length === 0 ? (
            <p className="mt-3 text-sm text-[#46597A]">Tidak ada target di daftar terhapus.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {trash.map((goal) => (
                <li key={goal.id} data-testid="goals-trash-item" className="flex items-center justify-between gap-3 rounded-2xl bg-white/75 px-4 py-3">
                  <span className="min-w-0 break-words text-sm font-semibold text-[#17304F]">{goal.name}</span>
                  <button
                    type="button"
                    onClick={() => void handleRestore(goal)}
                    disabled={restoringId === goal.id}
                    className="inline-flex min-h-11 rounded-full border border-[#BBE5C7] bg-white px-4 text-sm font-semibold text-[#166534] hover:bg-[#EFF4FA] disabled:cursor-not-allowed disabled:bg-[#E6ECF4] disabled:text-[#46597A]"
                  >
                    {restoringId === goal.id ? "Memulihkan" : "Pulihkan"}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>

      {undo ? (
        <UndoToast
          message={`Target "${undo.name}" dihapus sementara.`}
          onUndo={() => void undoTrash()}
          onExpire={() => setUndo(null)}
          onDismiss={() => setUndo(null)}
        />
      ) : null}

      {adjust ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[#14273F]/40 sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAdjust(null);
          }}
        >
          <div
            ref={adjustPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="goal-adjust-title"
            tabIndex={-1}
            data-testid="adjust-dialog"
            className="w-full max-w-lg rounded-t-3xl border border-[#D8E2EE] bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 id="goal-adjust-title" className="text-lg font-semibold tracking-tight text-[#17304F]">
                {adjust.direction === "add" ? "Catat progres" : "Koreksi progres"}
              </h3>
              <button
                type="button"
                onClick={() => setAdjust(null)}
                aria-label="Tutup"
                className="flex h-11 w-11 items-center justify-center rounded-full text-[#46597A] hover:bg-[#EFF4FA]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1 text-sm font-semibold text-[#46597A]">{adjust.name}</p>
            <label className="mt-5 block text-xs font-semibold text-[#46597A]" htmlFor="goal-adjust-amount">
              Jumlah progres (rupiah)
              <MoneyInput
                id="goal-adjust-amount"
                value={adjustAmount}
                onValueChange={setAdjustAmount}
                className="mt-1 w-full rounded-2xl border border-[#C9D6E4] bg-white px-3 py-3 text-lg tabular-nums text-[#17304F] focus:border-[#1D4F87] focus:outline-none focus:ring-4 focus:ring-[#1D4F87]/15"
              />
            </label>
            {adjustError ? (
              <p role="alert" className="mt-2 text-xs text-[#B91C1C]">
                {adjustError}
              </p>
            ) : (
              <p className="mt-2 text-xs text-[#5C6C86]">
                Ini hanya memperbarui progres target, bukan saldo dompet atau transaksi.
                Progres target tidak boleh minus.
              </p>
            )}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setAdjust(null)} disabled={adjusting}>
                Batal
              </Button>
              <Button type="button" onClick={() => void submitAdjust()} isLoading={adjusting} loadingLabel="Menyimpan">
                Simpan progres
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
