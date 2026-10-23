import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_NORMALIZED_EDGE, createSharpImageNormalizer } from "./image-normalization";

/*
  Real-Sharp contract tests for the derived OCR image (WO-008). The helper is
  server-only; fixtures are generated in-memory so the suite is deterministic
  and needs no binary files or network.
*/

const normalizer = createSharpImageNormalizer();

async function makeImage(
  width: number,
  height: number,
  format: "jpeg" | "png" | "webp",
  orientation?: number,
): Promise<Uint8Array> {
  const create = { create: { width, height, channels: 3 as const, background: { r: 12, g: 34, b: 56 } } };
  let pipeline = sharp(create);
  if (orientation) pipeline = pipeline.withMetadata({ orientation });
  const buffer = await pipeline[format]().toBuffer();
  return new Uint8Array(buffer);
}

async function readMeta(bytes: Uint8Array) {
  return sharp(Buffer.from(bytes)).metadata();
}

describe("createSharpImageNormalizer", () => {
  it("downscales a large image to the max edge and preserves aspect ratio (WO-008)", async () => {
    const large = await makeImage(4000, 3000, "jpeg");
    const result = await normalizer.normalize(large, "image/jpeg");

    const meta = await readMeta(result.bytes);
    expect(meta.width).toBe(MAX_NORMALIZED_EDGE);
    expect(meta.height).toBe(1536);
    expect(result.bytes.byteLength).toBeLessThan(large.byteLength);
  });

  it("never enlarges an already-small image (WO-008)", async () => {
    const small = await makeImage(800, 600, "jpeg");
    const result = await normalizer.normalize(small, "image/jpeg");

    const meta = await readMeta(result.bytes);
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
  });

  it("applies EXIF orientation and strips the orientation tag (WO-008)", async () => {
    const rotated = await makeImage(800, 600, "jpeg", 6);
    expect((await readMeta(rotated)).orientation).toBe(6);

    const result = await normalizer.normalize(rotated, "image/jpeg");
    const meta = await readMeta(result.bytes);
    expect(meta.width).toBe(600);
    expect(meta.height).toBe(800);
    expect(meta.orientation).toBeUndefined();
  });

  it.each([
    ["image/jpeg", "jpeg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ] as const)("preserves the %s output MIME (WO-008)", async (mimeType, format) => {
    const input = await makeImage(640, 480, format);
    const result = await normalizer.normalize(input, mimeType);

    expect(result.mimeType).toBe(mimeType);
    expect((await readMeta(result.bytes)).format).toBe(format);
  });

  it("rejects bytes that are not a decodable image so the caller can fall back (WO-008)", async () => {
    await expect(normalizer.normalize(new TextEncoder().encode("not an image"), "image/jpeg")).rejects.toBeTruthy();
  });
});
