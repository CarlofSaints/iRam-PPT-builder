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

  // Convert a blob to base64 string (without the data: prefix)
  const blobToBase64 = useCallback((blob: Blob): Promise<string | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        resolve(base64 || null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }, []);

  // Try loading image via <img> tag + canvas (bypasses CORS for loading, extracts via canvas)
  const downloadViaCanvas = useCallback(
    (url: string): Promise<{ url: string; data: string } | null> => {
      return new Promise((resolve) => {
        let resolved = false;
        const done = (result: { url: string; data: string } | null) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          resolve(result);
        };

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) { done(null); return; }
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
            const base64 = dataUrl.split(",")[1];
            done(base64 ? { url, data: base64 } : null);
          } catch {
            console.warn(`[ppt] Canvas tainted for ${url.substring(0, 60)}`);
            done(null);
          }
        };
        img.onerror = () => done(null);
        const timer = setTimeout(() => { img.src = ""; done(null); }, 15000);
        img.src = url;
      });
    },
    []
  );

  // Download a single image — tries multiple strategies
  const downloadImage = useCallback(
    async (url: string): Promise<{ url: string; data: string } | null> => {
      // Strategy 1: Direct fetch from browser (works if CORS headers present)
      try {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          const base64 = await blobToBase64(blob);
          if (base64) {
            console.log(`[ppt] Direct fetch OK: ${url.substring(0, 60)}`);
            return { url, data: base64 };
          }
        }
      } catch {
        // CORS or network error — expected, try next strategy
      }

      // Strategy 2: Canvas approach (loads via <img> tag, extract via canvas)
      const canvasResult = await downloadViaCanvas(url);
      if (canvasResult) {
        console.log(`[ppt] Canvas OK: ${url.substring(0, 60)}`);
        return canvasResult;
      }

      // Strategy 3: Server proxy (adds User-Agent + Referer headers)
      try {
        const proxyUrl = `/api/image?url=${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) {
          const blob = await res.blob();
          const base64 = await blobToBase64(blob);
          if (base64) {
            console.log(`[ppt] Proxy OK: ${url.substring(0, 60)}`);
            return { url, data: base64 };
          }
        } else {
          console.warn(`[ppt] Proxy failed (${res.status}): ${url.substring(0, 60)}`);
        }
      } catch {
        // Proxy also failed
      }

      console.warn(`[ppt] ALL strategies failed: ${url.substring(0, 60)}`);
      return null;
    },
    [blobToBase64, downloadViaCanvas]
  );

  // Handle generate — downloads images client-side first, then sends to server
  const handleGenerate = useCallback(async () => {
    if (!parsedData) return;

    setStage("downloading");
    setError("");
    setDownloadedCount(0);

    try {
      // Collect all unique image URLs from completed rows
      const allUrls: string[] = [];
      for (const row of parsedData.rows) {
        if (row.replyStatus.toLowerCase().trim() !== "completed") continue;
        for (const url of row.images) {
          if (url && !allUrls.includes(url)) allUrls.push(url);
        }
      }

      // Download images client-side in batches of 5
      console.log(`[ppt] Downloading ${allUrls.length} images via proxy...`);
      const imageMap: Record<string, string> = {};
      let downloaded = 0;
      for (let i = 0; i < allUrls.length; i += 5) {
        const batch = allUrls.slice(i, i + 5);
        const results = await Promise.all(
          batch.map((url) => downloadImage(url))
        );
        for (const result of results) {
          if (result) {
            imageMap[result.url] = result.data;
            downloaded++;
          }
        }
        console.log(`[ppt] Batch done: ${downloaded}/${allUrls.length} downloaded so far`);
      }
      console.log(`[ppt] Final: ${downloaded}/${allUrls.length} images downloaded`);
      setDownloadedCount(downloaded);

      setStage("building");

      // Send parsed data + pre-downloaded images to server
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: parsedData,
          templateId: selectedTemplate,
          images: imageMap,
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
  }, [parsedData, selectedTemplate, downloadImage]);

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
