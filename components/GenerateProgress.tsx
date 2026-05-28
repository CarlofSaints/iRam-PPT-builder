"use client";

export type ProgressStage =
  | "idle"
  | "parsing"
  | "downloading"
  | "building"
  | "done"
  | "error";

interface Props {
  stage: ProgressStage;
  error?: string;
  imageCount?: number;
}

const STAGES: { key: ProgressStage; label: string }[] = [
  { key: "parsing", label: "Parsing Excel" },
  { key: "downloading", label: "Downloading images" },
  { key: "building", label: "Building PPTX" },
  { key: "done", label: "Complete" },
];

export default function GenerateProgress({ stage, error, imageCount }: Props) {
  if (stage === "idle") return null;

  const currentIdx = STAGES.findIndex((s) => s.key === stage);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="space-y-3">
        {STAGES.map((s, idx) => {
          const isDone = stage === "error" ? false : idx < currentIdx;
          const isActive = stage !== "error" && idx === currentIdx;
          const isPending = !isDone && !isActive;

          return (
            <div key={s.key} className="flex items-center gap-3">
              {/* Step indicator */}
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isDone
                    ? "bg-green-500 text-white"
                    : isActive
                      ? "bg-[#7CC042] text-white"
                      : "bg-gray-200 text-gray-400"
                }`}
              >
                {isDone ? "\u2713" : idx + 1}
              </div>
              {/* Label */}
              <span
                className={`text-sm ${
                  isDone
                    ? "text-green-600 font-medium"
                    : isActive
                      ? "text-[#5a9a2e] font-semibold"
                      : isPending
                        ? "text-gray-400"
                        : "text-gray-600"
                }`}
              >
                {s.label}
                {isActive && s.key === "downloading" && imageCount
                  ? ` (${imageCount} images)`
                  : ""}
              </span>
              {/* Spinner */}
              {isActive && stage !== "done" && (
                <div className="w-4 h-4 border-2 border-[#7CC042] border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          );
        })}
      </div>

      {stage === "error" && error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {stage === "done" && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
          PPT generated and downloaded successfully.
        </div>
      )}
    </div>
  );
}
