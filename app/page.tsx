"use client";

import { useState, useEffect, useCallback } from "react";
import UploadZone from "@/components/UploadZone";
import DataPreview from "@/components/DataPreview";
import GenerateProgress from "@/components/GenerateProgress";
import type { ProgressStage } from "@/components/GenerateProgress";
import type { ParsedData, PptTemplate } from "@/lib/types";

export default function HomePage() {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [templates, setTemplates] = useState<PptTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("default");
  const [stage, setStage] = useState<ProgressStage>("idle");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  // Load templates on mount
  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTemplates(data);
      })
      .catch(() => {});
  }, []);

  // Handle file upload → parse
  const handleFile = useCallback(async (file: File) => {
    setStage("parsing");
    setError("");
    setParsedData(null);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse", { method: "POST", body: formData });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Parse failed");
      }

      setParsedData(json as ParsedData);
      setStage("idle");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Parse failed");
      setStage("error");
    }
  }, []);

  // Handle generate
  const handleGenerate = useCallback(async () => {
    if (!parsedData) return;

    setStage("downloading");
    setError("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: parsedData,
          templateId: selectedTemplate,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let errMsg: string;
        try {
          errMsg = JSON.parse(text).error;
        } catch {
          errMsg = text;
        }
        throw new Error(errMsg || "Generation failed");
      }

      setStage("building");

      // Download the PPTX
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      // Extract filename from Content-Disposition or generate one
      const cd = res.headers.get("Content-Disposition");
      const match = cd?.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] || "Report.pptx";
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStage("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStage("error");
    }
  }, [parsedData, selectedTemplate]);

  // Count images for progress display
  const imageCount = parsedData
    ? parsedData.rows
        .filter((r) => r.replyStatus.toLowerCase().trim() === "completed")
        .reduce((sum, r) => sum + r.images.length, 0)
    : 0;

  const isGenerating =
    stage === "downloading" || stage === "building" || stage === "parsing";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-800">Generate PPT</h2>
        <p className="text-sm text-gray-500 mt-1">
          Upload a Perigee Excel export to generate a PowerPoint report.
        </p>
      </div>

      {/* Upload zone */}
      <UploadZone onFile={handleFile} disabled={isGenerating} />

      {/* File name indicator */}
      {fileName && parsedData && (
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <span className="font-medium">{fileName}</span>
          <button
            onClick={() => {
              setParsedData(null);
              setFileName("");
              setStage("idle");
              setError("");
            }}
            className="text-red-400 hover:text-red-600"
          >
            Clear
          </button>
        </div>
      )}

      {/* Data preview */}
      {parsedData && <DataPreview data={parsedData} />}

      {/* Template selector + generate button */}
      {parsedData && stage !== "done" && (
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Template
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              disabled={isGenerating}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#003B75]"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              {templates.length === 0 && (
                <option value="default">iRAM Standard</option>
              )}
            </select>
          </div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-6 py-2 bg-[#E04E2A] text-white text-sm font-semibold rounded-md hover:bg-[#c43d1e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? "Generating..." : "Generate PPT"}
          </button>
        </div>
      )}

      {/* Progress */}
      <GenerateProgress
        stage={stage}
        error={error}
        imageCount={imageCount}
      />

      {/* Reset after done */}
      {stage === "done" && (
        <button
          onClick={() => {
            setParsedData(null);
            setFileName("");
            setStage("idle");
            setError("");
          }}
          className="text-sm text-[#003B75] hover:underline"
        >
          Generate another report
        </button>
      )}
    </div>
  );
}
