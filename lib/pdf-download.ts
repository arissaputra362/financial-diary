/**
 * Open a generated PDF. Phones get the native share sheet; desktop opens the
 * file in a new tab and falls back to a download when the popup is blocked.
 */
export async function openPdfBlob(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: "application/pdf" });
  const shareData = { files: [file], title: filename } as ShareData & { files: File[] };
  const canShare =
    typeof navigator.canShare === "function" &&
    typeof navigator.share === "function" &&
    navigator.canShare(shareData) &&
    window.matchMedia("(pointer: coarse)").matches;

  if (canShare) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if ((error as DOMException | undefined)?.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
