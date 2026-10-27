"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImageIcon, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { isValidMoneyAmount } from "@/lib/money-input";
import { compressCameraImage } from "@/lib/compress-image";
import { TextArea } from "@/components/ui/TextArea";
import { ScopePill } from "@/components/wallets/scope";
import { WalletFormSheet } from "@/components/wallets/WalletFormSheet";
import { WalletPickerSheet } from "@/components/wallets/WalletPickerSheet";
import { apiRequest, idempotencyHeaders } from "@/lib/api-client";
import { formatIDR } from "@/lib/format";
import { todayJakarta } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type {
  OcrDraftDTO,
  OcrErrorCode,
  OcrJobDTO,
  OcrMissingField,
  OcrRetryControlErrorCode,
  OcrUploadResultDTO,
  TransactionDTO,
  WalletDTO,
} from "@/types/api";
import { categoriesForType, CATEGORY_EMOJI, CATEGORY_LABELS } from "./categories";

const MAX_BYTES = 4_194_304;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const LOW_CONFIDENCE = 0.7;
const INT32_MAX = 2_147_483_647;

type Step = "pick" | "loading" | "review" | "failed" | "waiting";

export interface ReceiptScannerProps {
  onCreated: (rows: TransactionDTO[]) => void;
  onCancel: () => void;
  onSwitchToManual: () => void;
}

/**
 * Receipt upload + OCR review (design 03 §3). The draft is always editable and
 * requires an explicit save; the OCR endpoint never creates a transaction.
 */
