const CAMERA_IMAGE_TARGET_BYTES = 3_500_000;
const MAX_IMAGE_DIMENSION = 2_000;

/** Compress oversized camera images to a JPEG with enough headroom for upload. */
export async function compressCameraImage(file: File): Promise<File> {
  if (file.size <= CAMERA_IMAGE_TARGET_BYTES) return file;
  if (!file.type.startsWith("image/")) throw new Error("File yang dipilih bukan gambar.");

  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    let quality = 0.86;
    let blob: Blob | null = null;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Gambar tidak dapat diproses di perangkat ini.");

      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) throw new Error("Gambar tidak dapat dikompres.");
      if (blob.size <= CAMERA_IMAGE_TARGET_BYTES) break;

      if (quality > 0.62) {
        quality -= 0.12;
      } else {
        scale *= 0.82;
        quality = 0.8;
      }
    }

    if (!blob) throw new Error("Gambar tidak dapat dikompres.");
    const baseName = file.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}
