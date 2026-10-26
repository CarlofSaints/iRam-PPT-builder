"use client";

import PicturesToCells from "@/components/pictures-to-cells/PicturesToCells";
import type { Session } from "@/lib/useAuth";

function sessionHeaders(): Record<string, string> {
  try {
    const s = JSON.parse(localStorage.getItem("ppt_session") || "null") as Session | null;
    if (!s?.id) return {};
    return { "x-user-id": s.id, "x-user-name": encodeURIComponent(`${s.name} ${s.surname} (${s.email})`) };
  } catch {
    return {};
  }
}

export default function PicturesToCellsPage() {
  return (
    <PicturesToCells
      imageUrl={(url) => `/api/image?url=${encodeURIComponent(url)}`}
      logApi="/api/pictures-to-cells"
      access="public"
      headers={sessionHeaders}
      accent="#32373C"
    />
  );
}
