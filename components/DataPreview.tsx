"use client";

import type { ParsedData } from "@/lib/types";
import { groupVisits, countStoreSlides, IMAGES_PER_SLIDE } from "@/lib/visits";

interface Props {
  data: ParsedData;
}

export default function DataPreview({ data }: Props) {
  const { summary, rows } = data;
  const isForm = data.mode === "form";
  const questionStats = data.questionStats ?? [];

  // Unique stores
  const stores = [...new Set(rows.map((r) => r.store).filter(Boolean))];
  // Total images
  const totalImages = rows.reduce((sum, r) => sum + r.images.length, 0);
  // Slides are built per store visit, not per row
  const visits = groupVisits(rows, questionStats);
  const storeSlides = countStoreSlides(visits, IMAGES_PER_SLIDE);
  const choiceQuestions = questionStats.filter((q) => q.kind === "choice");

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-[#32373C] mb-3 uppercase tracking-wide">
        Data Preview
      </h3>

      {/* Title */}
      <div className="mb-4 flex items-center gap-2">
        <div>
          <span className="text-xs text-gray-500">
            {isForm ? "Report:" : "Task Title:"}
          </span>
          <p className="text-sm font-medium text-[#32373C]">{data.title}</p>
        </div>
        <span className="ml-auto text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-gray-100 text-gray-600">
          {isForm ? "Form export" : "Task export"}
        </span>
      </div>

      {/* Overview boxes — these are the slide-2 cards */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
        <SummaryBox label="Unique Sites" count={stores.length} color="bg-[#7CC042]" />
        <SummaryBox label="Total Visits" count={visits.length} color="bg-[#7CC042]" />
        <SummaryBox label="Pictures" count={totalImages} color="bg-[#7CC042]" />
        <SummaryBox
          label="Questions"
          count={data.deckSummary?.uniqueQuestions ?? 0}
          color="bg-[#32373C]"
        />
        <SummaryBox
          label="Answered"
          count={data.deckSummary?.totalAnswers ?? 0}
          color="bg-[#32373C]"
        />
      </div>

      {/* Task status boxes — only meaningful for task exports */}
      {!isForm && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
          <SummaryBox label="Total" count={summary.total} color="bg-[#32373C]" />
          <SummaryBox label="Completed" count={summary.completed} color="bg-green-600" />
          <SummaryBox label="Not Done" count={summary.notCompleted} color="bg-red-600" />
          <SummaryBox label="Pending" count={summary.pending} color="bg-amber-500" />
          <SummaryBox label="Expired" count={summary.expired} color="bg-purple-600" />
          <SummaryBox label="Blank" count={summary.blank} color="bg-gray-400" />
        </div>
      )}

      {/* Stats row */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-600">
        <span>
          <strong>{rows.length}</strong> rows → <strong>{visits.length}</strong> visits
        </span>
        <span>
          <strong>{totalImages}</strong> images found
        </span>
        <span>
          <strong>{storeSlides}</strong> store slides will be generated
        </span>
      </div>

      {/* Response breakdown preview */}
      {choiceQuestions.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
            Response breakdown ({choiceQuestions.length} counted{" "}
            {choiceQuestions.length === 1 ? "question" : "questions"})
          </summary>
          <div className="mt-2 max-h-56 overflow-y-auto space-y-2">
            {choiceQuestions.map((q) => (
              <div key={q.question} className="text-xs">
                <div className="font-medium text-[#32373C]">
                  {q.question}{" "}
                  <span className="font-normal text-gray-400">({q.answered})</span>
                </div>
                <div className="text-gray-600 pl-2">
                  {q.options.slice(0, 8).map((o) => (
                    <div key={o.label} className="flex justify-between gap-2">
                      <span className="truncate">{o.label}</span>
                      <strong>{o.count}</strong>
                    </div>
                  ))}
                  {q.options.length > 8 && (
                    <div className="text-gray-400">
                      + {q.options.length - 8} more
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Image test — first 3 images from completed rows */}
      {(() => {
        const sampleImages: string[] = [];
        for (const r of rows) {
          // Mirror the builder: only an explicit non-completed status skips a row
          const status = r.replyStatus.toLowerCase().trim();
          if (status && status !== "completed") continue;
          for (const img of r.images) {
            if (img && sampleImages.length < 3) sampleImages.push(img);
          }
          if (sampleImages.length >= 3) break;
        }
        if (sampleImages.length === 0) return null;
        return (
          <div className="mt-3">
            <span className="text-xs text-gray-500">Image access test:</span>
            <div className="flex gap-2 mt-1">
              {sampleImages.map((url, i) => (
                <div key={i} className="relative w-16 h-16 border border-gray-200 rounded overflow-hidden bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Test ${i + 1}`}
                    className="w-full h-full object-cover"
                    onLoad={(e) => {
                      const el = e.currentTarget.parentElement?.querySelector(".status") as HTMLElement;
                      if (el) { el.textContent = "OK"; el.className = "status absolute bottom-0 left-0 right-0 text-center text-[8px] bg-green-500 text-white"; }
                    }}
                    onError={(e) => {
                      const el = e.currentTarget.parentElement?.querySelector(".status") as HTMLElement;
                      if (el) { el.textContent = "BLOCKED"; el.className = "status absolute bottom-0 left-0 right-0 text-center text-[8px] bg-red-500 text-white"; }
                    }}
                  />
                  <span className="status absolute bottom-0 left-0 right-0 text-center text-[8px] bg-gray-300 text-gray-600">
                    ...
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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