export function ReceiptScanner({ onCreated, onCancel, onSwitchToManual }: ReceiptScannerProps) {
  const [step, setStep] = useState<Step>("pick");
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [job, setJob] = useState<OcrJobDTO | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [txType, setTxType] = useState<"MONEY_OUT" | "MONEY_IN">("MONEY_OUT");
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [amountDigits, setAmountDigits] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayJakarta());
  const [category, setCategory] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletDTO | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  /* C-32: remount key, so a picker opened after a create lists the new wallet. */
  const [pickerKey, setPickerKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [missingFields, setMissingFields] = useState<OcrMissingField[]>([]);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [failureCode, setFailureCode] = useState<OcrErrorCode | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  /* T-012: the latest FAILED job is the only retry target (AC-F3-10). */
  const [failedJob, setFailedJob] = useState<OcrJobDTO | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  /* Job/receipt ids the server reported as image-unavailable in this sheet session. */
  const [unavailableKeys, setUnavailableKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const retryStatusRef = useRef<HTMLDivElement>(null);
  /* Synchronous guard so a double tap cannot send two retry requests. */
  const retryingRef = useRef(false);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryTokenRef = useRef(0);

  function stopRecoveryPolling() {
    recoveryTokenRef.current += 1;
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
  }

  const amountMinor = amountDigits ? Number(amountDigits) : 0;

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      stopRecoveryPolling();
    };
  }, []);

  const showPreview = (file: File) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setPreviewUrl(url);
  };

  /*
    Reset the input before opening the picker so choosing the same file again
    still fires `change`. `Pindai ulang` is a picker entry point, never an
    immediate retry (design 03 §3.5.1, 2026-10-23).
  */
  const openPicker = (picker: "camera" | "gallery") => {
    const input = picker === "camera" ? cameraRef.current : galleryRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragActive(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    handleFile(event.dataTransfer.files[0]);
  };

  /*
    Session memory for receipts whose stored image the server reported
    unavailable: a normal re-upload of the same bytes hits dedup and returns the
    same job, which must not offer retry again (AC-F3-12). Keys carry both ids so
    a newer FAILED attempt on that receipt is treated the same.
  */
  const isUnavailable = (candidate: OcrJobDTO): boolean =>
    unavailableKeys.has(`job:${candidate.id}`) || unavailableKeys.has(`receipt:${candidate.receiptId}`);

  const markUnavailable = (candidate: OcrJobDTO) => {
    setUnavailableKeys((current) => {
      const next = new Set(current);
      next.add(`job:${candidate.id}`);
      next.add(`receipt:${candidate.receiptId}`);
      return next;
    });
  };

  const fail = (code: OcrErrorCode | null, message?: string) => {
    stopRecoveryPolling();
    setFailureCode(code);
    setFailureMessage(message ?? null);
    setRetryNotice(null);
    setStep("failed");
  };

  /* Server says the job FAILED: keep the id so retry targets this exact job. */
  const failJob = (nextJob: OcrJobDTO, message?: string) => {
    setFailedJob(nextJob);
    fail(nextJob.errorCode, message);
  };

  const hydrateReview = (nextJob: OcrJobDTO, draft: OcrDraftDTO, notice: string | null) => {
    stopRecoveryPolling();
    setJob(nextJob);
    setDuplicateNotice(notice);
    setMerchant(draft.merchant ?? "");
    setNote(draft.notes ?? "");
    setAmountDigits(draft.totalAmountMinor !== null ? String(draft.totalAmountMinor) : "");
    setOccurredAt(draft.occurredAt ?? todayJakarta());
    /*
      OCR supports money in/out only (transfer hidden). An `income` suggestion
      switches the review to money-in; otherwise it stays money-out.
    */
    const suggestedType = draft.category === "income" ? "MONEY_IN" : "MONEY_OUT";
    setTxType(suggestedType);
    setCategory(draft.category && categoriesForType(suggestedType).includes(draft.category) ? draft.category : null);
    setMissingFields(draft.missingFields);
    setConfidence(draft.confidence);
    setWallet(null);
    setFieldErrors({});
    setFormError(null);
    setStep("review");
  };

  const changeReviewType = (next: "MONEY_OUT" | "MONEY_IN") => {
    setTxType(next);
    if (category && !categoriesForType(next).includes(category)) {
      setCategory(null);
    }
  };

  const upload = async (file: File) => {
    stopRecoveryPolling();
    setStep("loading");
    setFailedJob(null);
    setFailureCode(null);
    setFailureMessage(null);
    setRetryNotice(null);
    setFormError(null);

    const form = new FormData();
    form.append("file", file);
    try {
      const response = await apiRequest<{ job: OcrJobDTO; draft: OcrDraftDTO | null }>("/api/ocr/receipts", {
        method: "POST",
        headers: idempotencyHeaders(),
        body: form,
      });

      if (response.status === 401) {
        fail(null, "Sesi berakhir. Masuk lagi untuk memakai scan struk.");
        return;
      }

      if (response.status === 409) {
        const body = response.data as { job?: OcrJobDTO; draft?: OcrDraftDTO | null } | null;
        if (body?.job) {
          /* Own receipt: reuse its latest job instead of creating a duplicate. */
          if (body.job.status === "SUCCEEDED" && body.draft) {
            hydrateReview(body.job, body.draft, "Struk ini sudah pernah diunggah. Lanjutkan dari draft yang sudah ada.");
          } else if (body.job.status === "FAILED") {
            /*
              Identical bytes hit dedup. If the stored image is known missing,
              stay honest (Variant B) with no retry. Otherwise re-run OCR for
              this FAILED job on the stored private image (design 03 §3.5.5).
            */
            setFailedJob(body.job);
            if (isUnavailable(body.job)) {
              failJob(body.job);
            } else {
              await retryFailedScan(body.job);
            }
          } else {
            fail(null, "Struk ini masih diproses. Tunggu sebentar, lalu buka lagi.");
          }
        } else {
          /* Other uploader: generic duplicate copy only (C-19). */
          fail(null, "Struk ini sudah pernah diproses. Coba isi manual atau unggah struk lain.");
        }
        return;
      }

      if (response.status === 422) {
        const message = response.data?.error?.fieldErrors?.file?.[0] ?? "File tidak bisa diproses.";
        fail(null, message);
        return;
      }

      if (!response.ok || !response.data?.job) {
        fail((response.data?.error?.code as OcrErrorCode | undefined) ?? null, response.data?.error?.message);
        return;
      }

      if (response.data.job.status === "SUCCEEDED" && response.data.draft) {
        hydrateReview(response.data.job, response.data.draft, null);
      } else if (response.data.job.status === "FAILED") {
        failJob(response.data.job);
      } else {
        fail(null, "Struk ini masih diproses. Tunggu sebentar, lalu buka lagi.");
      }
    } catch {
      fail(null, "Struk belum bisa diunggah. Periksa koneksimu lalu coba lagi.");
    }
  };

  const handleFile = async (file: File | undefined, fromCamera = false) => {
    if (!file) return;
    if (!ALLOWED_MIME.includes(file.type)) {
      /* Generic validation error: no failed job to retry, so no retry claim. */
      setFailedJob(null);
      fail(null, "Format foto harus JPG, PNG, atau WebP.");
      return;
    }

    let uploadFile = file;
    if (fromCamera && file.size > MAX_BYTES) {
      try {
        uploadFile = await compressCameraImage(file);
      } catch {
        setFailedJob(null);
        fail(null, "Foto dari kamera tidak dapat diperkecil. Coba ambil ulang atau pilih dari galeri.");
        return;
      }
    }

    if (uploadFile.size > MAX_BYTES) {
      setFailedJob(null);
      fail(null, "Ukuran foto maksimal 4 MB.");
      return;
    }
    showPreview(uploadFile);
    void upload(uploadFile);
  };

  /*
    T-012 retry: POST the latest FAILED job id with a fresh idempotency key and
    no body. The server re-reads the private stored image. This only runs after
    the user picks a file: identical bytes come back as a dedup 409 carrying
    that FAILED job. The client never sends bytes to the retry endpoint and
    never retries without a user action (AC-F3-10..12).
  */
  const retryFailedScan = async (target: OcrJobDTO | null = failedJob) => {
    if (!target || target.status !== "FAILED" || isUnavailable(target) || retryingRef.current) return;

    retryingRef.current = true;
    setRetrying(true);
    setStep("failed");
    setFailedJob(target);
    /* Keep the honest reason line while the retry runs and if it cannot start. */
    setFailureCode(target.errorCode);
    setFailureMessage(null);
    setRetryNotice(null);
    /* Keep keyboard focus inside the dialog while the primary button disables. */
    window.requestAnimationFrame(() => retryStatusRef.current?.focus());

    try {
      const response = await apiRequest<OcrUploadResultDTO>(
        `/api/ocr/jobs/${encodeURIComponent(target.id)}/retry`,
        { method: "POST", headers: idempotencyHeaders() },
      );

      if (response.status === 401) {
        setRetryNotice("Sesi berakhir. Masuk lagi untuk memakai scan struk.");
        return;
      }

      if (response.status === 404) {
        setFailedJob(null);
        fail(null, "Struk tidak ditemukan. Pilih foto struk atau isi manual.");
        return;
      }

      if (response.status === 409) {
        const code = response.data?.error?.code as OcrRetryControlErrorCode | undefined;
        if (code === "OCR_IMAGE_UNAVAILABLE") {
          markUnavailable(target);
          failJob(target);
          return;
        }
        await refreshAfterRetryConflict(code);
        return;
      }

      if (!response.ok || !response.data?.job) {
        setRetryNotice(
          response.data?.error?.message ?? "Pemindaian ulang belum bisa dilakukan. Coba lagi.",
        );
        return;
      }

      const nextJob = response.data.job;
      if (nextJob.status === "SUCCEEDED" && response.data.draft) {
        hydrateReview(nextJob, response.data.draft, null);
      } else if (nextJob.status === "FAILED") {
        failJob(nextJob);
      } else {
        setFailedJob(null);
        setRetryNotice(null);
        setStep("waiting");
        scheduleRecovery(undefined);
      }
    } catch {
      setRetryNotice("Pemindaian ulang belum bisa dilakukan. Periksa koneksimu lalu coba lagi.");
    } finally {
      retryingRef.current = false;
      setRetrying(false);
    }
  };

  /* Resolve the latest authorized attempt without re-uploading receipt bytes. */
  const fetchLatestJobForReceipt = async (): Promise<
    | { kind: "job"; job: OcrJobDTO; draft: OcrDraftDTO | null }
    | { kind: "unauthorized" }
    | { kind: "unavailable" }
  > => {
    const receiptId = job?.receiptId ?? failedJob?.receiptId;
    if (!receiptId) return { kind: "unavailable" };
    const response = await apiRequest<{ job?: OcrJobDTO; draft?: OcrDraftDTO | null }>(
      `/api/ocr/receipts/${encodeURIComponent(receiptId)}/job`,
    );
    if (response.status === 401) return { kind: "unauthorized" };
    if (response.status === 404) return { kind: "unavailable" };
    if (response.ok && response.data?.job) {
      return { kind: "job", job: response.data.job, draft: response.data.draft ?? null };
    }
    return { kind: "unavailable" };
  };

  function scheduleRecovery(code: OcrRetryControlErrorCode | undefined) {
    stopRecoveryPolling();
    const token = recoveryTokenRef.current;
    recoveryTimerRef.current = setTimeout(async () => {
      if (recoveryTokenRef.current !== token) return;
      const latest = await fetchLatestJobForReceipt();
      if (recoveryTokenRef.current !== token) return;
      applyLatestJob(latest, code);
    }, 2000);
  }

  function applyLatestJob(
    latest:
      | { kind: "job"; job: OcrJobDTO; draft: OcrDraftDTO | null }
      | { kind: "unauthorized" }
      | { kind: "unavailable" },
    code: OcrRetryControlErrorCode | undefined,
  ) {
    if (latest.kind === "unauthorized") {
      stopRecoveryPolling();
      setRetryNotice("Sesi berakhir. Masuk lagi untuk memakai scan struk.");
      setStep("failed");
      return;
    }
    if (latest.kind === "unavailable") {
      setFailedJob(null);
      fail(null, conflictMessageFor(code));
      return;
    }

    if (latest.job.status === "SUCCEEDED" && latest.draft) {
      hydrateReview(latest.job, latest.draft, null);
      return;
    }
    if (latest.job.status === "FAILED") {
      failJob(latest.job);
      return;
    }

    /* PROCESSING: no retry button, keep checking until the result exists. */
    setFailedJob(null);
    setFailureCode(null);
    setFailureMessage(null);
    setRetryNotice(null);
    setStep("waiting");
    window.requestAnimationFrame(() => retryStatusRef.current?.focus());
    scheduleRecovery(code);
  }

  const refreshAfterRetryConflict = async (code: OcrRetryControlErrorCode | undefined) => {
    const latest = await fetchLatestJobForReceipt();
    applyLatestJob(latest, code);
  };

  /* `Pilih struk lain` returns to Step A: a normal new upload, never a retry. */
  const chooseAnotherReceipt = () => {
    stopRecoveryPolling();
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setPreviewUrl(null);
    setJob(null);
    setFailedJob(null);
    setFailureCode(null);
    setFailureMessage(null);
    setRetryNotice(null);
    setFormError(null);
    setStep("pick");
  };

  const save = async () => {
    if (!job) return;
    const errors: Record<string, string[]> = {};
    if (missingFields.includes("merchant") && !merchant.trim()) {
      errors.merchant = ["Nama toko belum terbaca. Isi dulu."];
    }
    if (!isValidMoneyAmount(amountMinor)) {
      errors.amountMinor = ["Jumlah belum terbaca. Isi dulu."];
    } else if (amountMinor > INT32_MAX) {
      errors.amountMinor = ["Jumlah terlalu besar."];
    }
    if (!category) {
      errors.category = ["Pilih kategori yang sesuai."];
    }
    if (!occurredAt) {
      errors.occurredAt = ["Isi tanggal transaksi dulu."];
    } else if (occurredAt > todayJakarta()) {
      errors.occurredAt = ["Tanggal tidak boleh di masa depan."];
    }
    if (!wallet) {
      errors.walletId = ["Pilih dompet dulu."];
    }
    if (note.length > 500) {
      errors.note = ["Catatan maksimal 500 karakter."];
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setFormError(null);
    try {
      const response = await apiRequest<{ transactions: TransactionDTO[] }>("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json", ...idempotencyHeaders() },
        body: JSON.stringify({
          type: txType,
          amountMinor,
          category,
          occurredAt,
          merchant: merchant.trim() || undefined,
          note: note.trim() || undefined,
          source: "OCR",
          receiptId: job.receiptId,
          walletId: wallet?.id,
        }),
      });

      if (response.status === 401) {
        setFormError("Sesi berakhir. Masuk lagi untuk menyimpan.");
        return;
      }
      if (!response.ok) {
        setFieldErrors(response.data?.error?.fieldErrors ?? {});
        setFormError(response.data?.error?.message ?? "Transaksi belum tersimpan. Coba lagi.");
        return;
      }
      onCreated(response.data?.transactions ?? []);
    } catch {
      setFormError("Transaksi belum tersimpan. Periksa koneksimu lalu coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const fileInputs = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        aria-label="Ambil foto struk dengan kamera"
        onChange={(event) => void handleFile(event.target.files?.[0], true)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Pilih foto struk dari galeri"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
    </>
  );

  if (step === "loading") {
    return (
      <div role="status" aria-live="polite" aria-atomic="true" className="space-y-4 text-center">
        <ScanningCard previewUrl={previewUrl} />
        <p className="text-xs text-ink-3">Biasanya selesai dalam 2 sampai 4 detik.</p>
      </div>
    );
  }

  if (step === "waiting") {
    /*
      Another tab owns the retry for this receipt. There is no retry action
      here; the client polls the latest job through the dedup path and moves to
      the review as soon as the provider result exists.
    */
    return (
      <div className="space-y-4">
        <div
          ref={retryStatusRef}
          tabIndex={-1}
          aria-live="polite"
          aria-atomic="true"
          className="space-y-4 outline-none"
        >
          <Card variant="tint">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue">
              Struk sedang diproses
            </p>
            <p className="mt-1 text-[15px] font-semibold text-ink">
              Pemindaian struk ini masih berjalan.
            </p>
            <p className="mt-1 text-sm text-ink-2">
              Hasilnya akan muncul otomatis di sini. Kamu tidak perlu menekan tombol apa pun.
            </p>
          </Card>
          {retryNotice ? (
            <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-3 text-sm text-danger">
              {retryNotice}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button type="button" variant="secondary" onClick={chooseAnotherReceipt} className="sm:flex-1">
            Pilih struk lain
          </Button>
          <Button type="button" variant="secondary" onClick={onSwitchToManual}>
            Isi manual
          </Button>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mx-auto block min-h-11 px-4 text-sm font-medium text-ink-2 underline"
        >
          Batal
        </button>
      </div>
    );
  }

  if (step === "failed") {
    /*
      Variant A: latest FAILED job, retry is a user-triggered attempt only.
      Variant B: the server reported the stored image is gone, so no retry.
      Generic: file/network/session errors with no job to re-scan.
    */
    const unavailable = failedJob?.status === "FAILED" && isUnavailable(failedJob);
    const retryable = failedJob?.status === "FAILED" && !unavailable;
    const reason = failureMessage ?? failureMessageFor(failureCode);

    return (
      <div className="space-y-4">
        <div
          ref={retryStatusRef}
          tabIndex={-1}
          aria-live="polite"
          aria-atomic="true"
          className="space-y-4 outline-none"
        >
          {retrying ? (
            <ScanningCard previewUrl={previewUrl} />
          ) : (
            <>
              <Card variant="danger">
                <p className="text-xs font-semibold uppercase tracking-wider text-danger">
                  Struk gagal dibaca
                </p>
                <p className="mt-1 text-[15px] font-semibold text-ink">
                  Struk ini belum bisa dibaca otomatis.
                </p>
                <p className="mt-1 text-sm text-danger">{reason}</p>
                {unavailable ? (
                  <p className="mt-3 text-sm text-ink-2">
                    Gambar struk yang lama sudah tidak bisa diproses. Pilih foto struk lain atau isi manual.
                  </p>
                ) : retryable ? (
                  <p className="mt-3 text-sm text-ink-2">
                    Kamu bisa memilih gambar struk lagi atau menggantinya dengan foto lain.
                  </p>
                ) : null}
                {failedJob ? (
                  <p className="mt-1 text-sm text-ink-2">
                    Percobaan yang gagal tadi tidak mengubah catatan keuangan apa pun.
                  </p>
                ) : null}
              </Card>
              {retryNotice ? (
                <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-3 text-sm text-danger">
                  {retryNotice}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button
            type="button"
            onClick={() => openPicker("camera")}
            isLoading={retrying}
            loadingLabel={retryable ? "Memindai ulang" : "Membuka kamera"}
            disabled={retrying}
            className="sm:flex-1"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            {retryable ? "Pindai ulang dengan kamera" : "Ambil foto dengan kamera"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => openPicker("gallery")}
            disabled={retrying}
            className="sm:flex-1"
          >
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
            Pilih dari galeri
          </Button>
          <Button type="button" variant="secondary" onClick={onSwitchToManual}>
            Isi manual
          </Button>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mx-auto block min-h-11 px-4 text-sm font-medium text-ink-2 underline"
        >
          Batal
        </button>
        {fileInputs}
      </div>
    );
  }

  if (step === "review" && job) {
    const lowConfidence = confidence !== null && confidence < LOW_CONFIDENCE;
    /* C-28 disclosure: server flag drives variant 2; never inferred from input (A-46). */
    const disclosure =
      wallet?.scope === "SHARING"
        ? `Struk ini akan terhubung ke transaksi di dompet Bersama "${wallet.name}". Foto struknya bisa dilihat anggota keluarga yang sudah disetujui. Rincian transaksimu tetap tersimpan seperti biasa. Dengan menekan "Sudah benar, simpan transaksi", kamu setuju dengan itu.`
        : wallet && job.receiptSharedWithHousehold
          ? "Struk ini sudah terhubung ke transaksi di dompet Bersama, jadi foto struknya tetap bisa dilihat anggota keluarga, meskipun transaksi barumu kamu simpan di dompet Pribadi. Rincian transaksi barumu tetap hanya milikmu."
          : null;
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-2 rounded-2xl bg-blue-tint px-4 py-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-ink">Struk berhasil dibaca!</p>
            <p className="text-xs text-ink-2">Periksa detail di bawah ini sebelum menyimpan.</p>
          </div>
        </div>

        {duplicateNotice ? (
          <p role="status" className="rounded-2xl bg-warning-bg px-4 py-3 text-sm text-warning">
            {duplicateNotice}
          </p>
        ) : null}

        {lowConfidence ? (
          <p role="status" className="rounded-2xl bg-warning-bg px-4 py-3 text-sm text-warning">
            Perlu diperiksa. Sebagian tulisan di struk mungkin kurang jelas.
          </p>
        ) : null}

        {previewUrl ? (
          <div className="overflow-hidden rounded-3xl border border-card-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Pratinjau struk" className="max-h-56 w-full object-contain" />
          </div>
        ) : null}

        <Input
          id="ocr-merchant"
          label="Toko"
          value={merchant}
          maxLength={120}
          error={fieldErrors.merchant?.[0]}
          helperText={autoDetected(missingFields, "merchant", "✨ Terbaca otomatis")}
          onChange={(event) => setMerchant(event.target.value)}
        />

        <TextArea
          id="ocr-note"
          label="Catatan (opsional)"
          value={note}
          maxLength={500}
          error={fieldErrors.note?.[0]}
          placeholder='mis. "Belanja mingguan di pasar"'
          onChange={(event) => setNote(event.target.value)}
        />

        <Field
          id="ocr-amount"
          label="Jumlah"
          required
          error={fieldErrors.amountMinor?.[0]}
          helperText={autoDetected(missingFields, "totalAmountMinor", "✨ Terbaca otomatis")}
        >
          <div className="flex items-center gap-2 rounded-2xl border border-input-border bg-card px-4 py-3 focus-within:border-blue focus-within:ring-4 focus-within:ring-blue/15">
            <span className="text-lg font-semibold text-ink-2">Rp</span>
            <MoneyInput
              id="ocr-amount"
              value={amountDigits}
              onValueChange={setAmountDigits}
              placeholder="0"
              aria-invalid={fieldErrors.amountMinor ? true : undefined}
              className="w-full min-w-0 bg-transparent text-2xl font-bold tabular-nums text-ink outline-none placeholder:text-placeholder/60"
            />
          </div>
          {amountDigits ? <p className="text-xs text-ink-3">Terbaca: {formatIDR(amountMinor)}</p> : null}
        </Field>

        <Field
          id="ocr-date"
          label="Tanggal"
          required
          error={fieldErrors.occurredAt?.[0]}
          helperText={autoDetected(missingFields, "occurredAt", "✨ Terbaca otomatis")}
        >
          <input
            id="ocr-date"
            type="date"
            value={occurredAt}
            max={todayJakarta()}
            onChange={(event) => setOccurredAt(event.target.value)}
            className="min-h-11 w-full rounded-2xl border border-input-border bg-card px-4 py-3 text-[15px] text-ink accent-blue focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15"
          />
        </Field>

        <fieldset>
          <legend className="text-xs font-medium uppercase tracking-wider text-ink-2">Jenis transaksi</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["MONEY_OUT", "Uang keluar (-)"],
                ["MONEY_IN", "Uang masuk (+)"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={txType === value}
                onClick={() => changeReviewType(value)}
                className={cn(
                  "min-h-11 rounded-full px-4 text-sm font-semibold transition-colors",
                  txType === value
                    ? "bg-brand-blue text-white"
                    : "border border-blue-border bg-card text-blue hover:bg-blue-wash",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-medium uppercase tracking-wider text-ink-2">Kategori</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {categoriesForType(txType).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={category === value}
                aria-label={CATEGORY_LABELS[value]}
                onClick={() => setCategory(value)}
                className={cn(
                  "flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-all",
                  category === value
                    ? "border-blue bg-blue-tint text-blue"
                    : "border-blue-border bg-card text-ink-2 hover:bg-blue-wash",
                )}
              >
                <span aria-hidden="true">{CATEGORY_EMOJI[value]}</span>
                {CATEGORY_LABELS[value]}
              </button>
            ))}
          </div>
          {fieldErrors.category?.[0] ? (
            <p role="alert" className="mt-1.5 text-xs text-danger">
              {fieldErrors.category[0]}
            </p>
          ) : null}
        </fieldset>

        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-2">
            {txType === "MONEY_IN" ? "Ke dompet" : "Dari dompet"}
          </p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
            className={cn(
              "mt-1.5 flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border bg-card px-4 text-left",
              fieldErrors.walletId ? "border-danger" : "border-input-border",
            )}
          >
            {wallet ? (
              <span className="flex min-w-0 items-center gap-2">
                <ScopePill scope={wallet.scope} />
                <span className="truncate text-[15px] font-semibold text-ink">{wallet.name}</span>
              </span>
            ) : (
              <span className="text-sm text-ink-2">Pilih dompet</span>
            )}
            <span aria-hidden="true" className="text-ink-3">
              &gt;
            </span>
          </button>
          {fieldErrors.walletId?.[0] ? (
            <p role="alert" className="mt-1.5 text-xs text-danger">
              {fieldErrors.walletId[0]}
            </p>
          ) : null}
          <p className="mt-1.5 text-xs text-ink-3">Pilih di mana uang catatan ini dihitung.</p>
        </div>

        {disclosure ? (
          <div role="note" className="rounded-2xl bg-blue-wash px-4 py-3 text-sm text-ink-2">
            <p className="font-semibold text-ink">Catatan sebelum menyimpan</p>
            <p className="mt-1">{disclosure}</p>
          </div>
        ) : null}

        {confidence !== null ? (
          <p className="flex items-center gap-1.5 text-xs text-ink-3">
            <CheckCircle2 className="h-3.5 w-3.5 text-green" aria-hidden="true" />
            Keyakinan baca {Math.round(confidence * 100)}%
          </p>
        ) : null}

        {formError ? (
          <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-3 text-sm text-danger">
            {formError}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button type="button" size="lg" onClick={save} isLoading={saving} loadingLabel="Menyimpan" className="sm:flex-1">
            Sudah benar, simpan transaksi
          </Button>
          <div className="flex flex-col gap-2 sm:flex-1">
            <Button type="button" variant="secondary" size="lg" onClick={() => openPicker("camera")} disabled={saving}>
              <Camera className="h-4 w-4" aria-hidden="true" />
              Ambil foto ulang
            </Button>
            <Button type="button" variant="secondary" size="lg" onClick={() => openPicker("gallery")} disabled={saving}>
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
              Pilih dari galeri
            </Button>
          </div>
        </div>
        <button type="button" onClick={onCancel} disabled={saving} className="mx-auto block text-sm font-medium text-ink-2 underline">
          Batal
        </button>
        <WalletPickerSheet
          key={pickerKey}
          open={pickerOpen}
          selectedWalletId={wallet?.id ?? null}
          onClose={() => setPickerOpen(false)}
          onSelect={(selected) => {
            setWallet(selected);
            setFieldErrors((current) => {
              const next = { ...current };
              delete next.walletId;
              return next;
            });
          }}
          onCreate={() => {
            /* C-32: close the picker first, then open the create sheet on top. */
            setPickerOpen(false);
            setPickerKey((key) => key + 1);
            setFormOpen(true);
          }}
        />
        <WalletFormSheet
          key={formOpen ? "open" : "closed"}
          open={formOpen}
          mode="create"
          onClose={() => setFormOpen(false)}
          onSaved={(created) => {
            setWallet(created);
            setFormOpen(false);
          }}
        />
        {fileInputs}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-3xl border-2 border-dashed p-6 text-center transition-colors ${
          dragActive
            ? "border-blue bg-blue-tint ring-4 ring-blue/10"
            : "border-blue-border bg-blue-wash/60"
        }`}
      >
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-tint text-blue">
          <Camera className="h-6 w-6" aria-hidden="true" />
        </span>
        <span className="mt-3 block text-[15px] font-semibold text-ink">Tambahkan foto struk</span>
        <span className="mt-1 block text-xs text-ink-2">JPG, PNG, atau WebP. Maksimal 4 MB.</span>
        <span className="mt-1 block text-xs text-ink-3">Seret dan lepaskan foto ke area ini, atau pilih sumber foto.</span>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button type="button" onClick={() => openPicker("camera")} className="w-full">
            <Camera className="h-4 w-4" aria-hidden="true" />
            Ambil foto dengan kamera
          </Button>
          <Button type="button" variant="secondary" onClick={() => openPicker("gallery")} className="w-full">
            <ImageIcon className="h-4 w-4" aria-hidden="true" />
            Pilih dari galeri
          </Button>
        </div>
      </div>
      <p className="flex items-center justify-center gap-1.5 text-xs text-ink-3">
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Ingin ketik sendiri?{" "}
        <button type="button" onClick={onSwitchToManual} className="font-semibold text-blue underline">
          Isi manual
        </button>
      </p>
      <button type="button" onClick={onCancel} className="mx-auto block text-sm font-medium text-ink-2 underline">
        Batal
      </button>
      {fileInputs}
    </div>
  );
}

function ScanningCard({ previewUrl }: { previewUrl: string | null }) {
  return (
    <div className="rounded-3xl border-2 border-blue-border bg-blue-wash p-6">
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl bg-blue-tint text-blue">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Pratinjau struk" className="h-full w-full rounded-2xl object-cover" />
        ) : (
          <ImageIcon className="h-8 w-8" aria-hidden="true" />
        )}
      </div>
      <p className="mt-4 animate-pulse text-[15px] font-semibold text-ink motion-reduce:animate-none">
        AI sedang membaca strukmu...
      </p>
      <p className="mt-1 text-sm text-ink-2">Mengambil total, nama toko, dan tanggal...</p>
      <div className="mx-auto mt-4 h-1 w-40 animate-pulse rounded-full bg-brand-blue motion-reduce:animate-none" />
    </div>
  );
}

function failureMessageFor(code: OcrErrorCode | null): string {
  switch (code) {
    case "OCR_TIMEOUT":
      return "Waktu baca habis.";
    case "OCR_RATE_LIMITED":
      return "Layanan baca struk sedang ramai.";
    case "OCR_MODEL_UNAVAILABLE":
      return "Layanan baca struk sedang tidak tersedia.";
    case "OCR_INVALID_OUTPUT":
      return "Tulisan di struk belum bisa dibaca dengan jelas.";
    default:
      return "Struk ini belum bisa diproses.";
  }
}

/* Only shown when the receipt's latest job cannot be read at all. */
function conflictMessageFor(code: OcrRetryControlErrorCode | undefined): string {
  return code === "OCR_RETRY_IN_PROGRESS"
    ? "Pemindaian struk ini masih berjalan. Tunggu sebentar, lalu coba lagi."
    : "Struk ini sudah tidak bisa dipindai ulang dari kartu ini. Pilih foto struk atau isi manual.";
}

function autoDetected(missing: OcrMissingField[], field: OcrMissingField, label: string): string | undefined {
  return missing.includes(field) ? undefined : label;
}
