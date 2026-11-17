/**
 * Open a generated PDF immediately instead of leaving the user with a file to
 * find in their Downloads folder.
 *
 * Phones often block a popup opened after the awaited PDF build. When that
 * happens, navigate the current tab instead: mobile browsers hand the blob to
 * their built-in PDF viewer, and the Back button returns to the app. Desktop
 * keeps the previous download fallback so it never replaces the page.
 */
export async function openPdfBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const revokeLater = () => window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

  /*
    Do not pass `noopener`: it makes window.open return null even when the tab
    did open, which used to run the download fallback as well and left mobile
    users with a saved file. Sever the opener manually instead.
  */
  const opened = window.open(url, "_blank");
  if (opened) {
    try {
      opened.opener = null;
    } catch {
      /* Cross-origin viewers may refuse; the tab is already open. */
    }
    revokeLater();
    return;
  }

  if (window.matchMedia("(pointer: coarse)").matches) {
    /* Same-tab navigation is not popup-blocked and opens the native PDF viewer. */
    window.location.assign(url);
    revokeLater();
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  revokeLater();
}
