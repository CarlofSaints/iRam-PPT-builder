"use client";

import type { ParsedData } from "@/lib/types";

interface Props {
  data: ParsedData;
}

export default function DataPreview({ data }: Props) {
  const { summary, rows } = data;

  // Unique stores
  const stores = [...new Set(rows.map((r) => r.store).filter(Boolean))];
  // Total images
  const totalImages = rows.reduce((sum, r) => sum + r.images.length, 0);
  // Completed with images
  const completedWithImages = rows.filter(
    (r) =>
      r.replyStatus.toLowerCase().trim() === "completed" && r.images.length > 0
  ).length;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">
        Data Preview
      </h3>

      {/* Title */}
      <div className="mb-4">
        <span className="text-xs text-gray-500">Task Title:</span>
        <p className="text-sm font-medium text-[#003B75]">{data.title}</p>
      </div>

      {/* Summary boxes */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        <SummaryBox label="Total" count={summary.total} color="bg-[#003B75]" />
        <SummaryBox label="Completed" count={summary.completed} color="bg-green-600" />
        <SummaryBox label="Not Done" count={summary.notCompleted} color="bg-red-600" />
        <SummaryBox label="Pending" count={summary.pending} color="bg-amber-500" />
        <SummaryBox label="Expired" count={summary.expired} color="bg-purple-600" />
        <SummaryBox label="Blank" count={summary.blank} color="bg-gray-400" />
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-600">
        <span>
          <strong>{stores.length}</strong> stores
        </span>
        <span>
          <strong>{totalImages}</strong> images found
        </span>
        <span>
          <strong>{completedWithImages}</strong> store slides will be generated
        </span>
      </div>

      {/* Store list (collapsed) */}
      {stores.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
            View store list ({stores.length})
          </summary>
          <div className="mt-2 max-h-40 overflow-y-auto text-xs text-gray-600 space-y-0.5">
            {stores.map((s) => (
              <div key={s}>{s}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function SummaryBox({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div
      className={`${color} text-white rounded-md px-2 py-2 text-center`}
    >
      <div className="text-lg font-bold leading-tight">{count}</div>
      <div className="text-[10px] opacity-80">{label}</div>
    </div>
  );
}
