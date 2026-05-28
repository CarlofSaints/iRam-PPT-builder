import { list, put, del } from "@vercel/blob";

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

/** Read a JSON value from Vercel Blob (or return fallback). */
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  if (!useBlob) return fallback;

  try {
    const { blobs } = await list({ prefix: key, limit: 1 });
    const match = blobs.find((b) => b.pathname === key);
    if (!match) return fallback;

    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

/** Write a JSON value to Vercel Blob. */
export async function writeJson<T>(key: string, data: T): Promise<void> {
  if (!useBlob) return;

  // Delete the old blob first (put with addRandomSuffix:false replaces)
  try {
    const { blobs } = await list({ prefix: key, limit: 1 });
    const match = blobs.find((b) => b.pathname === key);
    if (match) await del(match.url);
  } catch {
    // ignore delete errors
  }

  await put(key, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

/** Delete a blob by key. */
export async function deleteJson(key: string): Promise<void> {
  if (!useBlob) return;

  try {
    const { blobs } = await list({ prefix: key, limit: 1 });
    const match = blobs.find((b) => b.pathname === key);
    if (match) await del(match.url);
  } catch {
    // ignore
  }
}

/** Store a binary file (logo image) in Vercel Blob. Returns the public URL. */
export async function writeBinary(
  key: string,
  data: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  // Delete old one first
  try {
    const { blobs } = await list({ prefix: key, limit: 1 });
    const match = blobs.find((b) => b.pathname === key);
    if (match) await del(match.url);
  } catch {
    // ignore
  }

  const blob = await put(key, Buffer.from(data), {
    access: "public",
    addRandomSuffix: false,
    contentType,
  });
  return blob.url;
}
