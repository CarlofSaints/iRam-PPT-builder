"use client";

import { useState, useEffect, useCallback } from "react";
import UploadZone from "@/components/UploadZone";
import DataPreview from "@/components/DataPreview";
import GenerateProgress from "@/components/GenerateProgress";
import type { ProgressStage } from "@/components/GenerateProgress";
import type { ParsedData, PptTemplate } from "@/lib/types";
import { summarise } from "@/lib/summary";

/** Browser download of an in-memory file */
function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.download = name;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Two-sheet summary (by rep, by store) — built in the browser from the parsed file */
async function downloadSummary(data: ParsedData, baseName: string) {
  const { default: ExcelJS } = await import("exceljs");
  const { byRep, byStore } = summarise(data);
  const wb = new ExcelJS.Workbook();
  const sheet = (name: string, columns: { header: string; key: string; width: number }[], rows: object[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = columns;
    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };
  sheet("By Rep", [
    { header: "Rep", key: "rep", width: 30 },
    { header: "Unique Stores", key: "uniqueStores", width: 15 },
    { header: "Total Visits", key: "totalVisits", width: 13 },
    { header: "Pictures", key: "pictures", width: 11 },
  ], byRep);
  sheet("By Store", [
    { header: "Store Code", key: "storeCode", width: 14 },
    { header: "Store", key: "store", width: 40 },
    { header: "Channel", key: "channel", width: 16 },
    { header: "Unique Reps", key: "uniqueReps", width: 13 },
    { header: "Total Visits", key: "totalVisits", width: 13 },
    { header: "Pictures", key: "pictures", width: 11 },
  ], byStore);
  const buf = await wb.xlsx.writeBuffer();
  saveFile(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${baseName}_Summary.xlsx`
  );
}

export default function HomePage() {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [templates, setTemplates] = useState<PptTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("default");
  const [stage, setStage] = useState<ProgressStage>("idle");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [showRep, setShowRep] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [wantSummary, setWantSummary] = useState(false);
  const [summaryName, setSummaryName] = useState("Report");

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
          fields: { rep: showRep, date: showDate },
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
      const cd = res.headers.get("Content-Disposition");
      const match = cd?.match(/filename="?([^"]+)"?/);
      const pptName = match?.[1] || "Report.pptx";
      saveFile(blob, pptName);

      setSummaryName(pptName.replace(/\.pptx$/i, ""));
      // The deck is already down: a summary failure must not report the whole run as failed.
      if (wantSummary) {
        await downloadSummary(parsedData, pptName.replace(/\.pptx$/i, "")).catch(() =>
          setError("The deck downloaded, but the Excel summary failed. Use the button below to try again.")
        );
      }

      setStage("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setStage("error");
    }
  }, [parsedData, selectedTemplate, showRep, showDate, wantSummary]);

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

      {/* What to include */}
      <fieldset className="bg-white border border-gray-200 rounded-lg p-4 space-y-2" disabled={isGenerating}>
        <legend className="text-xs font-medium text-gray-600 px-1">Include on each store slide</legend>
        <label className="flex items-center gap-2 text-sm text-[#32373C]">
          <input type="checkbox" checked={showRep} onChange={(e) => setShowRep(e.target.checked)} className="accent-[#7CC042]" />
          Rep name
        </label>
        <label className="flex items-center gap-2 text-sm text-[#32373C]">
          <input type="checkbox" checked={showDate} onChange={(e) => setShowDate(e.target.checked)} className="accent-[#7CC042]" />
          Visit date
        </label>
        <label className="flex items-center gap-2 text-sm text-[#32373C] pt-2 border-t border-gray-100">
          <input type="checkbox" checked={wantSummary} onChange={(e) => setWantSummary(e.target.checked)} className="accent-[#7CC042]" />
          Would you like an Excel summary? (stores, visits and pictures by rep, and by store)
        </label>
      </fieldset>

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

      {/* Chrome can block a second automatic download; a click here always works */}
      {stage === "done" && wantSummary && parsedData && (
        <div className="space-y-1">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={() => downloadSummary(parsedData, summaryName).then(() => setError(""), () => setError("The Excel summary failed again."))}
            className="px-4 py-2 border border-[#7CC042] text-[#5a9a2e] text-sm font-semibold rounded-md hover:bg-[#7CC042]/10"
          >
            Download Excel summary
          </button>
          <p className="text-xs text-gray-500">No Excel? Your browser may have blocked the second download. Click the button above.</p>
        </div>
      )}

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
