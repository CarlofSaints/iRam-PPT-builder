"use client";

import PicturesToCells from "@/components/pictures-to-cells/PicturesToCells";

export default function PicturesToCellsPage() {
  return <PicturesToCells imageUrl={(url) => `/api/image?url=${encodeURIComponent(url)}`} accent="#32373C" />;
}
