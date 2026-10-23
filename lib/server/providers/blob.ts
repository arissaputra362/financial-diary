/*
  BlobStore seam (ADR-008, amended for C-30). The real implementation proxies
  receipt bytes to Vercel Blob. Bytes never touch the database and are never
  returned to the client directly; only the storage key is persisted. Image
  bytes are streamed server-side through `get(...)`, never via a public/signed
  Blob URL.
*/

import { get, put } from "@vercel/blob";

export interface BlobStore {
  put(bytes: Uint8Array, key: string, contentType: string): Promise<{ key: string; url: string }>;
  /**
   * Private server-side read. Returns a byte stream or null when the object is
   * missing. Never exposes a Blob URL/key to the caller.
   */
  get(key: string): Promise<{ stream: ReadableStream<Uint8Array> } | null>;
}

export function createVercelBlobStore(): BlobStore {
  return {
    async put(bytes, key, contentType) {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (!token) {
        /* Fail-closed: no credential means the upload cannot be persisted. */
        throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
      }
      const result = await put(key, Buffer.from(bytes), {
        /* Private: receipt bytes must never be publicly reachable (ADR-008). */
        access: "private",
        contentType,
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return { key: result.pathname, url: result.url };
    },
    async get(key) {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not configured.");
      try {
        const result = await get(key, { access: "private", token });
        if (!result || result.statusCode !== 200 || !result.stream) return null;
        return { stream: result.stream as unknown as ReadableStream<Uint8Array> };
      } catch {
        /* Missing object / storage error → generic not-found (never leak existence). */
        return null;
      }
    },
  };
}
