/**
 * Which URLs the server may fetch. Template logo/background URLs and photo URLs
 * arrive from requests, so they are checked here before any fetch, and again on
 * the final URL after redirects.
 */
const PHOTO_HOSTS = new Set(["www.fieldgoose.com", "live.perigeeportal.co.za"]);

function parse(u: unknown): URL | null {
  if (typeof u !== "string") return null;
  try {
    return new URL(u);
  } catch {
    return null;
  }
}

/** Field Goose / Perigee photo links (http is allowed: FG exports use it and redirect to https). */
export function isPhotoUrl(u: unknown): boolean {
  const p = parse(u);
  return !!p && (p.protocol === "https:" || p.protocol === "http:") && PHOTO_HOSTS.has(p.hostname);
}

/** A file this app stored in its own public Vercel Blob store (template logos and .pptx). */
export function isOwnBlobUrl(u: unknown): boolean {
  const p = parse(u);
  return !!p && p.protocol === "https:" && p.hostname.endsWith(".public.blob.vercel-storage.com");
}

/** Fetch an allowed URL, re-check where redirects ended up, and cap the size. Null on any failure. */
export async function fetchAllowed(
  url: string,
  allowed: (u: string) => boolean,
  maxBytes: number,
  init: RequestInit = {},
): Promise<{ buf: ArrayBuffer; type: string } | null> {
  if (!allowed(url)) return null;
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok || (res.url && !allowed(res.url))) return null;
  const len = Number(res.headers.get("content-length") || 0);
  if (len > maxBytes) return null;
  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) return null;
  return { buf, type: (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() };
}
