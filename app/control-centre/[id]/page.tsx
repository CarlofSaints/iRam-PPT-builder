"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import type { PptTemplate, ColumnMapping } from "@/lib/types";

/* ── PPT field definitions for the mapping UI ─────────────────────── */
const PPT_FIELDS: { key: keyof Omit<ColumnMapping, "imageColumns">; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "notes", label: "Notes / Description" },
  { key: "channel", label: "Channel" },
  { key: "store", label: "Store Name" },
  { key: "storeCode", label: "Store Code" },
  { key: "storeFullName", label: "Store Full Name" },
  { key: "createdBy", label: "Created By" },
  { key: "replyStatus", label: "Reply Status" },
  { key: "replyBy", label: "Reply By" },
  { key: "replyNotes", label: "Reply Notes" },
  { key: "replyResponse", label: "Reply Response" },
];

export default function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [template, setTemplate] = useState<PptTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [message, setMessage] = useState("");

  // Editable fields — branding
  const [name, setName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [fontFamily, setFontFamily] = useState("Arial");
  const [outputNaming, setOutputNaming] = useState("{title}_Report");

  // Column mapping state
  const [sampleHeaders, setSampleHeaders] = useState<string[]>([]);
  const [uploadingSample, setUploadingSample] = useState(false);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [imageColumns, setImageColumns] = useState<string[]>([]);
  const [savingMapping, setSavingMapping] = useState(false);

  // PPTX template state
  const [uploadingPptx, setUploadingPptx] = useState(false);
  const [deletingPptx, setDeletingPptx] = useState(false);

  /* ── Load template ──────────────────────────────────────────────── */
  const loadTemplate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/templates/${id}`);
      if (!res.ok) {
        setMessage("Template not found");
        setLoading(false);
        return;
      }
      const data: PptTemplate = await res.json();
      setTemplate(data);
      setName(data.name);
      setPrimaryColor(data.primaryColor);
      setAccentColor(data.accentColor);
      setFontFamily(data.fontFamily);
      setOutputNaming(data.outputNaming || "{title}_Report");

      // Restore saved mapping
      if (data.columnMapping) {
        const m: Record<string, string> = {};
        for (const f of PPT_FIELDS) {
          const val = data.columnMapping[f.key];
          if (val) m[f.key] = val;
        }
        setFieldMapping(m);
        setImageColumns(data.columnMapping.imageColumns || []);
      }
    } catch {
      setMessage("Failed to load template");
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadTemplate();
  }, [loadTemplate]);

  /* ── Save branding + output naming ─────────────────────────────── */
  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, primaryColor, accentColor, fontFamily, outputNaming }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTemplate(updated);
        setMessage("Saved");
      } else {
        setMessage("Save failed");
      }
    } catch {
      setMessage("Save failed");
    }
    setSaving(false);
  };

  /* ── Logo upload ───────────────────────────────────────────────── */
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await fetch(`/api/templates/${id}/logo`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const updated = await res.json();
        setTemplate(updated);
        setMessage("Logo uploaded");
      } else {
        setMessage("Logo upload failed");
      }
    } catch {
      setMessage("Logo upload failed");
    }
    setUploadingLogo(false);
    e.target.value = "";
  };

  /* ── Sample Excel upload (for field mapping) ───────────────────── */
  const handleSampleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSample(true);
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/templates/${id}/sample-excel`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        setMessage(err.error || "Failed to read headers");
        setUploadingSample(false);
        return;
      }
      const data = await res.json();
      setSampleHeaders(data.headers || []);
      setMessage(`Detected ${data.headers.length} columns from row ${data.headerRow + 1}`);
    } catch {
      setMessage("Failed to read sample file");
    }
    setUploadingSample(false);
    e.target.value = "";
  };

  /* ── Save column mapping ───────────────────────────────────────── */
  const handleSaveMapping = async () => {
    setSavingMapping(true);
    setMessage("");

    const mapping: ColumnMapping = {};
    for (const f of PPT_FIELDS) {
      if (fieldMapping[f.key]) {
        (mapping as Record<string, string>)[f.key] = fieldMapping[f.key];
      }
    }
    if (imageColumns.length > 0) {
      mapping.imageColumns = imageColumns;
    }

    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping: mapping }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTemplate(updated);
        setMessage("Mapping saved");
      } else {
        setMessage("Failed to save mapping");
      }
    } catch {
      setMessage("Failed to save mapping");
    }
    setSavingMapping(false);
  };

  /* ── Clear column mapping ──────────────────────────────────────── */
  const handleClearMapping = async () => {
    setSavingMapping(true);
    setMessage("");
    try {
      const res = await fetch(`/api/templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping: null }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTemplate(updated);
        setFieldMapping({});
        setImageColumns([]);
        setSampleHeaders([]);
        setMessage("Mapping cleared — auto-detect will be used");
      } else {
        setMessage("Failed to clear mapping");
      }
    } catch {
      setMessage("Failed to clear mapping");
    }
    setSavingMapping(false);
  };

  /* ── Toggle image column selection ─────────────────────────────── */
  const toggleImageColumn = (header: string) => {
    setImageColumns((prev) =>
      prev.includes(header)
        ? prev.filter((h) => h !== header)
        : prev.length < 10
          ? [...prev, header]
          : prev
    );
  };

  /* ── PPTX template upload ──────────────────────────────────────── */
  const handlePptxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPptx(true);
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("pptx", file);
      const res = await fetch(`/api/templates/${id}/pptx`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const updated = await res.json();
        setTemplate(updated);
        setMessage("PPTX template uploaded");
      } else {
        const err = await res.json();
        setMessage(err.error || "Upload failed");
      }
    } catch {
      setMessage("PPTX upload failed");
    }
    setUploadingPptx(false);
    e.target.value = "";
  };

  /* ── PPTX template delete ──────────────────────────────────────── */
  const handlePptxDelete = async () => {
    setDeletingPptx(true);
    setMessage("");
    try {
      const res = await fetch(`/api/templates/${id}/pptx`, { method: "DELETE" });
      if (res.ok) {
        const updated = await res.json();
        setTemplate(updated);
        setMessage("PPTX template removed");
      } else {
        setMessage("Failed to remove PPTX template");
      }
    } catch {
      setMessage("Failed to remove PPTX template");
    }
    setDeletingPptx(false);
  };

  /* ── Loading / not found states ────────────────────────────────── */
  if (loading) {
    return <div className="text-sm text-gray-400 p-6">Loading...</div>;
  }

  if (!template) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <p className="text-sm text-red-500">Template not found</p>
        <button
          onClick={() => router.push("/control-centre")}
          className="text-sm text-[#5a9a2e] hover:underline"
        >
          Back to Control Centre
        </button>
      </div>
    );
  }

  const hasSavedMapping = template.columnMapping && Object.keys(template.columnMapping).some(
    (k) => k === "imageColumns" ? (template.columnMapping!.imageColumns?.length ?? 0) > 0 : !!template.columnMapping![k as keyof ColumnMapping]
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/control-centre")}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back
        </button>
        <h2 className="text-xl font-bold text-[#32373C]">
          Edit Template: {template.name}
        </h2>
      </div>

      {/* ── Section 1: Branding ─────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Branding
        </h3>

        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Template Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7CC042]"
          />
        </div>

        {/* Colours */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Primary Colour
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={`#${primaryColor}`}
                onChange={(e) =>
                  setPrimaryColor(e.target.value.replace("#", ""))
                }
                className="w-8 h-8 rounded cursor-pointer border border-gray-300"
              />
              <input
                value={primaryColor}
                onChange={(e) =>
                  setPrimaryColor(e.target.value.replace("#", ""))
                }
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
                maxLength={6}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Accent Colour
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={`#${accentColor}`}
                onChange={(e) =>
                  setAccentColor(e.target.value.replace("#", ""))
                }
                className="w-8 h-8 rounded cursor-pointer border border-gray-300"
              />
              <input
                value={accentColor}
                onChange={(e) =>
                  setAccentColor(e.target.value.replace("#", ""))
                }
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm font-mono"
                maxLength={6}
              />
            </div>
          </div>
        </div>

        {/* Font */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Font Family
          </label>
          <select
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="Arial">Arial</option>
            <option value="Calibri">Calibri</option>
            <option value="Segoe UI">Segoe UI</option>
            <option value="Helvetica">Helvetica</option>
            <option value="Verdana">Verdana</option>
          </select>
        </div>

        {/* Logo */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Logo
          </label>
          {template.logoUrl ? (
            <div className="flex items-center gap-3 mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={template.logoUrl}
                alt="Logo"
                className="h-12 object-contain border border-gray-200 rounded"
              />
              <span className="text-xs text-green-600">Uploaded</span>
            </div>
          ) : (
            <p className="text-xs text-gray-400 mb-2">
              No logo uploaded (default iRAM logo will be used)
            </p>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleLogoUpload}
            disabled={uploadingLogo}
            className="text-xs text-gray-500"
          />
          {uploadingLogo && (
            <span className="text-xs text-gray-400 ml-2">Uploading...</span>
          )}
        </div>

        {/* Preview swatch */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Preview
          </label>
          <div
            className="h-14 rounded-md flex items-center px-4"
            style={{ backgroundColor: `#${primaryColor}` }}
          >
            <span
              className="text-sm font-bold"
              style={{ color: `#${accentColor}` }}
            >
              {name || "Template Preview"}
            </span>
          </div>
        </div>

        {/* Save branding */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[#7CC042] text-white text-sm font-semibold rounded-md hover:bg-[#5a9a2e] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Branding"}
          </button>
          {message && (
            <span
              className={`text-xs ${
                message.includes("fail") ? "text-red-500" : "text-green-600"
              }`}
            >
              {message}
            </span>
          )}
        </div>
      </div>

      {/* ── Section 2: Field Mapping ────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Field Mapping
        </h3>
        <p className="text-xs text-gray-500">
          Upload a sample Excel file to detect its column headers, then map each
          PPT field to the corresponding Excel column. Leave blank to skip a field.
          If no mapping is configured, auto-detection will be used (Perigee format).
        </p>

        {/* Current mapping status */}
        {hasSavedMapping && (
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            <span className="text-green-700 font-medium">Custom mapping saved</span>
            <button
              onClick={handleClearMapping}
              disabled={savingMapping}
              className="ml-2 text-red-500 hover:text-red-700 underline"
            >
              Clear Mapping
            </button>
          </div>
        )}
        {!hasSavedMapping && (
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-gray-500">No custom mapping — using auto-detect</span>
          </div>
        )}

        {/* Upload sample */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Upload Sample Excel
          </label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleSampleUpload}
            disabled={uploadingSample}
            className="text-xs text-gray-500"
          />
          {uploadingSample && (
            <span className="text-xs text-gray-400 ml-2">Reading headers...</span>
          )}
        </div>

        {/* Mapping dropdowns (shown after sample upload or if mapping exists) */}
        {(sampleHeaders.length > 0 || hasSavedMapping) && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-600">
              Map PPT fields to Excel columns:
            </p>

            {PPT_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <label className="w-36 text-xs text-gray-700 font-medium shrink-0">
                  {f.label}
                </label>
                {sampleHeaders.length > 0 ? (
                  <select
                    value={fieldMapping[f.key] || ""}
                    onChange={(e) =>
                      setFieldMapping((prev) => ({
                        ...prev,
                        [f.key]: e.target.value,
                      }))
                    }
                    className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs bg-white"
                  >
                    <option value="">— not mapped —</option>
                    {sampleHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-gray-400">
                    {fieldMapping[f.key] || "— not mapped —"}
                  </span>
                )}
              </div>
            ))}

            {/* Image columns — multi-select */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-700 mb-2">
                Image Columns (select 1-10 columns containing image URLs):
              </p>
              {sampleHeaders.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {sampleHeaders.map((h) => (
                    <button
                      key={h}
                      onClick={() => toggleImageColumn(h)}
                      className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                        imageColumns.includes(h)
                          ? "bg-[#7CC042] text-white border-[#5a9a2e]"
                          : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {imageColumns.map((h) => (
                    <span
                      key={h}
                      className="px-2 py-1 text-xs rounded-md bg-[#e8f5d9] text-[#5a9a2e]"
                    >
                      {h}
                    </span>
                  ))}
                  {imageColumns.length === 0 && (
                    <span className="text-xs text-gray-400">
                      None (auto-detect Image 1-5)
                    </span>
                  )}
                </div>
              )}
              {imageColumns.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  {imageColumns.length} column{imageColumns.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>

            {/* Save / clear mapping buttons */}
            {sampleHeaders.length > 0 && (
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSaveMapping}
                  disabled={savingMapping}
                  className="px-4 py-2 bg-[#7CC042] text-white text-xs font-semibold rounded-md hover:bg-[#5a9a2e] disabled:opacity-50"
                >
                  {savingMapping ? "Saving..." : "Save Mapping"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section 3: PPT Template ─────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          PPT Template
        </h3>
        <p className="text-xs text-gray-500">
          Upload a .pptx file to use its first slide master background image on
          all generated slides. If no template is uploaded, solid colour backgrounds
          will be used.
        </p>

        {template.pptxTemplateUrl ? (
          <div className="flex items-center gap-3">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-green-700 font-medium">
              PPTX template uploaded
            </span>
            <button
              onClick={handlePptxDelete}
              disabled={deletingPptx}
              className="text-xs text-red-500 hover:text-red-700 underline"
            >
              {deletingPptx ? "Removing..." : "Remove"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-xs text-gray-500">No PPTX template — using solid colours</span>
          </div>
        )}

        <div>
          <input
            type="file"
            accept=".pptx"
            onChange={handlePptxUpload}
            disabled={uploadingPptx}
            className="text-xs text-gray-500"
          />
          {uploadingPptx && (
            <span className="text-xs text-gray-400 ml-2">Uploading...</span>
          )}
        </div>
      </div>

      {/* ── Section 4: Output Filename ──────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Output Filename
        </h3>
        <p className="text-xs text-gray-500">
          Configure the naming pattern for generated files. Use tokens that will
          be replaced with actual values.
        </p>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Filename Pattern
          </label>
          <input
            value={outputNaming}
            onChange={(e) => setOutputNaming(e.target.value)}
            placeholder="{title}_Report"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#7CC042]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {["{title}", "{date}", "{channel}"].map((token) => (
            <span
              key={token}
              className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-600 font-mono"
            >
              {token}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          Example output: <span className="font-mono">{outputNaming
            .replace("{title}", "Store Audit")
            .replace("{date}", "2026-06-02")
            .replace("{channel}", "Retail")}.pptx</span>
        </p>
      </div>
    </div>
  );
}
