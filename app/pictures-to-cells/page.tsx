"use client";

import PicturesToCells from "@/components/pictures-to-cells/PicturesToCells";

// Sign-in for the log rides on the httpOnly session cookie (lib/pptSession.ts).
export default function PicturesToCellsPage() {
  return (
    <PicturesToCells
      imageUrl={(url) => `/api/image?url=${encodeURIComponent(url)}`}
      logApi="/api/pictures-to-cells"
      access="public"
      accent="#32373C"
    />
  );
}
