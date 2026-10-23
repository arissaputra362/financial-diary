/*
  Server-only receipt image normalization for the Gemini OCR call (WO-008).

  The uploaded original bytes stay the source of truth: SHA-256 dedup, size
  metadata, and private Blob storage all use the original (ADR-008). This
  helper only derives an in-memory copy for the single provider call: EXIF
  orientation is applied, the image is downscaled only when it exceeds a
  conservative max edge, aspect ratio is preserved, and it is never upscaled.
  Grayscale/contrast stay untouched in this first pass.
*/

import sharp from "sharp";
import { RECEIPT_MIME_TYPES } from "../contracts/ocr";

/** Conservative max edge for the derived Gemini image (WO-008). */
export const MAX_NORMALIZED_EDGE = 2048;

/** High enough to keep small receipt text readable after re-encoding. */
const JPEG_QUALITY = 90;
const WEBP_QUALITY = 90;

export type NormalizedImage = { bytes: Uint8Array; mimeType: string };

export interface ImageNormalizer {
  normalize(bytes: Uint8Array, mimeType: string): Promise<NormalizedImage>;
}

type ReceiptMime = (typeof RECEIPT_MIME_TYPES)[number];

function isReceiptMime(value: string): value is ReceiptMime {
  return (RECEIPT_MIME_TYPES as readonly string[]).includes(value);
}

function mimeForFormat(format: string | undefined, fallback: string): string {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return fallback;
}

export function createSharpImageNormalizer(): ImageNormalizer {
  return {
    async normalize(bytes, mimeType) {
      const pipeline = sharp(bytes)
        /* Auto-orient from EXIF and strip the orientation tag. */
        .rotate()
        /* Downscale to the max edge only; `inside` preserves aspect ratio. */
        .resize({
          width: MAX_NORMALIZED_EDGE,
          height: MAX_NORMALIZED_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        });

      let encoded;
      if (isReceiptMime(mimeType) && mimeType === "image/png") {
        encoded = pipeline.png();
      } else if (isReceiptMime(mimeType) && mimeType === "image/webp") {
        encoded = pipeline.webp({ quality: WEBP_QUALITY });
      } else {
        /* Default (and any unexpected input): JPEG matches the JPEG contract. */
        encoded = pipeline.jpeg({ quality: JPEG_QUALITY });
      }

      const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
      return { bytes: new Uint8Array(data), mimeType: mimeForFormat(info.format, mimeType) };
    },
  };
}
