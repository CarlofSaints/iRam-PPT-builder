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
  const [downloadedCount, setDownloadedCount] = useState(0);

  // Load templates on mount
  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTemplates(data);
      })
      .catch(() => {});
  }, []);

  // Handle file upload → parse (uses selected template's column mapping)
  const handleFile = useCallback(async (file: File) => {
    setStage("parsing");
    setError("");
    setParsedData(null);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (selectedTemplate) {
        formData.append("templateId", selectedTemplate);
      }

      const res = await fetch("/api/parse", { method: "POST", body: formData });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Parse failed");
      }

      setParsedData(json as ParsedData);
      setStage("idle");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Parse failed";
      if (msg === "Failed to fetch") {
        setError("Please close the file you are trying to upload and try again!");
      } else {
        setError(msg);
      }
      setStage("error");
    }
  }, [selectedTemplate]);

  // Handle generate — server downloads images and builds PPTX
  const handleGenerate = useCallback(async () => {
    if (!parsedData) return;

    setStage("building");
    setError("");
    setDownloadedCount(0);

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

      // Read image download count from response header
      const imgHeader = res.headers.get("X-Images-Downloaded");
      if (imgHeader) {
        const count = parseInt(imgHeader.split("/")[0], 10);
        if (!isNaN(count)) setDownloadedCount(count);
      }

      // Download the PPTX
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

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
  // Mirror the builder: only an explicit non-completed status skips a row, so
  // form exports (which have no status column) still report their images.
  const imageCount = parsedData
    ? parsedData.rows
        .filter((r) => {
          const status = r.replyStatus.toLowerCase().trim();
          return !status || status === "completed";
        })
        .reduce((sum, r) => sum + r.images.length, 0)
    : 0;

  const isGenerating = stage === "building" || stage === "parsing";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#32373C]">Generate PPT</h2>
        <p className="text-sm text-[#828282] mt-1">
          Select a template, then upload an Excel file to generate a PowerPoint report.
        </p>
      </div>

      {/* Template selector — above upload so column mapping applies during parse */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Template
        </label>
        <select
          value={selectedTemplate}
          onChange={(e) => {
            setSelectedTemplate(e.target.value);
            // Clear parsed data when template changes (mapping may differ)
            if (parsedData) {
              setParsedData(null);
              setFileName("");
              setStage("idle");
            }
          }}
          disabled={isGenerating}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#7CC042]"
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

      {/* Generate button */}
      {parsedData && stage !== "done" && (
        <div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-6 py-2 bg-[#7CC042] text-white text-sm font-semibold rounded-md hover:bg-[#5a9a2e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        downloadedCount={downloadedCount}
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
          className="text-sm text-[#5a9a2e] hover:underline"
        >
          Generate another report
        </button>
      )}
    </div>
  );
}
